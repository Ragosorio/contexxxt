import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hash } from '../lib.mjs';
import { buildDerivedIndexes, stableStringify } from '../model/model.mjs';
import { validateJsonSchema } from '../model/json-schema.mjs';
import { resolveTask } from '../resolve/resolver.mjs';

const schemaPath = fileURLToPath(new URL('../../schemas/behavioral-eval-suite.schema.json', import.meta.url));

export function runClosed(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let killTimer = null;
    const clearTimers = () => { if (timeout) clearTimeout(timeout); if (killTimer) clearTimeout(killTimer); };
    const timeout = options.timeout ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, options.killGraceMs ?? 5000);
    }, options.timeout) : null;
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => { clearTimers(); reject(error); });
    child.on('close', (code) => {
      clearTimers();
      const output = Buffer.concat(stdout).toString(options.encoding ?? 'utf8');
      const diagnostic = Buffer.concat(stderr).toString(options.encoding ?? 'utf8');
      if (code === 0 && !timedOut) resolve({ stdout: output, stderr: diagnostic });
      else {
        const error = new Error(timedOut ? `Process timed out after ${options.timeout}ms.` : `${command} exited with code ${code}.`);
        error.code = timedOut ? 'ETIMEDOUT' : code;
        error.stdout = output;
        error.stderr = diagnostic;
        reject(error);
      }
    });
    child.stdin.end();
  });
}

export async function validateBehavioralSuite(suite, model = null) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const errors = validateJsonSchema(suite, schema);
  const ids = new Set();
  const resolvable = model ? new Set([...(model.knowledge ?? []).map((unit) => unit.id), ...(model.evidence ?? []).map((unit) => unit.id)]) : null;
  for (const item of suite.cases ?? []) {
    if (ids.has(item.id)) errors.push({ code: 'duplicate-case-id', path: `$.cases.${item.id}`, message: `Duplicate case: ${item.id}.` });
    ids.add(item.id);
    if (resolvable) {
      for (const evidenceId of item.required_evidence_ids ?? []) {
        if (!resolvable.has(evidenceId)) errors.push({ code: 'unresolvable-evidence-id', path: `$.cases.${item.id}.required_evidence_ids`, message: `Evidence ID no resoluble en el Project Model: ${evidenceId}.` });
      }
    }
  }
  return errors.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}

function codexJsonl(stdout) {
  const events = stdout.split('\n').map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const messages = events.filter((event) => event.type === 'item.completed' && event.item?.type === 'agent_message');
  const usageEvent = [...events].reverse().find((event) => event.usage || event.type === 'turn.completed');
  const output = messages.at(-1)?.item?.text ?? messages.at(-1)?.item?.content ?? '';
  const toolCalls = events.filter((event) => event.type === 'item.completed' && ['command_execution', 'mcp_tool_call', 'web_search'].includes(event.item?.type)).length;
  const usage = usageEvent?.usage ?? usageEvent?.turn?.usage ?? {};
  const hasTokens = Number.isFinite(usage.input_tokens) || Number.isFinite(usage.output_tokens);
  return { output: typeof output === 'string' ? output : stableStringify(output), tool_calls: toolCalls, tokens: hasTokens ? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) : null, raw_usage: usage };
}

function claudeJson(stdout) {
  const payload = JSON.parse(stdout);
  const usage = payload.usage ?? {};
  const tokenFields = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
  const hasTokens = tokenFields.some((key) => Number.isFinite(usage[key]));
  const total = hasTokens ? tokenFields.reduce((sum, key) => sum + (usage[key] ?? 0), 0) : null;
  const measured = total !== null && !(payload.is_error && total === 0);
  return {
    output: payload.result ?? '',
    tool_calls: null,
    tokens: measured ? total : null,
    raw_usage: usage,
    raw_num_turns: Number.isFinite(payload.num_turns) ? payload.num_turns : null,
    cost_usd: payload.total_cost_usd,
    model: payload.modelUsage ? Object.keys(payload.modelUsage)[0] : undefined,
  };
}

export function createHostAdapter(host, { run = runClosed, executable, timeoutMs = 90000 } = {}) {
  if (!['codex', 'claude-code'].includes(host)) throw new Error(`Unsupported host: ${host}`);
  const command = executable ?? (host === 'codex' ? 'codex' : 'claude');
  return {
    id: host,
    async version() {
      const { stdout } = await run(command, ['--version'], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
      return stdout.trim();
    },
    async execute({ root, prompt, model }) {
      const started = Date.now();
      if (host === 'codex') {
        const args = ['exec', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only', '--color', 'never', '--json', '-C', root];
        if (model) args.push('--model', model);
        args.push(prompt);
        try {
          const { stdout } = await run(command, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
          return { ...codexJsonl(stdout), duration_ms: Date.now() - started };
        } catch (error) {
          if (error?.stdout) return { ...codexJsonl(String(error.stdout)), duration_ms: Date.now() - started, error: String(error?.stderr || error.message).slice(0, 500) };
          throw error;
        }
      }
      const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'dontAsk', '--no-session-persistence', '--tools', ''];
      if (model) args.push('--model', model);
      try {
        const { stdout } = await run(command, args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
        const parsed = claudeJson(stdout);
        const payload = JSON.parse(stdout);
        return { ...parsed, duration_ms: Date.now() - started, ...(payload.is_error ? { error: payload.result || payload.terminal_reason || 'Claude Code returned an error.' } : {}) };
      } catch (error) {
        if (error?.stdout) {
          const stdout = String(error.stdout);
          const parsed = claudeJson(stdout);
          const payload = JSON.parse(stdout);
          // Only a host-reported error carries its cause in the payload. When the host
          // reported success, payload.result is the model answer, not a diagnostic, so the
          // transport failure stays the classification source.
          const detail = payload.is_error === true
            ? (payload.result || payload.terminal_reason || String(error.message))
            : String(error.message);
          return { ...parsed, duration_ms: Date.now() - started, error: detail, error_classification: classifyExecutionError(error, detail) };
        }
        throw error;
      }
    },
  };
}

function grade(output, item) {
  const normalized = output.toLowerCase();
  const checks = [
    ...item.expected_terms.map((term) => ({ kind: 'expected-term', value: term, passed: normalized.includes(term.toLowerCase()) })),
    ...(item.forbidden_terms ?? []).map((term) => ({ kind: 'forbidden-term', value: term, passed: !normalized.includes(term.toLowerCase()) })),
    ...(item.required_evidence_ids ?? []).map((id) => ({ kind: 'evidence-id', value: id, passed: output.includes(id) })),
  ];
  const passed = checks.filter((check) => check.passed).length;
  return { passed, total: checks.length, pass_rate: checks.length ? passed / checks.length : 0, checks };
}

function promptFor(item, variant, packet, skill) {
  const sections = [
    'You are in a context-only read-only evaluation. Do not call tools, inspect files, modify anything, install dependencies, or perform external actions. Answer only from the information in this prompt; say that evidence is unavailable when it is not supplied.',
    `Task: ${item.prompt}`,
    'Answer concisely. Distinguish evidence from inference and cite relevant contexxxt evidence or KnowledgeUnit IDs when supplied.',
  ];
  if (variant !== 'baseline') sections.push(`Contexxxt ContextPacket:\n${JSON.stringify(packet)}`);
  if (variant === 'candidate') sections.push(`Candidate skill instructions:\n${skill}`);
  return sections.join('\n\n');
}

function aggregate(results, variant) {
  const rows = results.filter((item) => item.variant === variant);
  const sum = (key) => rows.every((item) => Number.isFinite(item.metrics[key]))
    ? rows.reduce((total, item) => total + item.metrics[key], 0)
    : null;
  return {
    cases: rows.length,
    pass_rate: rows.length ? rows.reduce((total, item) => total + item.grade.pass_rate, 0) / rows.length : 0,
    tokens: sum('tokens'),
    context_bytes: sum('context_bytes'),
    tool_calls: sum('tool_calls'),
    duration_ms: sum('duration_ms'),
  };
}

function metricDelta(value, reference) {
  return Number.isFinite(value) && Number.isFinite(reference) ? value - reference : null;
}

function classifyExecutionError(error, detail) {
  const normalized = `${error?.code ?? ''} ${detail}`.toLowerCase();
  if (normalized.includes('oauth') || normalized.includes('authenticate') || normalized.includes('authentication')) return 'authentication-error';
  if (normalized.includes('etimedout') || normalized.includes('timed out') || normalized.includes('timeout')) return 'timeout';
  if (error?.code === 'ENOENT' || normalized.includes('not found')) return 'executable-unavailable';
  if (error instanceof SyntaxError || normalized.includes('json')) return 'invalid-host-output';
  return 'host-execution-error';
}

export async function runBehavioralEval({ root, model, suite, hostAdapter, variants = ['baseline', 'context'], skill = '', clock = () => new Date(), modelName }) {
  const version = await hostAdapter.version();
  const indexes = buildDerivedIndexes(model);
  const results = [];
  for (const item of suite.cases) {
    const resolved = resolveTask(model, indexes, { target: item.target, intent: item.intent, maxBytes: 12288 });
    for (const variant of variants) {
      const contextBytes = variant === 'baseline' ? 0 : Buffer.byteLength(JSON.stringify(resolved.packet));
      const skillBytes = variant === 'candidate' ? Buffer.byteLength(skill) : 0;
      const prompt = promptFor(item, variant, resolved.packet, skill);
      let execution;
      const executionStarted = Date.now();
      try {
        execution = await hostAdapter.execute({ root, prompt, model: modelName });
      } catch (error) {
        const detail = String(error?.stderr || error?.message || 'host execution failed').split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 500);
        execution = {
          output: '', tokens: null, tool_calls: null, duration_ms: Date.now() - executionStarted,
          error: detail || 'host execution failed', error_classification: classifyExecutionError(error, detail),
        };
      }
      if (execution.error && !execution.error_classification) execution.error_classification = classifyExecutionError(null, execution.error);
      const graded = grade(execution.output, item);
      const effectiveGrade = execution.error ? {
        passed: 0,
        total: graded.total,
        pass_rate: 0,
        checks: graded.checks.map((check) => ({ ...check, passed: false, blocked_by: 'execution-error' })),
      } : graded;
      results.push({
        case_id: item.id,
        variant,
        task: { target: item.target, intent: item.intent, prompt: item.prompt },
        status: execution.error ? 'execution-error' : 'completed',
        output: execution.output,
        output_digest: hash(execution.output),
        grade: effectiveGrade,
        metrics: {
          tokens: execution.tokens ?? null,
          context_bytes: contextBytes + skillBytes,
          context_packet_bytes: contextBytes,
          skill_bytes: skillBytes,
          knowledge_units: variant === 'baseline' ? 0 : resolved.packet.budget.knowledge_units,
          tool_calls: execution.tool_calls ?? null,
          duration_ms: execution.duration_ms ?? null,
          output_bytes: Buffer.byteLength(execution.output),
        },
        ...(execution.model ? { model: execution.model } : {}),
        ...(execution.cost_usd !== undefined ? { cost_usd: execution.cost_usd } : {}),
        ...(execution.error ? { error: execution.error, error_classification: execution.error_classification } : {}),
      });
    }
  }
  const summaries = Object.fromEntries(variants.map((variant) => [variant, aggregate(results, variant)]));
  const comparisons = Object.fromEntries(variants.filter((variant) => variant !== 'baseline').map((variant) => {
    const referenceVariant = variant === 'candidate' && summaries.context ? 'context' : 'baseline';
    const reference = summaries[referenceVariant];
    return [variant, {
      reference_variant: referenceVariant,
      quality_delta: summaries[variant].pass_rate - reference.pass_rate,
      token_delta: metricDelta(summaries[variant].tokens, reference.tokens),
      context_byte_delta: metricDelta(summaries[variant].context_bytes, reference.context_bytes),
      tool_call_delta: metricDelta(summaries[variant].tool_calls, reference.tool_calls),
      duration_ms_delta: metricDelta(summaries[variant].duration_ms, reference.duration_ms),
    }];
  }));
  const identity = { suite: suite.id, host: hostAdapter.id, version, model_snapshot: model.snapshot.id, variants, cases: suite.cases.map((item) => item.id) };
  return {
    schema_version: '1.1.0',
    id: `evalrun.${hash(stableStringify(identity)).slice(0, 20)}`,
    created_at: clock().toISOString(),
    provider: { host: hostAdapter.id, version, model: modelName ?? 'host-default' },
    repository: { commit: model.snapshot.revision?.commit ?? null, dirty: model.snapshot.revision?.dirty ?? null },
    suite: { id: suite.id, cases: suite.cases.length },
    configuration: { variants, project_model: model.snapshot.id, candidate_skill: suite.candidate_skill ?? null },
    results,
    summaries,
    comparisons,
    execution_errors: results.filter((item) => item.error).length,
    claims: Object.fromEntries(Object.entries(comparisons).map(([variant, value]) => {
      const hasErrors = results.some((item) => [value.reference_variant, variant].includes(item.variant) && item.error);
      return [variant, hasErrors ? 'not-measurable-execution-error' : value.quality_delta > 0 ? 'measured-positive-on-this-run' : value.quality_delta === 0 ? 'no-measured-quality-difference' : 'measured-regression-on-this-run'];
    })),
  };
}
