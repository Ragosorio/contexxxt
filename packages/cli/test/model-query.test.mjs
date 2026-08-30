import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runQueryEval } from '../src/evaluation/query-eval.mjs';
import { buildDerivedIndexes, stableStringify, validateProjectModel } from '../src/model/model.mjs';
import { buildTargetContext, executeQuery } from '../src/query/query.mjs';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'project-model');

async function fixture(name) {
  return JSON.parse(await readFile(join(fixtureRoot, name), 'utf8'));
}

async function validModel() {
  const model = await fixture('model.valid.json');
  const errors = await validateProjectModel(model);
  assert.deepEqual(errors, []);
  return { model, indexes: buildDerivedIndexes(model) };
}

function ids(result) {
  return result.items.map((item) => typeof item === 'string' ? item : item.id);
}

test('canonical fixture validates against schema and semantic references', async () => {
  const model = await fixture('model.valid.json');
  assert.deepEqual(await validateProjectModel(model), []);
});

test('lookup by knowledge and evidence ID returns detail without scanning in the agent', async () => {
  const { model, indexes } = await validModel();
  const knowledge = executeQuery(model, indexes, 'knowledge', 'payments.idempotency');
  const summary = executeQuery(model, indexes, 'knowledge', 'payments.idempotency', { view: 'summary' });
  const evidence = executeQuery(model, indexes, 'evidence', 'ev.payments.webhook-code');

  assert.equal(knowledge.items[0].id, 'payments.idempotency');
  assert.match(knowledge.items[0].statement, /at most once/);
  assert.equal(summary.items[0].summary, 'Payment transitions must be idempotent.');
  assert.equal(Object.hasOwn(summary.items[0], 'statement'), false);
  assert.equal(evidence.items[0].locator.uri, 'src/payments/webhook.ts');
});

test('target ordering uses the scope that matched instead of an unrelated broader ranking', async () => {
  const { model } = await validModel();
  const template = model.knowledge.find((unit) => unit.id === 'payments.idempotency');
  model.knowledge.push(
    { ...structuredClone(template), id: 'scope.general', summary: 'General payment scope.', statement: 'General scope applies.', scopes: [{ kind: 'directory', value: 'src/payments' }], confidence: 0.9 },
    { ...structuredClone(template), id: 'scope.file', summary: 'Specific webhook scope.', statement: 'Specific file scope applies.', scopes: [{ kind: 'file', value: 'src/payments/webhook.ts' }], confidence: 0.8 },
  );
  const indexes = buildDerivedIndexes(model);
  const result = executeQuery(model, indexes, 'scope', 'src/payments/webhook.ts', { view: 'ids' });

  assert.ok(ids(result).indexOf('scope.file') < ids(result).indexOf('scope.general'));
});

test('lookup by dimension is compact and stably ordered by authority, scope and confidence', async () => {
  const { model, indexes } = await validModel();
  const result = executeQuery(model, indexes, 'dimension', 'which', { view: 'ids' });

  assert.deepEqual(ids(result), [
    'payments.webhook.authority',
    'payments.retry.limit-five',
    'payments.retry.limit-three',
  ]);
});

test('scope lookup resolves directories, files and multiple typed scopes', async () => {
  const { model, indexes } = await validModel();
  const file = executeQuery(model, indexes, 'scope', 'src/payments/webhook.ts', { view: 'ids' });
  const domain = executeQuery(model, indexes, 'scope', 'domain:payments', { view: 'ids' });
  const orders = executeQuery(model, indexes, 'scope', 'src/orders/create.ts', { view: 'ids' });

  assert.ok(ids(file).includes('payments.idempotency'));
  assert.ok(ids(file).includes('payments.retry.procedure'));
  assert.deepEqual(ids(domain), ['payments.owner', 'payments.webhook.authority']);
  assert.deepEqual(ids(orders), ['orders.unrelated']);
});

test('superseded knowledge is hidden by default and available on explicit drill-down', async () => {
  const { model, indexes } = await validModel();
  const current = executeQuery(model, indexes, 'decisions', undefined, { view: 'ids' });
  const history = executeQuery(model, indexes, 'decisions', undefined, { view: 'ids', include: 'superseded' });
  const legacy = executeQuery(model, indexes, 'knowledge', 'payments.legacy.redirect');

  assert.equal(ids(current).includes('payments.legacy.redirect'), false);
  assert.equal(ids(history).includes('payments.legacy.redirect'), true);
  assert.equal(legacy.items[0].effective_status, 'superseded');
});

test('stale evaluation is deterministic against snapshot.as_of or explicit --at', async () => {
  const { model, indexes } = await validModel();
  const snapshot = executeQuery(model, indexes, 'stale', undefined, { view: 'ids' });
  const earlier = executeQuery(model, indexes, 'stale', undefined, { view: 'ids', at: '2025-12-01' });

  assert.deepEqual(ids(snapshot), ['payments.timeout.legacy']);
  assert.deepEqual(ids(earlier), []);
});

test('conflicts exclude superseded history and retain active competing decisions', async () => {
  const { model, indexes } = await validModel();
  const result = executeQuery(model, indexes, 'conflicts', undefined, { view: 'ids' });

  assert.deepEqual(ids(result), ['payments.retry.limit-five', 'payments.retry.limit-three']);
});

test('target context marks omitted dimensions not-required and exposes provenance IDs', async () => {
  const { model, indexes } = await validModel();
  const result = buildTargetContext(model, indexes, 'src/payments/webhook.ts', {
    dimensions: 'what,why,how,for_what,which,where',
  });

  assert.equal(result.dimensions.who.status, 'not-required');
  assert.equal(result.dimensions.which.status, 'conflicted');
  assert.equal(result.conflicts.length, 1);
  assert.ok(result.evidence.includes('ev.payments.docs'));
  assert.ok(result.knowledge.every((item) => item.id && item.authority && item.evidence));
});

test('broken references are rejected with actionable deterministic errors', async () => {
  const model = await fixture('model.broken-ref.json');
  const errors = await validateProjectModel(model);

  assert.ok(errors.some((error) => error.code === 'broken-evidence-reference' && error.message.includes('ev.missing')));
});

test('empty queries return an empty result instead of dumping the model', async () => {
  const { model, indexes } = await validModel();
  const result = executeQuery(model, indexes, 'scope', 'src/unknown', { view: 'summary' });

  assert.deepEqual(result.items, []);
  assert.equal(result.budget.truncated, false);
});

test('budgets truncate deterministically and report omissions', async () => {
  const { model, indexes } = await validModel();
  const result = executeQuery(model, indexes, 'scope', 'src/payments/webhook.ts', { max_bytes: '700', limit: '20' });

  assert.equal(result.budget.truncated, true);
  assert.ok(result.budget.omitted > 0);
  assert.ok(result.budget.emitted_bytes <= 700);
});

test('the same model, query and budget produce byte-identical structured output', async () => {
  const { model, indexes } = await validModel();
  const first = executeQuery(model, indexes, 'scope', 'src/payments', { view: 'summary', limit: '4', max_bytes: '4096' });
  const second = executeQuery(model, indexes, 'scope', 'src/payments', { view: 'summary', limit: '4', max_bytes: '4096' });

  assert.equal(stableStringify(first), stableStringify(second));
});

test('query eval foundation produces a reproducible EvalRun', async () => {
  const { model, indexes } = await validModel();
  const suite = await fixture('query-suite.json');
  const first = runQueryEval(model, indexes, suite);
  const second = runQueryEval(model, indexes, suite);

  assert.equal(first.ok, true);
  assert.equal(first.passed, 3);
  assert.deepEqual(first, second);
});
