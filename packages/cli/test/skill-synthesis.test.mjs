import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { commandSkill } from '../src/skills/command.mjs';
import { emptyLearningStore, ingestObservation, validateExecutionObservation, validateLearningStore } from '../src/learning/learning.mjs';

const cleanup = [];
const generatedAt = '2026-08-29T20:30:00.000Z';

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'contexxxt-skill-'));
  cleanup.push(root);
  return root;
}

async function save(root, path, value) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function skillObservation(id, evidence, observedAt = generatedAt) {
  return {
    schema_version: '1.0.0',
    id,
    task: { intent: 'Use contexxxt before a non-trivial core change', target: 'packages/cli/src' },
    revision: { before: '1234567', after: '1234567', dirty: true },
    verification: [{ id: evidence, status: 'passed', summary: 'Public resolve and observation workflow completed.' }],
    assertions: [{
      id: `assertion.${id}`,
      kind: 'possible_skill',
      statement: 'Route non-trivial contexxxt core changes through the public resolve, verification, and observation loop.',
      scopes: [{ kind: 'package', value: 'packages/cli' }],
      confidence: 0.92,
      authority: 'supporting',
      evidence_refs: [evidence],
      repeat_key: 'contexxxt-core-development-routing',
      risk: 'low',
      suggested_form: 'skill',
      skill_contract: {
        name: 'contexxxt-core-development',
        description: 'Use for non-trivial changes to contexxxt core commands, Project Model contracts, Query Layer, resolver, providers, learning, skills, or evals. Route the task through contexxxt resolve, scoped retrieval, verification, and structured observation.',
        positive_triggers: [
          'Add a new filter to the contexxxt Query Layer and preserve deterministic budgets.',
          'Change the Project Model schema and update the resolver contract safely.'
        ],
        negative_triggers: [
          'Fix a typo in the public landing page heading without changing product behavior.',
          'Explain what contexxxt is without modifying files or running a development workflow.'
        ],
        boundary_triggers: [
          { prompt: 'Update README wording because a core command changed its actual behavior.', should_trigger: true },
          { prompt: 'Translate one README sentence with no product claim change.', should_trigger: false }
        ],
        workflow: [
          'Run contexxxt resolve for the target and human intent, then inspect only unresolved decision-relevant gaps.',
          'Implement the smallest coherent change while respecting the packet constraints and source authority.',
          'Run deterministic verification from the packet and capture an ExecutionObservation without transcript or secrets.'
        ],
        verification: [
          'Run the relevant focused tests and pnpm check before closing a core phase gate.',
          'Confirm generated artifacts are no-clobber and the Project Model did not change silently.'
        ]
      }
    }],
    observed_at: observedAt
  };
}

async function supportedSkillStore() {
  const first = skillObservation('observation.skill-route.1', 'verification.skill-route.1');
  const second = skillObservation('observation.skill-route.2', 'verification.skill-route.2', '2026-08-29T20:31:00.000Z');
  assert.deepEqual(await validateExecutionObservation(first), []);
  const once = ingestObservation(emptyLearningStore(generatedAt), first);
  const twice = ingestObservation(once.store, second);
  assert.equal(twice.store.candidates[0].status, 'supported');
  assert.deepEqual(await validateLearningStore(twice.store), []);
  return twice.store;
}

test('non-skill or smaller-artifact candidates are rejected without writing a bundle', async () => {
  const root = await tempRoot();
  const store = await supportedSkillStore();
  const candidate = store.candidates[0];
  candidate.kind = 'procedure';
  candidate.suggested_form = 'procedure';
  delete candidate.skill_contract;
  await save(root, '.contexxxt/learning-candidates.json', store);

  const result = await commandSkill(['synthesize', candidate.id], { root, at: generatedAt });
  assert.equal(result.code, 1);
  assert.ok(result.result.data.failures.includes('candidate-kind-is-not-skill'));
  assert.ok(result.result.data.failures.includes('smaller-artifact-preferred'));
  await assert.rejects(readFile(join(root, '.contexxxt', 'generated', 'skills', 'contexxxt-core-development', 'SKILL.md')), { code: 'ENOENT' });
});

test('supported skill candidate compiles a thin, valid, unpromoted bundle', async () => {
  const root = await tempRoot();
  const store = await supportedSkillStore();
  const candidate = store.candidates[0];
  await save(root, '.contexxxt/learning-candidates.json', store);

  const generated = await commandSkill(['synthesize', candidate.id], { root, at: generatedAt });
  assert.equal(generated.code, 0);
  assert.equal(generated.result.data.status, 'generated');
  assert.equal(generated.result.data.promoted, false);
  const path = '.contexxxt/generated/skills/contexxxt-core-development';
  const validated = await commandSkill(['validate', path], { root });
  const evaluated = await commandSkill(['eval', path], { root });
  const skill = await readFile(join(root, path, 'SKILL.md'), 'utf8');
  const manifest = JSON.parse(await readFile(join(root, path, 'manifest.json'), 'utf8'));

  assert.equal(validated.code, 0);
  assert.equal(evaluated.code, 0);
  assert.equal(evaluated.result.data.behavioral_comparison.status, 'not-run');
  assert.ok(Buffer.byteLength(skill) < 12000);
  assert.equal(manifest.promotion.generated_is_promoted, false);
  assert.equal(manifest.canonical_knowledge_source, '.contexxxt/project-model.json');
});

test('same candidate and timestamp regenerate idempotently', async () => {
  const root = await tempRoot();
  const store = await supportedSkillStore();
  const candidate = store.candidates[0];
  await save(root, '.contexxxt/learning-candidates.json', store);
  await commandSkill(['synthesize', candidate.id], { root, at: generatedAt });
  const second = await commandSkill(['synthesize', candidate.id], { root, at: generatedAt });

  assert.equal(second.code, 0);
  assert.equal(second.result.data.status, 'unchanged');
  assert.ok(second.result.changes.every((item) => item.action === 'unchanged'));
});

test('manual drift in a generated skill is preserved and reported as proposal-required', async () => {
  const root = await tempRoot();
  const store = await supportedSkillStore();
  const candidate = store.candidates[0];
  await save(root, '.contexxxt/learning-candidates.json', store);
  await commandSkill(['synthesize', candidate.id], { root, at: generatedAt });
  const skillPath = join(root, '.contexxxt', 'generated', 'skills', 'contexxxt-core-development', 'SKILL.md');
  const edited = `${await readFile(skillPath, 'utf8')}\nHuman-owned edit.\n`;
  await writeFile(skillPath, edited, 'utf8');

  const result = await commandSkill(['synthesize', candidate.id], { root, at: generatedAt });
  assert.equal(result.code, 1);
  assert.equal(result.result.data.status, 'proposal-required');
  assert.equal(await readFile(skillPath, 'utf8'), edited);
});
