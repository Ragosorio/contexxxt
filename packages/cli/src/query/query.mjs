import { Buffer } from 'node:buffer';
import {
  compareKnowledge,
  compareKnowledgeForTarget,
  DIMENSIONS,
  effectiveStatus,
  knowledgeForTarget,
  normalizeScopeSelector,
} from '../model/model.mjs';
import { UsageError } from '../lib.mjs';

export const QUERY_VIEWS = ['ids', 'summary', 'detail'];
export const DEFAULT_QUERY_LIMIT = 20;
export const DEFAULT_QUERY_MAX_BYTES = 8192;
export const DEFAULT_CONTEXT_LIMIT = 12;
export const DEFAULT_CONTEXT_MAX_BYTES = 12288;

const hiddenStatuses = new Set(['candidate', 'rejected', 'superseded']);

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function settleEmittedBytes(result) {
  let previous = -1;
  while (result.budget.emitted_bytes !== previous) {
    previous = result.budget.emitted_bytes;
    result.budget.emitted_bytes = byteLength(result);
  }
  return result;
}

function parsePositiveInteger(value, fallback, name, { min = 1, max = 1_000_000 } = {}) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) throw new UsageError(`--${name} debe ser un entero positivo.`);
  const number = Number(value);
  if (number < min || number > max) throw new UsageError(`--${name} debe estar entre ${min} y ${max}.`);
  return number;
}

export function normalizeDimension(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replaceAll('-', '_');
  if (!DIMENSIONS.includes(normalized)) throw new UsageError(`Dimensión desconocida: ${value}. Usa: ${DIMENSIONS.join(', ')}.`);
  return normalized;
}

export function normalizeQueryOptions(options = {}, { context = false } = {}) {
  const view = options.view ?? 'summary';
  if (!QUERY_VIEWS.includes(view)) throw new UsageError(`--view debe ser: ${QUERY_VIEWS.join(', ')}.`);
  const include = new Set(String(options.include ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  const exclude = new Set(String(options.exclude ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  const dimensions = options.dimensions === undefined
    ? null
    : new Set(String(options.dimensions).split(',').map((item) => normalizeDimension(item)));
  return {
    view,
    include,
    exclude,
    dimensions,
    limit: parsePositiveInteger(options.limit, context ? DEFAULT_CONTEXT_LIMIT : DEFAULT_QUERY_LIMIT, 'limit', { max: 1000 }),
    maxBytes: parsePositiveInteger(options.max_bytes, context ? DEFAULT_CONTEXT_MAX_BYTES : DEFAULT_QUERY_MAX_BYTES, 'max-bytes', { min: 512 }),
    depth: parsePositiveInteger(options.depth, 0, 'depth', { min: 0, max: 2 }),
    asOf: options.at,
  };
}

function scopeLabels(scopes) {
  return scopes.map((scope) => `${scope.kind}:${scope.value}`).sort();
}

function compactKnowledge(unit, indexes, asOf) {
  return {
    id: unit.id,
    type: unit.type,
    summary: unit.summary,
    dimensions: Object.keys(unit.dimensions).sort(),
    scopes: scopeLabels(unit.scopes),
    confidence: unit.confidence,
    authority: unit.authority,
    status: effectiveStatus(unit, indexes, asOf),
    evidence: [...unit.evidence].sort(),
  };
}

function detailKnowledge(unit, indexes, asOf, depth) {
  const detail = {
    ...unit,
    effective_status: effectiveStatus(unit, indexes, asOf),
    inbound_relationships: indexes.inboundRelations.get(unit.id) ?? [],
  };
  if (depth > 0) {
    const relatedIds = new Set([
      ...(unit.relationships ?? []).map((relation) => relation.target),
      ...(indexes.inboundRelations.get(unit.id) ?? []).map((relation) => relation.source),
    ]);
    detail.related = [...relatedIds].sort().map((id) => indexes.knowledgeById.get(id)).filter(Boolean).map((related) => compactKnowledge(related, indexes, asOf));
  }
  return detail;
}

function compactEvidence(evidence) {
  return {
    id: evidence.id,
    type: evidence.type,
    summary: evidence.summary,
    source: evidence.locator.uri,
    authority: evidence.authority,
    provider: evidence.provider.id,
    observed_at: evidence.observed_at,
  };
}

function projectKnowledge(unit, view, indexes, asOf, depth) {
  if (view === 'ids') return unit.id;
  if (view === 'detail') return detailKnowledge(unit, indexes, asOf, depth);
  return compactKnowledge(unit, indexes, asOf);
}

function projectEvidence(evidence, view) {
  if (view === 'ids') return evidence.id;
  if (view === 'detail') return evidence;
  return compactEvidence(evidence);
}

function visibleUnit(unit, indexes, asOf, options) {
  const status = effectiveStatus(unit, indexes, asOf);
  if (hiddenStatuses.has(status) && !options.include.has(status)) return false;
  if (options.exclude.has(unit.type) || options.exclude.has(unit.id)) return false;
  return true;
}

function budgetItems(base, items, options) {
  const selected = [];
  const candidateCount = items.length;
  for (const item of items.slice(0, options.limit)) {
    const candidate = { ...base, items: [...selected, item], budget: { limit: options.limit, max_bytes: options.maxBytes, emitted_bytes: 0, truncated: false, omitted: 0 } };
    candidate.budget.emitted_bytes = byteLength(candidate);
    if (candidate.budget.emitted_bytes > options.maxBytes) break;
    selected.push(item);
  }
  const result = {
    ...base,
    items: selected,
    budget: {
      limit: options.limit,
      max_bytes: options.maxBytes,
      emitted_bytes: 0,
      truncated: selected.length < candidateCount,
      omitted: candidateCount - selected.length,
    },
  };
  return settleEmittedBytes(result);
}

function knowledgeList(ids, indexes) {
  return [...ids].map((id) => indexes.knowledgeById.get(id)).filter(Boolean);
}

function conflictPairs(units) {
  const ids = new Set(units.map((unit) => unit.id));
  const pairs = new Map();
  for (const unit of units) {
    for (const relation of unit.relationships ?? []) {
      if (relation.type !== 'contradicts' || !ids.has(relation.target)) continue;
      const pair = [unit.id, relation.target].sort();
      pairs.set(pair.join('|'), { units: pair, evidence: [...(relation.evidence ?? [])].sort() });
    }
  }
  return [...pairs.values()].sort((a, b) => a.units.join('|').localeCompare(b.units.join('|')));
}

function selectorUnits(selector, value, model, indexes, asOf) {
  if (selector === 'dimension') return knowledgeList(indexes.byDimension.get(normalizeDimension(value)) ?? [], indexes);
  if (selector === 'type') return knowledgeList(indexes.byType.get(value) ?? [], indexes);
  if (selector === 'status') {
    return model.knowledge.filter((unit) => effectiveStatus(unit, indexes, asOf) === value);
  }
  if (selector === 'scope') return knowledgeForTarget(model, indexes, normalizeScopeSelector(value));
  if (selector === 'decisions') return knowledgeList(indexes.byType.get('decision') ?? [], indexes);
  if (selector === 'constraints') return knowledgeList(indexes.byType.get('constraint') ?? [], indexes);
  if (selector === 'procedures') return knowledgeList(indexes.byType.get('procedure') ?? [], indexes);
  if (selector === 'actors') return knowledgeList(indexes.byType.get('actor') ?? [], indexes);
  if (selector === 'stale') return model.knowledge.filter((unit) => effectiveStatus(unit, indexes, asOf) === 'stale');
  if (selector === 'conflicts') {
    const eligible = model.knowledge.filter((unit) => !['superseded', 'rejected'].includes(effectiveStatus(unit, indexes, asOf)));
    const conflictingIds = new Set(conflictPairs(eligible).flatMap((pair) => pair.units));
    for (const unit of eligible) if (effectiveStatus(unit, indexes, asOf) === 'disputed') conflictingIds.add(unit.id);
    return knowledgeList(conflictingIds, indexes);
  }
  throw new UsageError(`Consulta desconocida: ${selector}.`);
}

function catalogResult(model, indexes, asOf) {
  const statuses = {};
  for (const unit of model.knowledge) {
    const status = effectiveStatus(unit, indexes, asOf);
    statuses[status] = (statuses[status] ?? 0) + 1;
  }
  return {
    project: model.project,
    snapshot: model.snapshot,
    counts: { knowledge: model.knowledge.length, evidence: model.evidence.length },
    dimensions: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, indexes.byDimension.get(dimension)?.size ?? 0])),
    types: Object.fromEntries([...indexes.byType.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, ids]) => [key, ids.size])),
    statuses: Object.fromEntries(Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function executeQuery(model, indexes, selectorInput = 'catalog', value, rawOptions = {}) {
  const options = normalizeQueryOptions(rawOptions);
  const asOf = options.asOf ?? model.snapshot.as_of;
  const selector = selectorInput.toLowerCase();
  if (selector === 'catalog') {
    const catalog = catalogResult(model, indexes, asOf);
    const result = { query: { selector, view: 'summary', as_of: asOf }, ...catalog, budget: { max_bytes: options.maxBytes, emitted_bytes: 0, truncated: false, omitted: 0 } };
    settleEmittedBytes(result);
    if (result.budget.emitted_bytes > options.maxBytes) throw new UsageError('--max-bytes es demasiado pequeño para el catálogo estructural mínimo.');
    return result;
  }
  if (selector === 'knowledge' || selector === 'actor') {
    if (!value) throw new UsageError(`query ${selector} requiere un ID.`);
    const unit = indexes.knowledgeById.get(value);
    if (!unit || (selector === 'actor' && unit.type !== 'actor')) return budgetItems({ query: { selector, value, view: options.view, as_of: asOf } }, [], options);
    const view = rawOptions.view ?? 'detail';
    return budgetItems({ query: { selector, value, view, as_of: asOf } }, [projectKnowledge(unit, view, indexes, asOf, options.depth)], options);
  }
  if (selector === 'evidence') {
    if (!value) throw new UsageError('query evidence requiere un ID.');
    const evidence = indexes.evidenceById.get(value);
    const view = rawOptions.view ?? 'detail';
    return budgetItems({ query: { selector, value, view, as_of: asOf } }, evidence ? [projectEvidence(evidence, view)] : [], options);
  }
  if (selector === 'target') return buildTargetContext(model, indexes, value, rawOptions);
  if (['dimension', 'scope', 'type', 'status'].includes(selector) && !value) throw new UsageError(`query ${selector} requiere un valor.`);
  const scopeTarget = selector === 'scope' ? normalizeScopeSelector(value) : null;
  const units = selectorUnits(selector, value, model, indexes, asOf)
    .filter((unit) => visibleUnit(unit, indexes, asOf, options))
    .sort((a, b) => scopeTarget
      ? compareKnowledgeForTarget(a, b, indexes, asOf, scopeTarget, model.project.id)
      : compareKnowledge(a, b, indexes, asOf));
  const items = units.map((unit) => projectKnowledge(unit, options.view, indexes, asOf, options.depth));
  return budgetItems({ query: { selector, ...(value ? { value } : {}), view: options.view, as_of: asOf } }, items, options);
}

function dimensionState(dimension, units, conflicts, indexes, asOf, required) {
  if (!required) return { status: 'not-required', knowledge: [] };
  const related = units.filter((unit) => Object.hasOwn(unit.dimensions, dimension));
  if (related.length === 0) return { status: 'unknown', knowledge: [] };
  const relatedIds = new Set(related.map((unit) => unit.id));
  if (conflicts.some((conflict) => conflict.units.every((id) => relatedIds.has(id))) || related.some((unit) => effectiveStatus(unit, indexes, asOf) === 'disputed')) {
    return { status: 'conflicted', knowledge: [...relatedIds].sort() };
  }
  const current = related.filter((unit) => !['stale', 'superseded', 'rejected'].includes(effectiveStatus(unit, indexes, asOf)));
  if (current.length === 0) return { status: 'stale', knowledge: [...relatedIds].sort() };
  if (current.some((unit) => unit.dimensions[dimension] === 'complete')) return { status: 'resolved', knowledge: current.map((unit) => unit.id).sort() };
  return { status: 'partial', knowledge: current.map((unit) => unit.id).sort() };
}

function finalizeContextBudget(result, allKnowledge, options) {
  const knowledge = allKnowledge.slice(0, options.limit);
  result.knowledge = knowledge;
  while (result.knowledge.length > 0 && byteLength({ ...result, budget: undefined }) > options.maxBytes) result.knowledge.pop();
  result.budget = {
    limit: options.limit,
    max_bytes: options.maxBytes,
    emitted_bytes: 0,
    truncated: result.knowledge.length < allKnowledge.length,
    omitted: allKnowledge.length - result.knowledge.length,
  };
  settleEmittedBytes(result);
  if (result.budget.emitted_bytes > options.maxBytes) throw new UsageError('--max-bytes es demasiado pequeño para la respuesta estructural mínima.');
  return result;
}

export function buildTargetContext(model, indexes, targetInput, rawOptions = {}) {
  if (!targetInput) throw new UsageError('context requiere un target.');
  const options = normalizeQueryOptions(rawOptions, { context: true });
  const asOf = options.asOf ?? model.snapshot.as_of;
  const target = normalizeScopeSelector(targetInput);
  const candidates = knowledgeForTarget(model, indexes, target)
    .filter((unit) => visibleUnit(unit, indexes, asOf, options))
    .sort((a, b) => compareKnowledgeForTarget(a, b, indexes, asOf, target, model.project.id));
  const conflicts = conflictPairs(candidates);
  const required = options.dimensions ?? new Set(DIMENSIONS);
  const dimensions = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, dimensionState(dimension, candidates, conflicts, indexes, asOf, required.has(dimension))]));
  const stale = candidates.filter((unit) => effectiveStatus(unit, indexes, asOf) === 'stale').map((unit) => unit.id).sort();
  const evidence = [...new Set(candidates.flatMap((unit) => unit.evidence))].sort();
  const projected = candidates.map((unit) => projectKnowledge(unit, options.view === 'detail' ? 'detail' : 'summary', indexes, asOf, options.depth));
  const result = {
    target,
    snapshot: model.snapshot.id,
    as_of: asOf,
    dimensions,
    constraints: candidates.filter((unit) => unit.type === 'constraint').map((unit) => unit.id).sort(),
    decisions: candidates.filter((unit) => unit.type === 'decision').map((unit) => unit.id).sort(),
    procedures: candidates.filter((unit) => unit.type === 'procedure').map((unit) => unit.id).sort(),
    actors: candidates.filter((unit) => unit.type === 'actor').map((unit) => unit.id).sort(),
    evidence,
    conflicts,
    stale,
  };
  return finalizeContextBudget(result, projected, options);
}
