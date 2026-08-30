import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectProject } from '../src/inspection/inspection.mjs';
import { commandModel } from '../src/model-commands.mjs';
import { buildProjectModel } from '../src/model/builder.mjs';
import { buildDerivedIndexes, stableStringify } from '../src/model/model.mjs';
import { commandResolve } from '../src/resolve/command.mjs';
import { requiredDimensions, resolveTask, validateContextPacket, validateTaskResolution } from '../src/resolve/resolver.mjs';

const testRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testRoot, 'fixtures', 'inspection');
const fixedClock = () => new Date('2026-08-28T12:00:00.000Z');
const cleanup = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixtureModel(name) {
  const report = await inspectProject(join(fixtureRoot, name), { clock: fixedClock });
  const model = buildProjectModel(report).model;
  return { model, indexes: buildDerivedIndexes(model) };
}

async function copiedFixture(name) {
  const root = await mkdtemp(join(tmpdir(), `contexxxt-resolve-${name}-`));
  cleanup.push(root);
  await cp(join(fixtureRoot, name), root, { recursive: true });
  return root;
}

test('local fallback activates only task-relevant 7Q dimensions', () => {
  assert.deepEqual(requiredDimensions('Add a new query filter', undefined), ['what', 'how', 'for_what', 'where']);
  assert.deepEqual(requiredDimensions('Investigate why this architecture constraint exists', undefined), ['what', 'why', 'for_what', 'where']);
  assert.deepEqual(requiredDimensions('Publish the correct production release', undefined), ['what', 'how', 'for_what', 'which', 'who', 'where']);
  assert.deepEqual(requiredDimensions('anything', 'what,where'), ['what', 'where']);
});

test('resolver returns TaskResolution and a compact budgeted ContextPacket', async () => {
  const { model, indexes } = await fixtureModel('simple-node');
  const result = resolveTask(model, indexes, { target: 'src/index.js', intent: 'Add validation and run tests', maxBytes: 6000 });

  assert.equal(result.resolution.resolver.id, 'local-rules-v1');
  assert.equal(result.resolution.can_proceed, true);
  assert.deepEqual(result.resolution.required_dimensions, ['what', 'how', 'for_what', 'where']);
  assert.ok(result.packet.budget.emitted_bytes <= 6000);
  assert.equal(result.packet.budget.estimated_tokens, Math.ceil(result.packet.budget.emitted_bytes / 4));
  assert.ok(result.packet.procedures.some((item) => item.id.endsWith('command.test')));
  assert.ok(result.packet.verification_requirements.some((item) => item.kind === 'declared-command'));
  assert.ok(result.packet.inclusions.every((item) => item.reasons.length > 0));
  assert.deepEqual(await validateTaskResolution(result.resolution), []);
  assert.deepEqual(await validateContextPacket(result.packet), []);
});

test('unknown dimensions produce one high-value question and block proceed', async () => {
  const { model, indexes } = await fixtureModel('no-manifest');
  const result = resolveTask(model, indexes, { target: 'src/main.js', intent: 'Explain why this exists', maxBytes: 5000 });

  assert.equal(result.resolution.can_proceed, false);
  assert.ok(result.resolution.unknowns.includes('why'));
  assert.equal(result.resolution.questions.length, 1);
  assert.equal(result.resolution.questions[0].dimension, 'for_what');
});

test('disputed scoped instructions surface as a dimension conflict', async () => {
  const { model, indexes } = await fixtureModel('instructions-conflict');
  const result = resolveTask(model, indexes, { target: 'packages/api/index.js', intent: 'Change this file', maxBytes: 5000 });

  assert.equal(result.resolution.can_proceed, false);
  assert.ok(result.resolution.conflicts.some((item) => item.dimension === 'what'));
  assert.equal(result.resolution.questions.length, 1);
});

test('same model and request produce byte-identical resolution and packet', async () => {
  const { model, indexes } = await fixtureModel('simple-node');
  const input = { target: 'src/index.js', intent: 'Add a new test', maxBytes: 4096 };
  const first = resolveTask(model, indexes, input);
  const second = resolveTask(model, indexes, input);

  assert.equal(stableStringify(first), stableStringify(second));
});

test('tight budgets omit lower-ranked knowledge without exceeding bytes', async () => {
  const { model, indexes } = await fixtureModel('simple-node');
  const result = resolveTask(model, indexes, { target: 'src/index.js', intent: 'Add and test a build change', maxBytes: 2400 });

  assert.ok(result.packet.budget.emitted_bytes <= 2400);
  assert.equal(result.packet.budget.truncated, true);
  assert.ok(result.packet.budget.omitted_knowledge > 0);
});

test('public resolve command uses the canonical model and saves only explicit no-clobber output', async () => {
  const root = await copiedFixture('simple-node');
  await commandModel(['build'], { root });
  const result = await commandResolve([], { root, target: 'src/index.js', intent: 'Add a test', output: 'resolution.json' });

  assert.equal(result.code, 0);
  assert.deepEqual(result.result.changes, [{ action: 'created', path: 'resolution.json' }]);
  const saved = JSON.parse(await readFile(join(root, 'resolution.json'), 'utf8'));
  assert.equal(saved.resolution.id, result.result.data.resolution.id);
  await assert.rejects(() => commandResolve([], { root, target: 'src/index.js', intent: 'Add a test', output: 'resolution.json' }), /no se sobrescribirá/);
});
