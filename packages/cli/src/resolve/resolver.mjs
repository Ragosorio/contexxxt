import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hash, UsageError } from '../lib.mjs';
import { DIMENSIONS, effectiveStatus, stableStringify } from '../model/model.mjs';
import { validateJsonSchema } from '../model/json-schema.mjs';
import { buildTargetContext } from '../query/query.mjs';

export const TASK_RESOLUTION_SCHEMA_VERSION = '1.0.0';
export const CONTEXT_PACKET_SCHEMA_VERSION = '1.0.0';
const taskResolutionSchemaPath = fileURLToPath(new URL('../../schemas/task-resolution.schema.json', import.meta.url));
const contextPacketSchemaPath = fileURLToPath(new URL('../../schemas/context-packet.schema.json', import.meta.url));

const changePattern = /\b(add|agrega|anade|change|cambia|modify|modifica|fix|corrige|implement|implementa|refactor|build|crea|create|remove|elimina|test|prueba|validate|valida|publish|publica|release|deploy)\b/i;
const whyPattern = /\b(why|por que|porque|reason|razon|investig|explain|explica|architecture|arquitectura|contract|contrato|schema)\b/i;
const whichPattern = /\b(which|cual|choose|elige|correct|correcto|best|mejor|alternative|alternativa|strategy|estrategia)\b/i;
const whoPattern = /\b(who|quien|owner|propietario|authority|autoridad|publish|publica|release|deploy|production|produccion|approve|aprueba)\b/i;

function normalizedText(value) {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokens(value) {
  return new Set((normalizedText(value).match(/[a-z0-9_:-]{3,}/g) ?? []).map((token) => token.length > 4 && token.endsWith('s') ? token.slice(0, -1) : token));
}

function overlap(left, right) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

export function requiredDimensions(intent, explicit) {
  if (explicit) {
    const values = String(explicit).split(',').map((item) => item.trim()).filter(Boolean);
    const invalid = values.filter((item) => !DIMENSIONS.includes(item));
    if (invalid.length > 0) throw new UsageError(`Dimensiones 7Q inválidas: ${invalid.join(', ')}.`);
    return [...new Set(values)];
  }
  const normalized = normalizedText(intent);
  const required = new Set(['what', 'for_what', 'where']);
  if (changePattern.test(normalized)) required.add('how');
  if (whyPattern.test(normalized)) required.add('why');
  if (whichPattern.test(normalized)) required.add('which');
  if (whoPattern.test(normalized)) required.add('who');
  return DIMENSIONS.filter((dimension) => required.has(dimension));
}

function unitScore(unit, intentTokens, required) {
  const unitTokens = tokens(`${unit.id} ${unit.summary} ${unit.statement} ${stableStringify(unit.payload ?? {})}`);
  const lexical = overlap(intentTokens, unitTokens);
  const dimensionMatches = Object.keys(unit.dimensions).filter((dimension) => required.has(dimension)).length;
  const typeBase = unit.type === 'constraint' ? 100 : unit.type === 'decision' ? 90 : unit.type === 'procedure' ? 55 : unit.type === 'fact' ? 40 : 20;
  return { score: typeBase + lexical * 20 + dimensionMatches * 4 + unit.confidence, lexical, dimensionMatches };
}

function relevanceReason(unit, scored) {
  const reasons = [`type:${unit.type}`];
  if (scored.lexical > 0) reasons.push(`intent-terms:${scored.lexical}`);
  if (scored.dimensionMatches > 0) reasons.push(`required-7q:${scored.dimensionMatches}`);
  reasons.push(`authority:${unit.authority.level}`);
  return reasons;
}

function compactUnit(unit) {
  return {
    id: unit.id,
    summary: unit.summary,
    statement: unit.statement,
    authority: unit.authority,
    confidence: unit.confidence,
    scopes: unit.scopes,
    evidence: unit.evidence.slice(0, 4),
    ...(unit.evidence.length > 4 ? { additional_evidence: unit.evidence.length - 4 } : {}),
  };
}

function verificationRequirements(intent, units, target) {
  const requirements = [];
  if (!changePattern.test(intent)) requirements.push({ kind: 'evidence-review', instruction: 'Verify material conclusions against the referenced evidence before reporting them.' });
  const procedures = units.filter((unit) => unit.type === 'procedure' && unit.payload?.observed_kind === 'declared-command');
  const preferred = ['check', 'test', 'build'];
  if (changePattern.test(intent)) {
    for (const category of preferred) {
      const unit = procedures.find((item) => item.payload.category === category);
      if (!unit) continue;
      requirements.push({ kind: 'declared-command', knowledge: unit.id, category, commands: unit.payload.commands.map((item) => item.command), verified_by_inspection: false });
    }
  }
  if (/project-model|schema|resolver|context packet/i.test(`${target} ${intent}`)) {
    requirements.push({ kind: 'contract', instruction: 'Validate the Project Model and run the focused contract tests after the change.' });
  }
  return requirements;
}

function questionFor(unknown, conflicted) {
  const priority = ['for_what', 'which', 'why', 'who', 'how', 'what', 'where'];
  const dimension = priority.find((item) => conflicted.includes(item)) ?? priority.find((item) => unknown.includes(item));
  if (!dimension) return [];
  return [{ dimension, question: `What project-specific information should resolve ${dimension} for this task?`, reason: conflicted.includes(dimension) ? 'Applicable knowledge conflicts.' : 'No sufficient applicable knowledge was found.' }];
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function packetCollections(units) {
  return {
    facts: units.filter((unit) => ['fact', 'artifact', 'goal', 'actor'].includes(unit.type)).map(compactUnit),
    constraints: units.filter((unit) => unit.type === 'constraint').map(compactUnit),
    decisions: units.filter((unit) => unit.type === 'decision').map(compactUnit),
    procedures: units.filter((unit) => unit.type === 'procedure').map(compactUnit),
  };
}

function createPacketBase({ taskId, target, intent, model, required, dimensions, unknowns, conflicts, assumptions, questions, verification, maxBytes }) {
  return {
    schema_version: CONTEXT_PACKET_SCHEMA_VERSION,
    id: `${taskId}.packet`,
    task: { id: taskId, target, intent },
    model_snapshot: model.snapshot.id,
    required_dimensions: required,
    dimensions: Object.fromEntries(Object.entries(dimensions).map(([dimension, value]) => [dimension, { status: value.status }])),
    facts: [], constraints: [], decisions: [], procedures: [],
    risks: conflicts.length ? ['Applicable Project Model knowledge is conflicted.'] : [],
    relevant_sources: [],
    unknowns,
    conflicts,
    assumptions,
    questions,
    verification_requirements: verification,
    inclusions: [],
    omissions: [],
    budget: { max_bytes: maxBytes, emitted_bytes: 0, estimated_tokens: 0, knowledge_units: 0, evidence_references: 0, retrieval_depth: 2, truncated: false },
  };
}

function compilePacket(input, ranked, maxBytes) {
  const packet = createPacketBase({ ...input, maxBytes });
  const included = [];
  const omitted = [];
  for (const item of ranked) {
    const nextUnits = [...included, item.unit];
    const collections = packetCollections(nextUnits);
    const candidate = {
      ...packet,
      ...collections,
      relevant_sources: [...new Set(nextUnits.flatMap((unit) => unit.evidence))].sort(),
      inclusions: [...packet.inclusions, { knowledge: item.unit.id, reasons: item.reasons }],
    };
    if (bytes(candidate) <= maxBytes) {
      included.push(item.unit);
      Object.assign(packet, candidate);
    } else omitted.push({ knowledge: item.unit.id, reason: 'context-packet-budget' });
  }
  packet.omissions = omitted.length > 0 ? [{ reason: 'context-packet-budget', count: omitted.length }] : [];
  packet.budget.truncated = omitted.length > 0;
  packet.budget.omitted_knowledge = omitted.length;
  packet.budget.knowledge_units = included.length;
  packet.budget.evidence_references = packet.relevant_sources.length;
  packet.budget.emitted_bytes = bytes(packet);
  packet.budget.estimated_tokens = Math.ceil(packet.budget.emitted_bytes / 4);
  if (packet.budget.emitted_bytes > maxBytes) throw new UsageError('El budget es demasiado pequeño para el ContextPacket mínimo.');
  packet.id = `${input.taskId}.packet.${hash(stableStringify({ ...packet, id: null, budget: { ...packet.budget, emitted_bytes: 0, estimated_tokens: 0 } })).slice(0, 12)}`;
  packet.budget.emitted_bytes = bytes(packet);
  packet.budget.estimated_tokens = Math.ceil(packet.budget.emitted_bytes / 4);
  if (packet.budget.emitted_bytes > maxBytes) throw new UsageError('El budget es demasiado pequeño para el ContextPacket mínimo.');
  return { packet, included, omitted };
}

export function resolveTask(model, indexes, { target, intent, dimensions, maxBytes = 12288 }) {
  if (!target) throw new UsageError('resolve requiere --target.');
  if (!intent?.trim()) throw new UsageError('resolve requiere --intent.');
  const required = requiredDimensions(intent, dimensions);
  const requiredSet = new Set(required);
  const targetContext = buildTargetContext(model, indexes, target, { dimensions: required.join(','), view: 'detail', limit: '1000', max_bytes: '1000000' });
  const intentTokens = tokens(intent);
  const candidateMap = new Map(targetContext.knowledge.map((item) => [item.id, indexes.knowledgeById.get(item.id)]).filter(([, unit]) => Boolean(unit)));
  for (const unit of model.knowledge) {
    if (candidateMap.has(unit.id) || !['active', 'disputed'].includes(effectiveStatus(unit, indexes, model.snapshot.as_of))) continue;
    const scored = unitScore(unit, intentTokens, requiredSet);
    if (scored.lexical > 0 && ['constraint', 'decision', 'procedure'].includes(unit.type)) candidateMap.set(unit.id, unit);
  }
  const candidates = [...candidateMap.values()];
  const ranked = candidates.map((unit, position) => {
    const scored = unitScore(unit, intentTokens, requiredSet);
    return { unit, position, ...scored, reasons: relevanceReason(unit, scored) };
  }).filter((item) => {
    if (item.unit.type === 'artifact') return item.lexical > 0 || item.unit.payload?.observed_kind === 'instructions';
    if (item.unit.type === 'procedure' && item.unit.payload?.observed_kind === 'declared-command') return item.lexical > 0;
    return true;
  })
    .sort((a, b) => b.score - a.score || a.position - b.position || a.unit.id.localeCompare(b.unit.id));

  const dimensionEntries = Object.fromEntries(required.map((dimension) => [dimension, targetContext.dimensions[dimension]]));
  const unknowns = required.filter((dimension) => dimensionEntries[dimension].status === 'unknown' || dimensionEntries[dimension].status === 'stale');
  const conflicted = required.filter((dimension) => dimensionEntries[dimension].status === 'conflicted');
  const conflicts = [
    ...targetContext.conflicts,
    ...conflicted.map((dimension) => ({ dimension, units: dimensionEntries[dimension].knowledge, reason: 'dimension-status-conflicted' })),
  ];
  const assumptions = [];
  if (!dimensions) assumptions.push('Required 7Q dimensions were selected by deterministic local-rules-v1; a host may override them explicitly.');
  const questions = questionFor(unknowns, conflicted);
  const taskId = `task.${hash(stableStringify({ target, intent, snapshot: model.snapshot.id, required })).slice(0, 16)}`;
  const verification = verificationRequirements(intent, candidates, target);
  const compiled = compilePacket({ taskId, target, intent, model, required, dimensions: dimensionEntries, unknowns, conflicts, assumptions, questions, verification }, ranked, maxBytes);
  const resolution = {
    schema_version: TASK_RESOLUTION_SCHEMA_VERSION,
    id: `${taskId}.resolution`,
    task: { id: taskId, target, intent },
    model_snapshot: model.snapshot.id,
    resolver: { id: 'local-rules-v1', mode: dimensions ? 'host-directed-dimensions' : 'deterministic-fallback', provider_neutral: true },
    required_dimensions: required,
    dimensions: dimensionEntries,
    can_proceed: unknowns.length === 0 && conflicted.length === 0,
    unknowns,
    conflicts,
    assumptions,
    questions,
    selected_knowledge: compiled.included.map((unit) => unit.id),
    omitted_knowledge: compiled.omitted,
    verification_requirements: verification,
    context_packet: compiled.packet.id,
  };
  return { resolution, packet: compiled.packet };
}

async function validateAgainst(path, value) {
  const schema = JSON.parse(await readFile(path, 'utf8'));
  return validateJsonSchema(value, schema);
}

export function validateTaskResolution(value) {
  return validateAgainst(taskResolutionSchemaPath, value);
}

export function validateContextPacket(value) {
  return validateAgainst(contextPacketSchemaPath, value);
}
