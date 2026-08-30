import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { commandLearning, commandObserve } from '../src/learning/command.mjs';
import {
  detectRevisionDrift,
  emptyLearningStore,
  ingestObservation,
  validateExecutionObservation,
  validateLearningStore,
} from '../src/learning/learning.mjs';
import { stableStringify } from '../src/model/model.mjs';

const cleanup = [];
const at = '2026-08-29T12:00:00.000Z';

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'contexxxt-learning-'));
  cleanup.push(root);
  return root;
}

function observation({ id = 'observation.query-filter.1', observedAt = at, evidence = 'verification.query-tests.1', secret = false } = {}) {
  return {
    schema_version: '1.0.0',
    id,
    task: { intent: 'Add a query filter', target: 'packages/cli/src/query/query.mjs' },
    revision: { before: '1234567', after: '1234567', dirty: true },
    verification: [{ id: evidence, status: 'passed', summary: 'Query tests passed.', command: 'node --test query.test.mjs' }],
    assertions: [{
      id: `assertion.${id}`,
      kind: 'new_procedure',
      statement: secret ? 'Use token sk-abcdefghijklmnopqrstuvwxyz1234' : 'Every new query filter requires a positive, empty-result, budget, and stable-order case.',
      scopes: [{ kind: 'directory', value: 'packages/cli/src/query' }],
      confidence: 0.9,
      authority: 'supporting',
      evidence_refs: [evidence],
      repeat_key: 'query-filter-test-contract',
      risk: 'low',
      suggested_form: 'procedure',
    }],
    observed_at: observedAt,
  };
}

async function save(root, name, value) {
  await mkdir(dirname(join(root, name)), { recursive: true });
  await writeFile(join(root, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('ExecutionObservation accepts structured verification and rejects likely secret values', async () => {
  assert.deepEqual(await validateExecutionObservation(observation()), []);
  const errors = await validateExecutionObservation(observation({ secret: true }));
  assert.ok(errors.some((item) => item.code === 'possible-secret'));
});

test('ingest creates one candidate and the same observation is idempotent', async () => {
  const store = emptyLearningStore(at);
  const first = ingestObservation(store, observation());
  const second = ingestObservation(first.store, observation());

  assert.equal(first.store.candidates.length, 1);
  assert.equal(first.store.candidates[0].status, 'candidate');
  assert.deepEqual(second.changes, [{ action: 'unchanged', id: first.store.candidates[0].id }]);
  assert.equal(stableStringify(first.store), stableStringify(second.store));
  assert.deepEqual(await validateLearningStore(first.store), []);
});

test('two distinct observations support a repeated candidate without promoting it', () => {
  const first = ingestObservation(emptyLearningStore(at), observation());
  const secondObservation = observation({ id: 'observation.query-filter.2', observedAt: '2026-08-29T13:00:00.000Z', evidence: 'verification.query-tests.2' });
  const second = ingestObservation(first.store, secondObservation);
  const candidate = second.store.candidates[0];

  assert.equal(candidate.status, 'supported');
  assert.equal(candidate.support_count, 2);
  assert.equal(candidate.transition_log.at(-1).to, 'supported');
  assert.notEqual(candidate.status, 'promoted');
});

test('public observation ingest archives structured evidence and does not touch Project Model', async () => {
  const root = await tempRoot();
  await save(root, 'observation.json', observation());
  const modelMarker = join(root, '.contexxxt', 'project-model.json');
  const result = await commandObserve(['ingest', 'observation.json'], { root });

  assert.equal(result.code, 0);
  assert.equal(result.result.data.canonical_model_changed, false);
  await assert.rejects(readFile(modelMarker), { code: 'ENOENT' });
  const archived = JSON.parse(await readFile(join(root, '.contexxxt', 'observations', 'observation.query-filter.1.json'), 'utf8'));
  assert.equal(archived.id, 'observation.query-filter.1');

  const second = await commandObserve(['ingest', 'observation.json'], { root });
  assert.ok(second.result.changes.every((item) => item.action === 'unchanged'));
});

test('observation ID conflicts are blocked without overwriting the archive', async () => {
  const root = await tempRoot();
  const first = observation();
  await save(root, 'observation.json', first);
  await commandObserve(['ingest', 'observation.json'], { root });
  const changed = structuredClone(first);
  changed.task.intent = 'Different task';
  await save(root, 'observation-changed.json', changed);

  await assert.rejects(() => commandObserve(['ingest', 'observation-changed.json'], { root }), /Observation ID conflict/);
  const archived = JSON.parse(await readFile(join(root, '.contexxxt', 'observations', `${first.id}.json`), 'utf8'));
  assert.equal(archived.task.intent, first.task.intent);
});

test('promotion requires a supported candidate, passing comparison, and writes only a proposal', async () => {
  const root = await tempRoot();
  const first = observation();
  const second = observation({ id: 'observation.query-filter.2', observedAt: '2026-08-29T13:00:00.000Z', evidence: 'verification.query-tests.2' });
  await save(root, 'first.json', first);
  await save(root, 'second.json', second);
  await commandObserve(['ingest', 'first.json'], { root });
  await commandObserve(['ingest', 'second.json'], { root });
  const store = JSON.parse(await readFile(join(root, '.contexxxt', 'learning-candidates.json'), 'utf8'));
  const id = store.candidates[0].id;
  await save(root, 'eval.json', { ok: true, comparison: { improvement: 0.2 }, critical_failures: [] });

  const result = await commandLearning(['promote', id], {
    root, eval: 'eval.json', output: '.contexxxt/proposals/query-procedure.json', at,
  });
  assert.equal(result.code, 0);
  assert.equal(result.result.data.candidate.status, 'promoted');
  assert.equal(result.result.data.canonical_model_changed, false);
  const proposal = JSON.parse(await readFile(join(root, '.contexxxt', 'proposals', 'query-procedure.json'), 'utf8'));
  assert.equal(proposal.canonical_model_changed, false);
  await assert.rejects(readFile(join(root, '.contexxxt', 'project-model.json')), { code: 'ENOENT' });
});

test('failed or non-improving eval rejects promotion and produces no proposal', async () => {
  const root = await tempRoot();
  const first = ingestObservation(emptyLearningStore(at), observation());
  const second = ingestObservation(first.store, observation({ id: 'observation.query-filter.2', evidence: 'verification.query-tests.2' }));
  await save(root, '.contexxxt/learning-candidates.json', second.store);
  await save(root, 'eval.json', { ok: true, comparison: { improvement: 0 }, critical_failures: [] });
  const id = second.store.candidates[0].id;

  const result = await commandLearning(['promote', id], { root, eval: 'eval.json', output: 'proposal.json', at });
  assert.equal(result.code, 1);
  await assert.rejects(readFile(join(root, 'proposal.json')), { code: 'ENOENT' });
});

test('revision drift is read-only, deterministic, and marks revision-bound knowledge', () => {
  const model = {
    snapshot: { revision: { commit: 'aaaaaaa' } },
    knowledge: [{ id: 'rule.one', revision_binding: { valid_at_commit: 'bbbbbbb' } }],
  };
  const report = { repository: { git: { head: 'ccccccc' } } };
  const first = detectRevisionDrift(model, report, at);
  const second = detectRevisionDrift(model, report, at);

  assert.equal(first.events.length, 2);
  assert.deepEqual(first, second);
  assert.deepEqual(first.events[1].affected, ['rule.one']);
});
