import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandInspect } from '../src/inspection/command.mjs';
import { inspectProject } from '../src/inspection/inspection.mjs';
import { commandModel } from '../src/model-commands.mjs';
import { buildProjectModel, isBuilderManagedUnit } from '../src/model/builder.mjs';
import { stableStringify, validateProjectModel } from '../src/model/model.mjs';

const testRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testRoot, 'fixtures', 'inspection');
const fixedClock = () => new Date('2026-08-28T12:00:00.000Z');
const cleanup = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function copiedFixture(name) {
  const root = await mkdtemp(join(tmpdir(), `contexxxt-builder-${name}-`));
  cleanup.push(root);
  await cp(join(fixtureRoot, name), root, { recursive: true });
  return root;
}

test('builder creates a valid conservative model instead of one unit per file', async () => {
  const report = await inspectProject(join(fixtureRoot, 'simple-node'), { clock: fixedClock });
  const built = buildProjectModel(report);

  assert.deepEqual(await validateProjectModel(built.model), []);
  assert.deepEqual(built.proposals, []);
  assert.deepEqual(built.model.knowledge.map((unit) => [unit.id, unit.type]), [
    ['simple-node.observed.ci', 'artifact'],
    ['simple-node.observed.command.build', 'procedure'],
    ['simple-node.observed.command.test', 'procedure'],
    ['simple-node.observed.instructions', 'artifact'],
    ['simple-node.observed.structure', 'fact'],
  ]);
  assert.ok(built.model.knowledge.length < report.evidence.length);
  assert.match(built.model.knowledge.find((unit) => unit.id.endsWith('command.test')).statement, /did not execute or verify/);
});

test('builder keeps command summaries within schema budget for large monorepos', async () => {
  const report = await inspectProject(join(fixtureRoot, 'simple-node'), { clock: fixedClock });
  const template = report.catalog.manifests.commands.find((item) => item.category === 'test');
  report.catalog.manifests.commands = [
    ...report.catalog.manifests.commands.filter((item) => item.category !== 'test'),
    ...Array.from({ length: 40 }, (_, index) => ({
      ...template,
      package: `workspace-${index}`,
      scope: `packages/workspace-${index}`,
      name: `test:integration:workspace-${index}`,
    })),
  ];

  const built = buildProjectModel(report);
  const testUnit = built.model.knowledge.find((unit) => unit.id.endsWith('command.test'));

  assert.deepEqual(await validateProjectModel(built.model), []);
  assert.ok(testUnit.summary.length <= 240);
  assert.match(testUnit.summary, /more\.$/);
});

test('same InspectionReport builds idempotently and replaces no canonical Evidence type', async () => {
  const report = await inspectProject(join(fixtureRoot, 'monorepo'), { clock: fixedClock });
  const first = buildProjectModel(report).model;
  const second = buildProjectModel(report, first).model;

  assert.equal(stableStringify(second), stableStringify(first));
  assert.ok(second.evidence.every((item) => report.evidence.some((source) => source.id === item.id)));
});

test('builder preserves human knowledge and its source Evidence', async () => {
  const report = await inspectProject(join(fixtureRoot, 'simple-node'), { clock: fixedClock });
  const initial = buildProjectModel(report).model;
  const humanEvidence = {
    id: 'human.product-contract', type: 'human_statement', summary: 'The owner declared the product contract.',
    locator: { uri: 'human://owner/product-contract' }, digest: 'a'.repeat(64), observed_at: report.generated_at,
    provider: { id: 'human' }, authority: { level: 'governing', subject: 'product contract' }, sensitivity: 'internal',
  };
  const humanKnowledge = {
    id: 'product.contract', type: 'decision', summary: 'Human-owned product contract.', statement: 'This declaration must survive rebuilds.',
    dimensions: { what: 'complete', why: 'complete' }, scopes: [{ kind: 'project', value: initial.project.id }], evidence: [humanEvidence.id],
    provenance: { created_by: 'human', method: 'declared', created_at: report.generated_at },
    authority: { level: 'governing', subject: 'product contract', source: humanEvidence.id }, confidence: 1,
    validity: { observed_at: report.generated_at }, status: 'active',
  };
  initial.evidence.push(humanEvidence);
  initial.knowledge.push(humanKnowledge);

  const rebuilt = buildProjectModel(report, initial);

  assert.deepEqual(rebuilt.proposals, []);
  assert.deepEqual(rebuilt.model.knowledge.find((unit) => unit.id === humanKnowledge.id), humanKnowledge);
  assert.deepEqual(rebuilt.model.evidence.find((item) => item.id === humanEvidence.id), humanEvidence);
});

test('edited builder-owned knowledge is preserved and becomes a proposal instead of being overwritten', async () => {
  const report = await inspectProject(join(fixtureRoot, 'simple-node'), { clock: fixedClock });
  const initial = buildProjectModel(report).model;
  const edited = initial.knowledge.find((unit) => isBuilderManagedUnit(unit));
  edited.statement = 'Human edit that must not be clobbered.';

  const rebuilt = buildProjectModel(report, initial);

  assert.ok(rebuilt.proposals.some((proposal) => proposal.kind === 'managed-unit-drift' && proposal.id === edited.id));
  assert.equal(rebuilt.model.knowledge.find((unit) => unit.id === edited.id).statement, edited.statement);
});

test('removed observations retire unchanged generated units without touching human units', async () => {
  const report = await inspectProject(join(fixtureRoot, 'simple-node'), { clock: fixedClock });
  const initial = buildProjectModel(report).model;
  const reduced = structuredClone(report);
  reduced.catalog.manifests.commands = reduced.catalog.manifests.commands.filter((item) => item.category !== 'build');
  reduced.evidence = reduced.evidence.filter((item) => item.observation?.key !== 'command.build');

  const rebuilt = buildProjectModel(reduced, initial);

  assert.equal(rebuilt.model.knowledge.some((unit) => unit.id.endsWith('command.build')), false);
  assert.deepEqual(rebuilt.proposals, []);
});

test('public CLI flow consumes a saved report, writes canonically, validates and is idempotent', async () => {
  const root = await copiedFixture('simple-node');
  await commandInspect([root], { output: 'inspection-report.json' });

  const first = await commandModel(['build'], { root, inspection: 'inspection-report.json' });
  const validated = await commandModel(['validate'], { root });
  const modelBefore = await readFile(join(root, '.contexxxt', 'project-model.json'), 'utf8');
  const second = await commandModel(['build'], { root, inspection: 'inspection-report.json' });
  const modelAfter = await readFile(join(root, '.contexxxt', 'project-model.json'), 'utf8');

  assert.equal(first.code, 0);
  assert.equal(first.result.changes[0].action, 'created');
  assert.equal(validated.code, 0);
  assert.equal(second.result.changes[0].action, 'unchanged');
  assert.equal(modelAfter, modelBefore);
});

test('implicit inspect and build does not make the model depend on rereading itself', async () => {
  const root = await copiedFixture('simple-node');

  const first = await commandModel(['build'], { root });
  const modelBefore = await readFile(join(root, '.contexxxt', 'project-model.json'), 'utf8');
  const second = await commandModel(['build'], { root });
  const modelAfter = await readFile(join(root, '.contexxxt', 'project-model.json'), 'utf8');

  assert.equal(first.result.changes[0].action, 'created');
  assert.equal(second.result.changes[0].action, 'unchanged');
  assert.equal(modelAfter, modelBefore);
  assert.equal(JSON.parse(modelAfter).evidence.some((item) => item.observation?.key === 'contexxxt.project-model'), false);
});

test('invalid existing model blocks build without changing the file', async () => {
  const root = await copiedFixture('simple-node');
  const modelPath = join(root, '.contexxxt', 'project-model.json');
  await commandInspect([root], { output: 'inspection-report.json' });
  await commandModel(['build'], { root, inspection: 'inspection-report.json' });
  const invalid = '{"schema_version":"broken"}\n';
  await writeFile(modelPath, invalid, 'utf8');

  const result = await commandModel(['build'], { root, inspection: 'inspection-report.json' });

  assert.equal(result.code, 1);
  assert.match(result.result.summary, /no será sobrescrito/);
  assert.equal(await readFile(modelPath, 'utf8'), invalid);
});
