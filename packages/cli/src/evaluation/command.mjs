import { isAbsolute, relative, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { assertInsideRoot, pathExists, readJson, resolveSafeRoot, UsageError, VERSION, writeJson } from '../lib.mjs';
import { loadProjectModel } from '../model/model.mjs';
import { createHostAdapter, runBehavioralEval, validateBehavioralSuite } from './behavioral-eval.mjs';

function scoped(root, value) {
  const path = isAbsolute(value) ? resolve(value) : resolve(root, value);
  assertInsideRoot(root, path);
  return path;
}

export async function commandBehavioralEval(positionals, options) {
  const root = await resolveSafeRoot(options.root ?? '.');
  const suiteValue = positionals[1];
  if (!suiteValue) throw new UsageError('eval behavioral requiere una suite JSON.');
  if (!options.host) throw new UsageError('eval behavioral requiere --host codex|claude-code.');
  if (!options.output) throw new UsageError('eval behavioral requiere --output para registrar el EvalRun.');
  const suitePath = scoped(root, suiteValue);
  const outputPath = scoped(root, options.output);
  if (await pathExists(outputPath)) throw new UsageError(`EvalRun output ya existe y no será sobrescrito: ${options.output}`);
  let suite;
  try { suite = await readJson(suitePath); } catch (error) {
    if (error?.code === 'ENOENT') throw new UsageError(`Behavioral suite no encontrada: ${suiteValue}`);
    if (error instanceof SyntaxError) throw new UsageError('Behavioral suite contiene JSON inválido.');
    throw error;
  }
  const loaded = await loadProjectModel(root, options.model);
  if (loaded.errors.length > 0) throw new UsageError(`Project Model inválido: ${loaded.errors.length} errores.`);
  const suiteErrors = await validateBehavioralSuite(suite, loaded.model);
  if (suiteErrors.length > 0) {
    return { code: 1, result: { ok: false, command: 'eval behavioral', version: VERSION, root, summary: `Behavioral suite inválida: ${suiteErrors.length} errores.`, findings: suiteErrors.map((error) => ({ severity: 'error', ...error })) } };
  }
  if (options.max_cases !== undefined) {
    const maxCases = Number(options.max_cases);
    if (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > 100) throw new UsageError('--max-cases debe ser un entero entre 1 y 100.');
    suite = { ...suite, cases: suite.cases.slice(0, maxCases) };
  }
  const timeoutMs = options.timeout_ms === undefined ? 90000 : Number(options.timeout_ms);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10000 || timeoutMs > 300000) throw new UsageError('--timeout-ms debe estar entre 10000 y 300000.');
  const variants = options.variant ? options.variant.split(',').map((item) => item.trim()).filter(Boolean) : suite.candidate_skill ? ['baseline', 'context', 'candidate'] : ['baseline', 'context'];
  const invalid = variants.filter((item) => !['baseline', 'context', 'candidate'].includes(item));
  if (invalid.length > 0 || !variants.includes('baseline')) throw new UsageError('--variant admite baseline,context,candidate y debe incluir baseline.');
  let skill = '';
  if (variants.includes('candidate')) {
    if (!suite.candidate_skill) throw new UsageError('La suite no declara candidate_skill.');
    const skillRoot = scoped(root, suite.candidate_skill);
    skill = await readFile(resolve(skillRoot, 'SKILL.md'), 'utf8');
  }
  const run = await runBehavioralEval({ root, model: loaded.model, suite, hostAdapter: createHostAdapter(options.host, { timeoutMs }), variants, skill, modelName: options.agent_model });
  await writeJson(root, outputPath, run);
  return {
    code: run.execution_errors > 0 ? 1 : 0,
    result: {
      ok: run.execution_errors === 0,
      command: 'eval behavioral',
      version: VERSION,
      root,
      summary: `${options.host}: ${suite.cases.length} casos × ${variants.length} variantes, ${run.execution_errors} errores; claims limitados a este run.`,
      changes: [{ action: 'created', path: relative(root, outputPath) }],
      data: { id: run.id, provider: run.provider, summaries: run.summaries, comparisons: run.comparisons, claims: run.claims, execution_errors: run.execution_errors },
    },
  };
}
