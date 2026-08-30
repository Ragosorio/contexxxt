import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { runQueryEval, validateEvalSuite } from './evaluation/query-eval.mjs';
import {
  buildDerivedIndexes,
  loadProjectModel,
  modelDigest,
  relativeModelPath,
  resolveModelPath,
  stableStringify,
  validateProjectModel,
} from './model/model.mjs';
import { buildProjectModel } from './model/builder.mjs';
import { inspectProject, validateInspectionReport } from './inspection/inspection.mjs';
import { buildTargetContext, executeQuery } from './query/query.mjs';
import { assertInsideRoot, assertNoSymlinkPath, pathExists, readJson, resolveSafeRoot, UsageError, VERSION, writeJson } from './lib.mjs';
import { commandBehavioralEval } from './evaluation/command.mjs';

async function rootFrom(options) {
  return resolveSafeRoot(options.root ?? '.');
}

function validationFindings(errors) {
  return errors.map((error) => ({ severity: 'error', code: error.code, path: error.path, message: error.message }));
}

async function loadValidated(root, modelOption) {
  const loaded = await loadProjectModel(root, modelOption);
  if (loaded.errors.length > 0) throw new UsageError(`Project Model inválido: ${loaded.errors.length} errores. Ejecuta contexxxt model validate.`);
  return { ...loaded, indexes: buildDerivedIndexes(loaded.model) };
}

export async function commandModel(positionals, options) {
  const action = positionals[0] ?? 'validate';
  if (!['validate', 'build'].includes(action)) throw new UsageError('model admite: validate o build.');
  const root = await rootFrom(options);
  if (action === 'build') return commandModelBuild(root, options);
  const loaded = await loadProjectModel(root, options.model);
  const findings = validationFindings(loaded.errors);
  return {
    code: findings.length > 0 ? 1 : 0,
    result: {
      ok: findings.length === 0,
      command: 'model',
      version: VERSION,
      root,
      mode: 'validate',
      summary: findings.length === 0 ? 'Project Model válido.' : `Project Model inválido: ${findings.length} errores.`,
      findings,
      data: {
        schema_version: loaded.model.schema_version,
        model: relativeModelPath(root, loaded.path),
        digest: loaded.digest,
        knowledge_count: loaded.model.knowledge?.length ?? 0,
        evidence_count: loaded.model.evidence?.length ?? 0,
      },
    },
  };
}

async function loadInspection(root, option) {
  if (!option) return inspectProject(root);
  const path = isAbsolute(option) ? resolve(option) : resolve(root, option);
  assertInsideRoot(root, path);
  await assertNoSymlinkPath(root, path);
  let report;
  try {
    report = await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new UsageError(`InspectionReport no encontrado: ${relative(root, path)}`);
    if (error instanceof SyntaxError) throw new UsageError('InspectionReport contiene JSON inválido.');
    throw error;
  }
  return report;
}

async function commandModelBuild(root, options) {
  const report = await loadInspection(root, options.inspection);
  const reportErrors = await validateInspectionReport(report);
  if (reportErrors.length > 0) {
    return {
      code: 1,
      result: { ok: false, command: 'model', version: VERSION, root, mode: 'build', summary: `InspectionReport inválido: ${reportErrors.length} errores.`, findings: validationFindings(reportErrors) },
    };
  }
  const path = resolveModelPath(root, options.model);
  await assertNoSymlinkPath(root, path);
  let existing = null;
  if (await pathExists(path)) {
    const loaded = await loadProjectModel(root, options.model);
    if (loaded.errors.length > 0) {
      return {
        code: 1,
        result: { ok: false, command: 'model', version: VERSION, root, mode: 'build', summary: `El Project Model existente es inválido y no será sobrescrito: ${loaded.errors.length} errores.`, findings: validationFindings(loaded.errors) },
      };
    }
    existing = loaded.model;
  }
  const built = buildProjectModel(report, existing);
  const errors = await validateProjectModel(built.model);
  if (errors.length > 0) {
    return {
      code: 1,
      result: { ok: false, command: 'model', version: VERSION, root, mode: 'build', summary: `El builder produjo un modelo inválido: ${errors.length} errores.`, findings: validationFindings(errors) },
    };
  }
  const unchanged = existing && stableStringify(existing) === stableStringify(built.model);
  const relativePath = relativeModelPath(root, path);
  const blocked = built.proposals.length > 0;
  const action = unchanged ? 'unchanged' : existing ? 'updated' : 'created';
  if (!unchanged && !blocked && !options.dry_run) await writeJson(root, path, built.model);
  const dryRunAction = action === 'created' ? 'would-create' : 'would-update';
  const effectiveAction = options.dry_run && !unchanged ? dryRunAction : blocked && !unchanged ? 'proposal-required' : action;
  const findings = built.proposals.map((proposal) => ({ severity: 'warning', code: proposal.kind, path: `knowledge.${proposal.id}`, message: proposal.reason }));
  return {
    code: blocked ? 1 : 0,
    result: {
      ok: !blocked,
      command: 'model',
      version: VERSION,
      root,
      mode: options.dry_run ? 'build-dry-run' : 'build',
      summary: blocked
        ? `Project Model preservado: ${built.proposals.length} conflicto(s) requieren propuesta.`
        : `Project Model ${effectiveAction}: ${built.stats.generated_knowledge} unidades generadas desde ${built.stats.evidence} Evidence.`,
      changes: [{ action: effectiveAction, path: relativePath }],
      findings,
      data: { model: relativePath, digest: modelDigest(built.model), report_id: report.report_id, ...built.stats, proposals: built.proposals },
    },
  };
}

export async function commandQuery(positionals, options) {
  const root = await rootFrom(options);
  const selector = positionals[0] ?? 'catalog';
  const value = positionals[1];
  const loaded = await loadValidated(root, options.model);
  const data = executeQuery(loaded.model, loaded.indexes, selector, value, options);
  const count = Array.isArray(data.items) ? data.items.length : data.counts?.knowledge ?? 0;
  return {
    code: 0,
    result: {
      ok: true,
      command: 'query',
      version: VERSION,
      root,
      summary: `Query ${selector}: ${count} resultados compactos.`,
      data,
    },
  };
}

export async function commandContext(positionals, options) {
  const target = positionals[0];
  if (!target) throw new UsageError('context requiere un target.');
  const root = await rootFrom(options);
  const loaded = await loadValidated(root, options.model);
  const data = buildTargetContext(loaded.model, loaded.indexes, target, options);
  return {
    code: 0,
    result: {
      ok: true,
      command: 'context',
      version: VERSION,
      root,
      summary: `Contexto para ${target}: ${data.knowledge.length} unidades cargadas, ${data.budget.omitted} omitidas por budget.`,
      data,
    },
  };
}

async function resolveSuitePath(root, value) {
  if (!value) throw new UsageError('eval requiere la ruta de un query eval suite.');
  const path = isAbsolute(value) ? resolve(value) : resolve(root, value);
  assertInsideRoot(root, path);
  await assertNoSymlinkPath(root, path);
  return path;
}

export async function commandEval(positionals, options) {
  if (positionals[0] === 'behavioral') return commandBehavioralEval(positionals, options);
  const root = await rootFrom(options);
  const suitePath = await resolveSuitePath(root, positionals[0]);
  let suite;
  try {
    suite = await readJson(suitePath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new UsageError(`Eval suite no encontrado: ${relative(root, suitePath)}`);
    if (error instanceof SyntaxError) throw new UsageError('Eval suite contiene JSON inválido.');
    throw error;
  }
  const suiteErrors = validateEvalSuite(suite);
  if (suiteErrors.length > 0) {
    return {
      code: 1,
      result: { ok: false, command: 'eval', version: VERSION, root, summary: `Eval suite inválido: ${suiteErrors.length} errores.`, findings: validationFindings(suiteErrors) },
    };
  }
  const suiteModel = suite.model
    ? relative(root, resolve(dirname(suitePath), suite.model))
    : undefined;
  if (suiteModel) assertInsideRoot(root, resolve(root, suiteModel));
  const loaded = await loadValidated(root, options.model ?? suiteModel);
  const data = runQueryEval(loaded.model, loaded.indexes, suite);
  return {
    code: data.ok ? 0 : 1,
    result: {
      ok: data.ok,
      command: 'eval',
      version: VERSION,
      root,
      summary: `Query eval: ${data.passed}/${data.total} casos pasaron.`,
      findings: data.cases.filter((item) => !item.passed).map((item) => ({ severity: 'error', code: 'eval-case-failed', path: item.id, message: item.failures.join('; ') })),
      data,
    },
  };
}
