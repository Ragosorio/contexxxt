import { join, relative } from 'node:path';
import { pathExists, resolveSafeRoot, UsageError, VERSION, writeJson } from '../lib.mjs';
import { inspectProject, validateInspectionReport } from '../inspection/inspection.mjs';
import { buildProjectModel } from '../model/builder.mjs';
import { loadProjectModel, validateProjectModel } from '../model/model.mjs';

export async function commandMigrate(positionals, options) {
  const action = positionals[0] ?? 'status';
  if (!['status', 'contextos'].includes(action)) throw new UsageError('migrate admite: status o contextos.');
  const root = await resolveSafeRoot(options.root ?? '.');
  const legacy = join(root, '.contextos');
  const canonical = join(root, '.contexxxt', 'project-model.json');
  const legacyPresent = await pathExists(legacy);
  const canonicalPresent = await pathExists(canonical);
  if (action === 'status') {
    return { code: 0, result: { ok: true, command: 'migrate status', version: VERSION, root, mode: 'read-only', summary: `legacy=${legacyPresent}, canonical=${canonicalPresent}.`, data: { legacy_root: legacyPresent, canonical_model: canonicalPresent, compatibility: { legacy_read_window: '0.2.x', planned_removal: '0.3.0-earliest' } } } };
  }
  if (!legacyPresent) throw new UsageError('No se detectó .contextos/ para migrar.');
  if (canonicalPresent) {
    const loaded = await loadProjectModel(root);
    if (loaded.errors.length > 0) throw new UsageError(`El Project Model existente es inválido: ${loaded.errors.length} errores.`);
    return { code: 0, result: { ok: true, command: 'migrate contextos', version: VERSION, root, summary: 'El canon .contexxxt ya existe; .contextos se preservó.', changes: [], data: { canonical_model: '.contexxxt/project-model.json', legacy_preserved: true, switched: false } } };
  }
  const report = await inspectProject(root);
  const reportErrors = await validateInspectionReport(report);
  if (reportErrors.length > 0) throw new UsageError(`InspectionReport inválido: ${reportErrors.length} errores.`);
  const built = buildProjectModel(report, null);
  const modelErrors = await validateProjectModel(built.model);
  if (modelErrors.length > 0) throw new UsageError(`La migración produciría un Project Model inválido: ${modelErrors.length} errores.`);
  const migration = {
    schema_version: '1.0.0',
    kind: 'contextos-to-contexxxt',
    source: '.contextos',
    target: '.contexxxt/project-model.json',
    legacy_preserved: true,
    canonical_switched: true,
    inspection_report: report.report_id,
    model_snapshot: built.model.snapshot.id,
    created_at: report.observed_at,
  };
  if (!options.dry_run) {
    await writeJson(root, canonical, built.model);
    await writeJson(root, join(root, '.contexxxt', 'migrations', 'contextos-v1.json'), migration);
  }
  return {
    code: 0,
    result: {
      ok: true,
      command: 'migrate contextos',
      version: VERSION,
      root,
      mode: options.dry_run ? 'dry-run' : 'explicit-migration',
      summary: options.dry_run ? 'Migración válida; no se escribió nada.' : 'Canon .contexxxt creado; legacy .contextos preservado.',
      changes: [{ action: options.dry_run ? 'would-create' : 'created', path: relative(root, canonical) }],
      data: migration,
    },
  };
}
