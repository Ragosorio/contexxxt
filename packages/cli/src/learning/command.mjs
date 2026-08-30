import { isAbsolute, join, relative, resolve } from 'node:path';
import {
  assertInsideRoot,
  assertNoSymlinkPath,
  pathExists,
  readJson,
  resolveSafeRoot,
  UsageError,
  VERSION,
  writeJson,
} from '../lib.mjs';
import { inspectProject } from '../inspection/inspection.mjs';
import { loadProjectModel, stableStringify } from '../model/model.mjs';
import {
  detectRevisionDrift,
  emptyLearningStore,
  ingestObservation,
  learningProposal,
  transitionCandidate,
  validateExecutionObservation,
  validateLearningStore,
  validatePromotionEval,
} from './learning.mjs';

function scopedPath(root, option, fallback) {
  const target = option ? (isAbsolute(option) ? resolve(option) : resolve(root, option)) : join(root, fallback);
  assertInsideRoot(root, target);
  return target;
}

async function readRequiredJson(root, value, label) {
  if (!value) throw new UsageError(`${label} requiere una ruta JSON.`);
  const path = scopedPath(root, value);
  await assertNoSymlinkPath(root, path);
  try { return { path, value: await readJson(path) }; } catch (error) {
    if (error?.code === 'ENOENT') throw new UsageError(`${label} no encontrado: ${value}`);
    if (error instanceof SyntaxError) throw new UsageError(`${label} contiene JSON inválido: ${value}`);
    throw error;
  }
}

async function loadStore(root, option, at) {
  const path = scopedPath(root, option, '.contexxxt/learning-candidates.json');
  await assertNoSymlinkPath(root, path);
  if (!(await pathExists(path))) return { path, store: emptyLearningStore(at), exists: false };
  let store;
  try { store = await readJson(path); } catch (error) {
    if (error instanceof SyntaxError) throw new UsageError('Learning Candidate store contiene JSON inválido.');
    throw error;
  }
  const errors = await validateLearningStore(store);
  if (errors.length > 0) throw new UsageError(`Learning Candidate store inválido: ${errors.length} errores.`);
  return { path, store, exists: true };
}

export async function commandObserve(positionals, options) {
  const action = positionals[0] ?? 'ingest';
  if (action !== 'ingest') throw new UsageError('observe admite únicamente: ingest.');
  const root = await resolveSafeRoot(options.root ?? '.');
  const input = await readRequiredJson(root, positionals[1] ?? options.input, 'ExecutionObservation');
  const errors = await validateExecutionObservation(input.value);
  if (errors.length > 0) {
    return {
      code: 1,
      result: {
        ok: false,
        command: 'observe',
        version: VERSION,
        root,
        summary: `ExecutionObservation inválida: ${errors.length} errores.`,
        findings: errors.map((error) => ({ severity: 'error', ...error })),
      },
    };
  }
  const loaded = await loadStore(root, options.store, input.value.observed_at);
  const archivePath = join(root, '.contexxxt', 'observations', `${input.value.id}.json`);
  await assertNoSymlinkPath(root, archivePath);
  if (await pathExists(archivePath)) {
    const archived = await readJson(archivePath);
    if (stableStringify(archived) !== stableStringify(input.value)) {
      throw new UsageError(`Observation ID conflict: ${input.value.id} ya existe con otro contenido.`);
    }
  }
  const ingested = ingestObservation(loaded.store, input.value);
  const storeChanged = stableStringify(loaded.store) !== stableStringify(ingested.store);
  const archiveExists = await pathExists(archivePath);
  if (!options.dry_run) {
    if (!archiveExists) await writeJson(root, archivePath, input.value);
    if (storeChanged || !loaded.exists) await writeJson(root, loaded.path, ingested.store);
  }
  return {
    code: 0,
    result: {
      ok: true,
      command: 'observe',
      version: VERSION,
      root,
      mode: options.dry_run ? 'dry-run' : 'ingest',
      summary: `${input.value.id}: ${ingested.changes.filter((item) => item.action !== 'unchanged').length} cambios de candidatos; Project Model intacto.`,
      changes: [
        { action: archiveExists ? 'unchanged' : options.dry_run ? 'would-create' : 'created', path: relative(root, archivePath) },
        { action: storeChanged ? options.dry_run ? 'would-update' : loaded.exists ? 'updated' : 'created' : 'unchanged', path: relative(root, loaded.path) },
      ],
      data: { observation_id: input.value.id, candidates: ingested.changes, canonical_model_changed: false },
    },
  };
}

export async function commandLearning(positionals, options) {
  const action = positionals[0] ?? 'list';
  const id = positionals[1];
  const root = await resolveSafeRoot(options.root ?? '.');
  const at = options.at ? new Date(options.at).toISOString() : new Date().toISOString();
  const loaded = await loadStore(root, options.store, at);
  if (action === 'list') {
    const status = options.status;
    const candidates = loaded.store.candidates.filter((item) => !status || item.status === status).map((item) => ({
      id: item.id, kind: item.kind, status: item.status, support_count: item.support_count,
      confidence: item.confidence, authority: item.authority, risk: item.risk, suggested_form: item.suggested_form,
      summary: item.statement.slice(0, 240),
    }));
    return { code: 0, result: { ok: true, command: 'learning list', version: VERSION, root, summary: `${candidates.length} candidatos.`, data: { candidates } } };
  }
  if (action === 'show') {
    const candidate = loaded.store.candidates.find((item) => item.id === id);
    if (!candidate) throw new UsageError(`Learning Candidate no encontrado: ${id}`);
    return { code: 0, result: { ok: true, command: 'learning show', version: VERSION, root, summary: `${candidate.id}: ${candidate.status}.`, data: { candidate } } };
  }
  if (!['reject', 'promote', 'supersede'].includes(action)) throw new UsageError('learning admite: list, show, reject, promote o supersede.');
  if (!id) throw new UsageError(`learning ${action} requiere un candidate ID.`);
  let evalRef;
  let proposalPath;
  if (action === 'promote') {
    const evaluation = await readRequiredJson(root, options.eval, 'Promotion eval');
    const failures = validatePromotionEval(evaluation.value);
    if (failures.length > 0) {
      return { code: 1, result: { ok: false, command: 'learning promote', version: VERSION, root, summary: `Promoción rechazada por eval: ${failures.join(', ')}.`, findings: failures.map((code) => ({ severity: 'error', code, message: code })) } };
    }
    if (!options.output) throw new UsageError('learning promote requiere --output para una propuesta no canónica.');
    proposalPath = scopedPath(root, options.output);
    await assertNoSymlinkPath(root, proposalPath);
    if (await pathExists(proposalPath)) throw new UsageError(`La propuesta ya existe y no será sobrescrita: ${options.output}`);
    evalRef = relative(root, evaluation.path);
  }
  const transitioned = transitionCandidate(loaded.store, id, action, {
    at,
    reason: options.reason,
    evalRef,
    supersededBy: options.superseded_by,
  });
  if (transitioned.error) throw new UsageError(`Transición inválida: ${transitioned.error}.`);
  const errors = await validateLearningStore(transitioned.store);
  if (errors.length > 0) throw new UsageError(`La transición produciría un store inválido: ${errors.length} errores.`);
  if (action === 'promote') await writeJson(root, proposalPath, learningProposal(transitioned.candidate, evalRef, at));
  await writeJson(root, loaded.path, transitioned.store);
  return {
    code: 0,
    result: {
      ok: true,
      command: `learning ${action}`,
      version: VERSION,
      root,
      summary: `${id}: ${transitioned.candidate.status}; Project Model intacto.`,
      changes: [
        ...(proposalPath ? [{ action: 'created', path: relative(root, proposalPath) }] : []),
        { action: loaded.exists ? 'updated' : 'created', path: relative(root, loaded.path) },
      ],
      data: { candidate: transitioned.candidate, canonical_model_changed: false },
    },
  };
}

export async function commandDrift(positionals, options) {
  const root = await resolveSafeRoot(positionals[0] ?? options.root ?? '.');
  const loaded = await loadProjectModel(root, options.model);
  if (loaded.errors.length > 0) throw new UsageError(`Project Model inválido: ${loaded.errors.length} errores.`);
  const report = await inspectProject(root);
  const at = new Date().toISOString();
  const data = detectRevisionDrift(loaded.model, report, at);
  return {
    code: 0,
    result: {
      ok: true,
      command: 'drift',
      version: VERSION,
      root,
      mode: 'read-only',
      summary: `${data.events.length} eventos de drift revision-only; no se modificó el modelo.`,
      data,
    },
  };
}
