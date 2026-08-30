import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHostAdapter, runBehavioralEval, runClosed, validateBehavioralSuite } from '../src/evaluation/behavioral-eval.mjs';
import { commandContext, commandQuery } from '../src/model-commands.mjs';
import { loadProjectModel } from '../src/model/model.mjs';
import { commandResolve } from '../src/resolve/command.mjs';

const fixtureModelPath = join(import.meta.dirname, 'fixtures', 'project-model', 'model.valid.json');
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const clock = () => new Date('2026-08-29T21:00:00.000Z');

function suite() {
  return {
    schema_version: '1.0.0',
    id: 'contexxxt.behavioral.fixture',
    candidate_skill: '.contexxxt/generated/skills/contexxxt-core-development',
    cases: [{
      id: 'query-boundary',
      target: 'src/payments/webhook.ts',
      intent: 'Explain why the webhook is authoritative',
      prompt: 'Why is the payment webhook authoritative?',
      expected_terms: ['webhook', 'authoritative'],
      forbidden_terms: ['browser redirect is authoritative'],
      required_evidence_ids: ['payments.webhook.authority']
    }]
  };
}

function fakeAdapter() {
  return {
    id: 'codex',
    async version() { return 'codex-test'; },
    async execute({ prompt }) {
      const enriched = prompt.includes('Contexxxt ContextPacket:');
      const candidate = prompt.includes('Candidate skill instructions:');
      return {
        output: enriched ? 'The webhook is authoritative. Evidence: payments.webhook.authority.' : 'The webhook handles callbacks.',
        tokens: candidate ? 140 : enriched ? 120 : 80,
        tool_calls: enriched ? 0 : 2,
        duration_ms: candidate ? 15 : enriched ? 12 : 20,
      };
    }
  };
}

test('behavioral suite schema is versioned and rejects duplicate case IDs', async () => {
  assert.deepEqual(await validateBehavioralSuite(suite()), []);
  const invalid = suite();
  invalid.cases.push(structuredClone(invalid.cases[0]));
  assert.ok((await validateBehavioralSuite(invalid)).some((item) => item.code === 'duplicate-case-id'));
});

test('runner compares baseline, context, and candidate while preserving raw metrics', async () => {
  const model = JSON.parse(await readFile(fixtureModelPath, 'utf8'));
  const run = await runBehavioralEval({
    root: import.meta.dirname,
    model,
    suite: suite(),
    hostAdapter: fakeAdapter(),
    variants: ['baseline', 'context', 'candidate'],
    skill: 'Use contexxxt before work.',
    clock,
  });

  assert.equal(run.results.length, 3);
  assert.equal(run.summaries.baseline.pass_rate < run.summaries.context.pass_rate, true);
  assert.equal(run.comparisons.context.quality_delta > 0, true);
  assert.equal(run.comparisons.context.reference_variant, 'baseline');
  assert.equal(run.comparisons.candidate.reference_variant, 'context');
  assert.equal(run.comparisons.candidate.quality_delta, 0);
  assert.equal(run.claims.context, 'measured-positive-on-this-run');
  assert.equal(run.claims.candidate, 'no-measured-quality-difference');
  assert.equal(run.summaries.context.context_bytes > 0, true);
  assert.equal(run.summaries.baseline.tool_calls, 2);
  assert.equal(run.repository.commit, model.snapshot.revision.commit);
});

test('EvalRun identity is reproducible while timestamps remain observation metadata', async () => {
  const model = JSON.parse(await readFile(fixtureModelPath, 'utf8'));
  const first = await runBehavioralEval({ root: import.meta.dirname, model, suite: suite(), hostAdapter: fakeAdapter(), variants: ['baseline', 'context'], clock });
  const second = await runBehavioralEval({ root: import.meta.dirname, model, suite: suite(), hostAdapter: fakeAdapter(), variants: ['baseline', 'context'], clock: () => new Date('2026-08-30T00:00:00Z') });

  assert.equal(first.id, second.id);
  assert.notEqual(first.created_at, second.created_at);
});

test('Codex and Claude adapters preserve provider-specific output and usage instead of forcing false parity', async () => {
  const codexCalls = [];
  const claudeCalls = [];
  const codexRun = async (_command, args) => {
    codexCalls.push(args);
    if (args[0] === '--version') return { stdout: 'codex-cli test\n' };
    return { stdout: `${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'codex answer' } })}\n${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } })}\n` };
  };
  const claudeRun = async (_command, args, options) => {
    claudeCalls.push({ args, options });
    if (args[0] === '--version') return { stdout: 'claude test\n' };
    return { stdout: JSON.stringify({ result: 'claude answer', usage: { input_tokens: 12, output_tokens: 4 }, num_turns: 1, total_cost_usd: 0.01, modelUsage: { 'claude-test': {} } }) };
  };
  const codex = createHostAdapter('codex', { run: codexRun });
  const claude = createHostAdapter('claude-code', { run: claudeRun });

  assert.equal((await codex.execute({ root: import.meta.dirname, prompt: 'test' })).tokens, 15);
  const claudeResult = await claude.execute({ root: import.meta.dirname, prompt: 'test' });
  assert.equal(claudeResult.tokens, 16);
  assert.equal(claudeResult.tool_calls, null);
  assert.equal(claudeResult.cost_usd, 0.01);
  assert.equal(claudeResult.model, 'claude-test');
  assert.ok(codexCalls[0].includes('--sandbox') || codexCalls[1].includes('--sandbox'));
  assert.equal(claudeCalls[0].options.cwd, import.meta.dirname);
  assert.equal(claudeCalls[0].options.timeout, 90000);
  assert.deepEqual(claudeCalls[0].args.slice(0, 8), ['-p', 'test', '--output-format', 'json', '--permission-mode', 'dontAsk', '--no-session-persistence', '--tools']);
  assert.equal(claudeCalls[0].args[8], '');
});

test('shared host transport closes stdin and enforces timeout', async () => {
  const closed = await runClosed(process.execPath, ['-e', "process.stdin.on('end', () => process.stdout.write('closed')); process.stdin.resume();"], { timeout: 2000 });
  assert.equal(closed.stdout, 'closed');
  await assert.rejects(
    runClosed(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 30 }),
    (error) => error.code === 'ETIMEDOUT',
  );
});

test('Claude authentication failures persist explicit unavailable metrics and classification', async () => {
  const model = JSON.parse(await readFile(fixtureModelPath, 'utf8'));
  const hostAdapter = {
    id: 'claude-code',
    async version() { return 'claude test'; },
    async execute() {
      const error = new Error('claude exited with code 1');
      error.stderr = 'Failed to authenticate: OAuth session expired and could not be refreshed';
      throw error;
    },
  };
  const run = await runBehavioralEval({ root: import.meta.dirname, model, suite: suite(), hostAdapter, variants: ['baseline', 'context', 'candidate'], skill: 'test', clock });

  assert.equal(run.execution_errors, 3);
  assert.equal(run.results.every((item) => item.status === 'execution-error'), true);
  assert.equal(run.results.every((item) => item.error_classification === 'authentication-error'), true);
  assert.equal(run.summaries.baseline.tokens, null);
  assert.equal(run.summaries.baseline.tool_calls, null);
  assert.equal(run.comparisons.context.token_delta, null);
  assert.equal(run.claims.context, 'not-measurable-execution-error');
});

test('suite validation rejects required evidence IDs the Project Model cannot resolve', async () => {
  const model = JSON.parse(await readFile(fixtureModelPath, 'utf8'));
  assert.deepEqual(await validateBehavioralSuite(suite(), model), []);

  const unsatisfiable = suite();
  unsatisfiable.cases[0].required_evidence_ids = ['payments.webhook-source-of-truth'];
  assert.deepEqual(await validateBehavioralSuite(unsatisfiable), []);
  const errors = await validateBehavioralSuite(unsatisfiable, model);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'unresolvable-evidence-id');
  assert.match(errors[0].message, /payments\.webhook-source-of-truth/);
});

test('real dogfood model exposes its canonical validation contract through public retrieval', async () => {
  const loaded = await loadProjectModel(repositoryRoot);
  assert.deepEqual(loaded.errors, []);
  const behavioralSuite = JSON.parse(await readFile(join(repositoryRoot, 'evals', 'core-behavioral.json'), 'utf8'));
  assert.deepEqual(await validateBehavioralSuite(behavioralSuite, loaded.model), []);

  const invalidGroundTruth = structuredClone(behavioralSuite);
  invalidGroundTruth.cases.find((item) => item.id === 'model-validation-command').required_evidence_ids = ['contexxxt.model.missing'];
  assert.ok((await validateBehavioralSuite(invalidGroundTruth, loaded.model)).some((item) => item.code === 'unresolvable-evidence-id'));

  const knowledge = await commandQuery(['knowledge', 'contexxxt.model.validation-contract'], { root: repositoryRoot, view: 'detail' });
  assert.equal(knowledge.result.data.items[0].id, 'contexxxt.model.validation-contract');
  assert.match(knowledge.result.data.items[0].statement, /\.contexxxt\/project-model\.json/);
  assert.match(knowledge.result.data.items[0].statement, /packages\/cli\/schemas\/project-model\.schema\.json/);
  assert.match(knowledge.result.data.items[0].statement, /contexxxt model validate/);
  assert.deepEqual(knowledge.result.data.items[0].evidence, [
    'ev.contexxxt.model-cli',
    'ev.contexxxt.model-schema',
    'ev.contexxxt.model-validation-code',
    'ev.contexxxt.project-model',
  ]);

  const context = await commandContext(['packages/cli/src/model/model.mjs'], {
    root: repositoryRoot,
    dimensions: 'what,how,for_what,which,where',
    view: 'detail',
    maxBytes: '16000',
  });
  assert.ok(context.result.data.knowledge.some((item) => item.id === 'contexxxt.model.validation-contract'));

  const resolved = await commandResolve([], {
    root: repositoryRoot,
    target: 'packages/cli/src/model/model.mjs',
    intent: 'Validate the canonical Project Model before using it',
    dimensions: 'what,how,for_what,which,where',
    maxBytes: '16000',
  });
  const packet = JSON.stringify(resolved.result.data.packet);
  assert.match(packet, /contexxxt\.model\.validation-contract/);
  assert.match(packet, /\.contexxxt\/project-model\.json/);
  assert.match(packet, /packages\/cli\/schemas\/project-model\.schema\.json/);
  assert.match(packet, /contexxxt model validate/);
});

test('a zero-filled usage envelope on a failed Claude turn stays unavailable instead of becoming zero tokens', async () => {
  const authFailure = JSON.stringify({
    is_error: true,
    terminal_reason: 'api_error',
    result: 'Failed to authenticate: OAuth session expired and could not be refreshed',
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  });
  const claude = createHostAdapter('claude-code', {
    run: async (_command, args) => {
      if (args[0] === '--version') return { stdout: 'claude test\n' };
      return { stdout: authFailure };
    },
  });
  const failed = await claude.execute({ root: import.meta.dirname, prompt: 'test' });
  assert.equal(failed.tokens, null);
  assert.ok(failed.error);

  const partial = createHostAdapter('claude-code', {
    run: async (_command, args) => {
      if (args[0] === '--version') return { stdout: 'claude test\n' };
      return { stdout: JSON.stringify({ is_error: true, result: 'stopped', usage: { input_tokens: 30, output_tokens: 7 } }) };
    },
  });
  assert.equal((await partial.execute({ root: import.meta.dirname, prompt: 'test' })).tokens, 37);
});

test('an authentication failure reported as a structured payload never aggregates into measured token totals', async () => {
  const model = JSON.parse(await readFile(fixtureModelPath, 'utf8'));
  const hostAdapter = createHostAdapter('claude-code', {
    run: async (_command, args) => {
      if (args[0] === '--version') return { stdout: 'claude test\n' };
      return {
        stdout: JSON.stringify({
          is_error: true,
          result: 'Failed to authenticate: OAuth session expired and could not be refreshed',
          usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        }),
      };
    },
  });
  const run = await runBehavioralEval({ root: import.meta.dirname, model, suite: suite(), hostAdapter, variants: ['baseline', 'context'], clock });

  assert.equal(run.execution_errors, 2);
  assert.equal(run.results.every((item) => item.error_classification === 'authentication-error'), true);
  assert.equal(run.results.every((item) => item.metrics.tokens === null), true);
  assert.equal(run.summaries.baseline.tokens, null);
  assert.equal(run.summaries.context.tokens, null);
  assert.equal(run.comparisons.context.token_delta, null);
  assert.equal(run.claims.context, 'not-measurable-execution-error');
});

test('a Claude transport failure is classified from the transport error, not from the model answer text', async () => {
  const model = JSON.parse(await readFile(fixtureModelPath, 'utf8'));
  const payload = {
    result: 'The canonical Project Model path is .contexxxt/project-model.json and it is checked with contexxxt model validate.',
    usage: { input_tokens: 10, output_tokens: 5 },
    is_error: false,
    num_turns: 1,
  };
  const run = async (_command, args) => {
    if (args.includes('--version')) return { stdout: 'claude test', stderr: '' };
    const error = new Error('Process timed out after 90000ms.');
    error.code = 'ETIMEDOUT';
    error.stdout = JSON.stringify(payload);
    error.stderr = '';
    throw error;
  };
  const evalRun = await runBehavioralEval({
    root: import.meta.dirname,
    model,
    suite: suite(),
    hostAdapter: createHostAdapter('claude-code', { run }),
    variants: ['baseline'],
    clock,
  });
  const [result] = evalRun.results;
  assert.equal(result.status, 'execution-error');
  assert.equal(result.error_classification, 'timeout');
  assert.match(result.error, /timed out/i);
  assert.doesNotMatch(result.error, /project-model\.json/);
});

test('the shared transport enforces its timeout even when the child ignores SIGTERM', { timeout: 20000 }, async () => {
  const started = Date.now();
  await assert.rejects(
    runClosed(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], { timeout: 500 }),
    (error) => error.code === 'ETIMEDOUT',
  );
  assert.ok(Date.now() - started < 10000, `transport must settle promptly; took ${Date.now() - started}ms`);
});
