import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInsideRoot, assertNoSymlinkPath, hash, portablePath, readJson, UsageError } from '../lib.mjs';
import { validateJsonSchema } from './json-schema.mjs';

export const PROJECT_MODEL_SCHEMA_VERSION = '1.1.0';
export const DIMENSIONS = ['what', 'why', 'how', 'for_what', 'which', 'who', 'where'];
export const SCOPE_KINDS = ['project', 'workspace', 'package', 'directory', 'file', 'symbol', 'route', 'service', 'domain', 'environment', 'surface'];

const schemaPath = fileURLToPath(new URL('../../schemas/project-model.schema.json', import.meta.url));
const authorityRank = new Map([
  ['governing', 5],
  ['authoritative', 4],
  ['supporting', 3],
  ['observational', 2],
  ['unknown', 1],
]);
const scopeRank = new Map([
  ['symbol', 11],
  ['route', 10],
  ['file', 9],
  ['directory', 8],
  ['package', 7],
  ['workspace', 6],
  ['service', 5],
  ['domain', 4],
  ['environment', 3],
  ['surface', 2],
  ['project', 1],
]);

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function modelDigest(model) {
  return hash(stableStringify(model));
}

export async function readProjectModelSchema() {
  return JSON.parse(await readFile(schemaPath, 'utf8'));
}

function duplicateIdErrors(items, collection) {
  const seen = new Set();
  const errors = [];
  for (const item of items) {
    if (seen.has(item.id)) errors.push({ code: 'duplicate-id', path: `${collection}.${item.id}`, message: `Duplicate ID: ${item.id}.` });
    seen.add(item.id);
  }
  return errors;
}

function semanticErrors(model) {
  const errors = [
    ...duplicateIdErrors(model.evidence ?? [], 'evidence'),
    ...duplicateIdErrors(model.knowledge ?? [], 'knowledge'),
  ];
  const evidenceIds = new Set((model.evidence ?? []).map((item) => item.id));
  const knowledgeIds = new Set((model.knowledge ?? []).map((item) => item.id));
  const exactUnits = new Map();

  for (const evidence of model.evidence ?? []) {
    if (evidence.authority?.source && !evidenceIds.has(evidence.authority.source)) {
      errors.push({ code: 'broken-evidence-reference', path: `evidence.${evidence.id}.authority.source`, message: `Unknown evidence: ${evidence.authority.source}.` });
    }
  }

  for (const unit of model.knowledge ?? []) {
    for (const evidenceId of unit.evidence ?? []) {
      if (!evidenceIds.has(evidenceId)) errors.push({ code: 'broken-evidence-reference', path: `knowledge.${unit.id}.evidence`, message: `Unknown evidence: ${evidenceId}.` });
    }
    if (unit.authority?.source && !evidenceIds.has(unit.authority.source)) {
      errors.push({ code: 'broken-evidence-reference', path: `knowledge.${unit.id}.authority.source`, message: `Unknown evidence: ${unit.authority.source}.` });
    }
    for (const relationship of unit.relationships ?? []) {
      if (!knowledgeIds.has(relationship.target)) {
        errors.push({ code: 'broken-knowledge-reference', path: `knowledge.${unit.id}.relationships`, message: `Unknown knowledge unit: ${relationship.target}.` });
      }
      if (relationship.target === unit.id && ['supersedes', 'contradicts'].includes(relationship.type)) {
        errors.push({ code: 'invalid-self-relationship', path: `knowledge.${unit.id}.relationships`, message: `${relationship.type} cannot target the same unit.` });
      }
      for (const evidenceId of relationship.evidence ?? []) {
        if (!evidenceIds.has(evidenceId)) errors.push({ code: 'broken-evidence-reference', path: `knowledge.${unit.id}.relationships`, message: `Unknown evidence: ${evidenceId}.` });
      }
    }
    const scopes = [...unit.scopes].map((scope) => ({ ...scope, exclude: [...(scope.exclude ?? [])].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))) }))
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    const fingerprint = stableStringify({ statement: unit.statement, dimensions: unit.dimensions, scopes });
    const duplicate = exactUnits.get(fingerprint);
    if (duplicate) errors.push({ code: 'duplicate-knowledge', path: `knowledge.${unit.id}`, message: `Exact duplicate of ${duplicate}.` });
    else exactUnits.set(fingerprint, unit.id);
  }

  const supersedes = new Map();
  for (const unit of model.knowledge ?? []) {
    supersedes.set(unit.id, (unit.relationships ?? []).filter((relation) => relation.type === 'supersedes').map((relation) => relation.target));
  }
  for (const start of supersedes.keys()) {
    const visiting = new Set();
    let cycle = false;
    const visit = (id) => {
      if (visiting.has(id)) { cycle = true; return; }
      visiting.add(id);
      for (const target of supersedes.get(id) ?? []) visit(target);
      visiting.delete(id);
    };
    visit(start);
    if (cycle) errors.push({ code: 'supersession-cycle', path: `knowledge.${start}.relationships`, message: 'Supersession relationships must be acyclic.' });
  }

  return errors;
}

export async function validateProjectModel(model) {
  const schema = await readProjectModelSchema();
  const schemaErrors = validateJsonSchema(model, schema);
  if (schemaErrors.length > 0) return schemaErrors;
  return semanticErrors(model).sort((a, b) => `${a.path}:${a.code}:${a.message}`.localeCompare(`${b.path}:${b.code}:${b.message}`));
}

export function resolveModelPath(root, option) {
  const target = option ? (isAbsolute(option) ? resolve(option) : resolve(root, option)) : join(root, '.contexxxt', 'project-model.json');
  assertInsideRoot(root, target);
  return target;
}

export async function loadProjectModel(root, option) {
  const path = resolveModelPath(root, option);
  await assertNoSymlinkPath(root, path);
  let model;
  try {
    model = await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new UsageError(`Project Model no encontrado: ${portablePath(path.slice(root.length + 1))}`);
    if (error instanceof SyntaxError) throw new UsageError(`Project Model contiene JSON inválido: ${portablePath(path.slice(root.length + 1))}`);
    throw error;
  }
  const errors = await validateProjectModel(model);
  return { model, path, errors, digest: modelDigest(model) };
}

function addIndex(index, key, value) {
  const values = index.get(key) ?? new Set();
  values.add(value);
  index.set(key, values);
}

function defaultScopeMatch(kind) {
  return kind === 'directory' ? 'prefix' : 'exact';
}

function normalizePathLike(value) {
  return portablePath(value).replace(/^\.\//, '').replace(/\/$/, '');
}

export function normalizeScopeSelector(input) {
  if (typeof input !== 'string' || input.trim() === '') throw new UsageError('El scope o target no puede estar vacío.');
  const trimmed = input.trim();
  const separator = trimmed.indexOf(':');
  if (separator > 0 && SCOPE_KINDS.includes(trimmed.slice(0, separator))) {
    const kind = trimmed.slice(0, separator);
    const raw = trimmed.slice(separator + 1);
    if (!raw) throw new UsageError(`Falta el valor de scope para ${kind}.`);
    return { kind, value: ['file', 'directory'].includes(kind) ? normalizePathLike(raw) : raw };
  }
  return { kind: 'path', value: normalizePathLike(trimmed) };
}

function globRegex(pattern) {
  let output = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') { output += '.*'; index += 1; }
    else if (character === '*') output += '[^/]*';
    else if (character === '?') output += '[^/]';
    else output += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${output}$`);
}

function selectorMatches(scope, target, projectId) {
  const match = scope.match ?? defaultScopeMatch(scope.kind);
  const scopeValue = ['file', 'directory'].includes(scope.kind) ? normalizePathLike(scope.value) : scope.value;
  let targetKind = target.kind;
  let targetValue = target.value;
  if (target.kind === 'path') {
    if (scope.kind === 'project') return scopeValue === projectId || scopeValue === '*';
    if (!['file', 'directory'].includes(scope.kind)) return false;
    targetKind = scope.kind;
    targetValue = normalizePathLike(target.value);
  }
  if (scope.kind !== targetKind) return false;
  if (match === 'glob') return globRegex(scopeValue).test(targetValue);
  if (match === 'prefix') return targetValue === scopeValue || targetValue.startsWith(`${scopeValue}/`);
  return targetValue === scopeValue;
}

export function scopeMatches(scope, target, projectId) {
  if (!selectorMatches(scope, target, projectId)) return false;
  return !(scope.exclude ?? []).some((exclusion) => selectorMatches(exclusion, target, projectId));
}

export function buildDerivedIndexes(model) {
  const indexes = {
    knowledgeById: new Map(),
    evidenceById: new Map(),
    byDimension: new Map(),
    byType: new Map(),
    byStatus: new Map(),
    byScope: new Map(),
    scopeEntries: [],
    byEvidence: new Map(),
    inboundRelations: new Map(),
    supersededIds: new Set(),
  };
  for (const evidence of model.evidence) indexes.evidenceById.set(evidence.id, evidence);
  for (const unit of model.knowledge) {
    indexes.knowledgeById.set(unit.id, unit);
    for (const dimension of Object.keys(unit.dimensions)) addIndex(indexes.byDimension, dimension, unit.id);
    addIndex(indexes.byType, unit.type, unit.id);
    addIndex(indexes.byStatus, unit.status, unit.id);
    for (const evidenceId of unit.evidence) addIndex(indexes.byEvidence, evidenceId, unit.id);
    for (const scope of unit.scopes) {
      const key = `${scope.kind}:${normalizePathLike(scope.value)}`;
      addIndex(indexes.byScope, key, unit.id);
      indexes.scopeEntries.push({ scope, unitId: unit.id });
    }
    for (const relationship of unit.relationships ?? []) {
      const inbound = indexes.inboundRelations.get(relationship.target) ?? [];
      inbound.push({ source: unit.id, ...relationship });
      indexes.inboundRelations.set(relationship.target, inbound);
      if (relationship.type === 'supersedes') indexes.supersededIds.add(relationship.target);
    }
  }
  indexes.scopeEntries.sort((a, b) => `${a.scope.kind}:${a.scope.value}:${a.unitId}`.localeCompare(`${b.scope.kind}:${b.scope.value}:${b.unitId}`));
  for (const relations of indexes.inboundRelations.values()) relations.sort((a, b) => `${a.type}:${a.source}`.localeCompare(`${b.type}:${b.source}`));
  return indexes;
}

export function effectiveStatus(unit, indexes, asOf) {
  if (indexes.supersededIds.has(unit.id) || unit.status === 'superseded') return 'superseded';
  if (unit.status === 'stale' || unit.validity.stale || (unit.validity.expires_at && unit.validity.expires_at < asOf)) return 'stale';
  return unit.status;
}

export function unitSpecificity(unit) {
  return Math.max(...unit.scopes.map((scope) => scopeRank.get(scope.kind) ?? 0));
}

export function unitSpecificityForTarget(unit, target, projectId) {
  return Math.max(0, ...unit.scopes.filter((scope) => scopeMatches(scope, target, projectId)).map((scope) => scopeRank.get(scope.kind) ?? 0));
}

function statusOrder(status) {
  return status === 'active' ? 4 : status === 'disputed' ? 3 : status === 'candidate' ? 2 : 1;
}

export function compareKnowledge(a, b, indexes, asOf) {
  const aStatus = effectiveStatus(a, indexes, asOf);
  const bStatus = effectiveStatus(b, indexes, asOf);
  return statusOrder(bStatus) - statusOrder(aStatus)
    || (authorityRank.get(b.authority.level) ?? 0) - (authorityRank.get(a.authority.level) ?? 0)
    || unitSpecificity(b) - unitSpecificity(a)
    || b.confidence - a.confidence
    || a.id.localeCompare(b.id);
}

export function compareKnowledgeForTarget(a, b, indexes, asOf, target, projectId) {
  const aStatus = effectiveStatus(a, indexes, asOf);
  const bStatus = effectiveStatus(b, indexes, asOf);
  return statusOrder(bStatus) - statusOrder(aStatus)
    || (authorityRank.get(b.authority.level) ?? 0) - (authorityRank.get(a.authority.level) ?? 0)
    || unitSpecificityForTarget(b, target, projectId) - unitSpecificityForTarget(a, target, projectId)
    || b.confidence - a.confidence
    || a.id.localeCompare(b.id);
}

export function knowledgeForTarget(model, indexes, target) {
  const ids = new Set();
  for (const entry of indexes.scopeEntries) {
    if (scopeMatches(entry.scope, target, model.project.id)) ids.add(entry.unitId);
  }
  return [...ids].map((id) => indexes.knowledgeById.get(id)).filter(Boolean);
}

export function relativeModelPath(root, path) {
  return portablePath(path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path);
}
