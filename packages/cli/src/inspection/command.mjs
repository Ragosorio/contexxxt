import { isAbsolute, resolve } from 'node:path';
import { assertInsideRoot, pathExists, resolveSafeRoot, UsageError, VERSION, writeJson } from '../lib.mjs';
import { inspectProject, validateInspectionReport } from './inspection.mjs';

function parseLimit(value) {
  if (value === undefined) return 10000;
  if (!/^\d+$/.test(String(value))) throw new UsageError('--limit debe ser un entero positivo.');
  const number = Number(value);
  if (number < 1 || number > 100000) throw new UsageError('--limit debe estar entre 1 y 100000.');
  return number;
}

export async function commandInspect(positionals, options) {
  const root = await resolveSafeRoot(positionals[0] ?? options.root ?? '.');
  const report = await inspectProject(root, { limit: parseLimit(options.limit) });
  const errors = await validateInspectionReport(report);
  if (errors.length > 0) throw new UsageError(`InspectionReport inválido: ${errors.length} errores.`);
  const changes = [];
  if (options.output) {
    const target = isAbsolute(options.output) ? resolve(options.output) : resolve(root, options.output);
    assertInsideRoot(root, target);
    if (await pathExists(target)) throw new UsageError(`El output ya existe y no se sobrescribirá: ${options.output}`);
    await writeJson(root, target, report);
    changes.push({ action: 'created', path: options.output });
  }
  const counts = {
    evidence: report.evidence.length,
    files: report.coverage.inspected_files,
    packages: report.catalog.manifests.packages.length,
    commands: report.catalog.manifests.commands.length,
    workflows: report.catalog.ci.workflows.length,
    tests: report.catalog.tests.files.length,
    documents: report.catalog.documentation.length,
    instructions: report.catalog.instructions.files.length,
    potential_instruction_conflicts: report.catalog.instructions.potential_conflicts.length,
  };
  return {
    code: report.coverage.status === 'complete' ? 0 : 1,
    result: {
      ok: report.coverage.status === 'complete',
      command: 'inspect',
      version: VERSION,
      root,
      mode: options.output ? 'read-only+explicit-output' : 'read-only',
      summary: `Inspección ${report.coverage.status}: ${counts.evidence} Evidence desde ${counts.files} archivos; no se ejecutaron comandos del proyecto.`,
      changes,
      findings: report.findings,
      data: { counts, report },
    },
  };
}
