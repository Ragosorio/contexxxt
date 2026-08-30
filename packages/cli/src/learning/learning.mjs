import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hash } from '../lib.mjs';
import { stableStringify } from '../model/model.mjs';
import { validateJsonSchema } from '../model/json-schema.mjs';

export const EXECUTION_OBSERVATION_VERSION = '1.0.0';
export const LEARNING_STORE_VERSION = '1.0.0';

const observationSchemaPath = fileURLToPath(new URL('../../schemas/execution-observation.schema.json', import.meta.url));
const candidateSchemaPath = fileURLToPath(new URL('../../schemas/learning-candidates.schema.json', import.meta.url));

const kindMap = {
  new_fact: 'fact',
  new_constraint: 'constraint',
  new_decision: 'decision',
  new_procedure: 'procedure',
  reinforced: 'reinforcement',
  contradicted: 'contradiction',
  stale: 'stale',
  possible_skill: 'skill',
};

const secretPattern = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|github_pat)-?[a-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9._~+\/-]+=*)/i;

export async function validateExecutionObservation(observation) {
  const schema = JSON.parse(await readFile(observationSchemaPath, 'utf8'));
  const errors = validateJsonSchema(observation, schema);
  for (const assertion of observation.assertions ?? []) {
    if (secretPattern.test(assertion.statement)) {
      errors.push({ code: 'possible-secret', path: `$.assertions.${assertion.id}.statement`, message: 'Assertion may contain a secret value and cannot be persisted.' });
    }
    if (assertion.kind === 'possible_skill' && !assertion.skill_contract) {
      errors.push({ code: 'skill-contract-required', path: `$.assertions.${assertion.id}.skill_contract`, message: 'possible_skill assertions require a skill_contract.' });
    }
  }
  return errors.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}

export async function validateLearningStore(store) {
  const schema = JSON.parse(await readFile(candidateSchemaPath, 'utf8'));
  const errors = validateJsonSchema(store, schema);
  const ids = new Set();
  for (const candidate of store.candidates ?? []) {
    if (ids.has(candidate.id)) errors.push({ code: 'duplicate-candidate-id', path: `$.candidates.${candidate.id}`, message: `Duplicate candidate: ${candidate.id}.` });
    ids.add(candidate.id);
    if (candidate.status === 'promoted' && !candidate.promotion_eval) {
      errors.push({ code: 'promotion-without-eval', path: `$.candidates.${candidate.id}`, message: 'Promoted candidates require promotion_eval.' });
    }
    if (candidate.kind === 'skill' && !candidate.skill_contract) {
      errors.push({ code: 'skill-contract-required', path: `$.candidates.${candidate.id}.skill_contract`, message: 'Skill candidates require a skill_contract.' });
    }
  }
  return errors.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}

export function emptyLearningStore(at) {
  return { schema_version: LEARNING_STORE_VERSION, updated_at: at, candidates: [] };
}

function candidateFingerprint(assertion) {
  return stableStringify({
    kind: kindMap[assertion.kind],
    statement: assertion.statement.trim(),
    scopes: [...assertion.scopes].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    knowledge_id: assertion.knowledge_id ?? null,
    repeat_key: assertion.repeat_key ?? null,
  });
}

function candidateId(assertion) {
  const type = kindMap[assertion.kind];
  return `learning.${type}.${hash(candidateFingerprint(assertion)).slice(0, 16)}`;
}

function initialCandidate(assertion, observation) {
  const id = candidateId(assertion);
  const risk = assertion.risk ?? 'low';
  const suggestedForm = assertion.suggested_form ?? ({
    fact: 'knowledge', constraint: 'constraint', decision: 'decision', procedure: 'procedure',
    reinforcement: 'none', contradiction: 'knowledge', stale: 'knowledge', skill: 'skill',
  })[kindMap[assertion.kind]];
  return {
    id,
    kind: kindMap[assertion.kind],
    statement: assertion.statement.trim(),
    scopes: [...assertion.scopes].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    status: 'candidate',
    support_count: 1,
    observation_ids: [observation.id],
    evidence_refs: [...assertion.evidence_refs].sort(),
    confidence: assertion.confidence,
    authority: assertion.authority,
    risk,
    suggested_form: suggestedForm,
    ...(assertion.knowledge_id ? { knowledge_id: assertion.knowledge_id } : {}),
    ...(assertion.skill_contract ? { skill_contract: structuredClone(assertion.skill_contract) } : {}),
    created_at: observation.observed_at,
    updated_at: observation.observed_at,
    transition_log: [{ from: 'none', to: 'candidate', at: observation.observed_at, reason: 'First structured observation.', evidence: assertion.evidence_refs[0] }],
  };
}

function shouldSupport(candidate) {
  return candidate.support_count >= 2 && candidate.confidence >= 0.7 && candidate.authority !== 'unknown';
}

export function ingestObservation(store, observation) {
  const next = structuredClone(store);
  const byId = new Map(next.candidates.map((candidate) => [candidate.id, candidate]));
  const changes = [];
  for (const assertion of observation.assertions) {
    const id = candidateId(assertion);
    const existing = byId.get(id);
    if (!existing) {
      const candidate = initialCandidate(assertion, observation);
      next.candidates.push(candidate);
      byId.set(id, candidate);
      changes.push({ action: 'candidate-created', id });
      continue;
    }
    if (existing.observation_ids.includes(observation.id)) {
      changes.push({ action: 'unchanged', id });
      continue;
    }
    existing.observation_ids.push(observation.id);
    existing.observation_ids.sort();
    existing.evidence_refs = [...new Set([...existing.evidence_refs, ...assertion.evidence_refs])].sort();
    existing.support_count = existing.observation_ids.length;
    existing.confidence = Math.max(existing.confidence, assertion.confidence);
    existing.updated_at = observation.observed_at;
    if (existing.status === 'candidate' && shouldSupport(existing)) {
      existing.transition_log.push({ from: 'candidate', to: 'supported', at: observation.observed_at, reason: 'Repeated independent observations met the deterministic support threshold.', evidence: assertion.evidence_refs[0] });
      existing.status = 'supported';
      changes.push({ action: 'candidate-supported', id });
    } else changes.push({ action: 'candidate-reinforced', id });
  }
  next.candidates.sort((a, b) => a.id.localeCompare(b.id));
  if (changes.some((item) => item.action !== 'unchanged')) next.updated_at = observation.observed_at;
  return { store: next, changes };
}

export function transitionCandidate(store, id, action, { at, reason, evalRef, supersededBy } = {}) {
  const next = structuredClone(store);
  const candidate = next.candidates.find((item) => item.id === id);
  if (!candidate) return { error: 'candidate-not-found' };
  const from = candidate.status;
  if (action === 'reject') {
    if (!reason) return { error: 'rejection-reason-required' };
    if (['promoted', 'superseded'].includes(from)) return { error: `cannot-reject-${from}` };
    candidate.status = 'rejected';
    candidate.rejection_reason = reason;
  } else if (action === 'promote') {
    if (from !== 'supported') return { error: 'candidate-not-supported' };
    if (!evalRef) return { error: 'promotion-eval-required' };
    candidate.status = 'promoted';
    candidate.promotion_eval = evalRef;
  } else if (action === 'supersede') {
    if (from !== 'promoted') return { error: 'only-promoted-can-be-superseded' };
    if (!supersededBy) return { error: 'superseded-by-required' };
    candidate.status = 'superseded';
    candidate.superseded_by = supersededBy;
  } else return { error: 'unknown-transition' };
  candidate.updated_at = at;
  candidate.transition_log.push({ from, to: candidate.status, at, reason: reason ?? `Explicit ${action} transition.` });
  next.updated_at = at;
  return { store: next, candidate };
}

export function validatePromotionEval(value) {
  const failures = [];
  if (value?.ok !== true) failures.push('eval-not-passing');
  if (!Number.isFinite(value?.comparison?.improvement) || value.comparison.improvement <= 0) failures.push('no-positive-improvement');
  if (!Array.isArray(value?.critical_failures) || value.critical_failures.length > 0) failures.push('critical-failures-present-or-unknown');
  return failures;
}

export function learningProposal(candidate, evalRef, at) {
  return {
    schema_version: '1.0.0',
    kind: 'project-model-learning-proposal',
    candidate_id: candidate.id,
    candidate_kind: candidate.kind,
    statement: candidate.statement,
    scopes: candidate.scopes,
    authority: candidate.authority,
    confidence: candidate.confidence,
    evidence_refs: candidate.evidence_refs,
    evaluation: evalRef,
    created_at: at,
    canonical_model_changed: false,
  };
}

export function detectRevisionDrift(model, inspectionReport, at) {
  const current = inspectionReport.repository.git?.head ?? null;
  const events = [];
  if (!current) return { as_of: at, current_revision: null, events, coverage: 'unknown' };
  if (model.snapshot.revision?.commit && model.snapshot.revision.commit !== current) {
    events.push({
      id: `drift.model-revision.${hash(`${model.snapshot.revision.commit}:${current}`).slice(0, 16)}`,
      kind: 'model_revision_changed',
      severity: 'warning',
      previous: model.snapshot.revision.commit,
      current,
      affected: ['project-model'],
      action: 'reinspect-and-rebuild',
    });
  }
  const affected = model.knowledge.filter((unit) => unit.revision_binding?.valid_at_commit && unit.revision_binding.valid_at_commit !== current).map((unit) => unit.id).sort();
  if (affected.length > 0) {
    events.push({
      id: `drift.knowledge-revision.${hash(`${current}:${affected.join(',')}`).slice(0, 16)}`,
      kind: 'knowledge_revision_mismatch',
      severity: 'warning',
      previous: 'mixed',
      current,
      affected,
      action: 'verify-before-use',
    });
  }
  return { as_of: at, current_revision: current, events, coverage: 'revision-only' };
}
