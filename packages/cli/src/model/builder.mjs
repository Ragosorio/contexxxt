import { hash } from '../lib.mjs';
import { PROJECT_MODEL_SCHEMA_VERSION, stableStringify } from './model.mjs';

const BUILDER_ID = 'native-model-builder';

function parsedObservation(evidence) {
  const value = evidence.observation?.value;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function unique(values) {
  return [...new Set(values)].sort();
}

function compactListSummary(prefix, values, maxLength = 240) {
  const suffix = '.';
  const joined = values.join(', ');
  const complete = `${prefix}${joined}${suffix}`;
  if (complete.length <= maxLength) return complete;

  const omittedLabel = (count) => `, +${count} more${suffix}`;
  const included = [];
  for (const value of values) {
    const candidate = [...included, value];
    const omitted = values.length - candidate.length;
    const text = `${prefix}${candidate.join(', ')}${omitted > 0 ? omittedLabel(omitted) : suffix}`;
    if (text.length > maxLength) break;
    included.push(value);
  }

  if (included.length === 0) return `${prefix}${values.length} entries${suffix}`.slice(0, maxLength);
  return `${prefix}${included.join(', ')}${omittedLabel(values.length - included.length)}`;
}

function idPart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown';
}

function evidenceFor(report, keys) {
  const accepted = new Set(keys);
  return report.evidence.filter((item) => accepted.has(item.observation?.key)).map((item) => item.id).sort();
}

function revisionBinding(report, projectId) {
  const git = report.repository?.git;
  if (!git?.head || git.status?.changed > 0 || git.status?.untracked > 0 || git.status?.conflicted > 0) return undefined;
  return { repository: projectId, valid_at_commit: git.head };
}

function generatedBase(report, projectId, { id, type, summary, statement, dimensions, scopes, evidence, status = 'active', payload = {}, confidence = 1 }) {
  return {
    id: `${projectId}.observed.${idPart(id)}`,
    type,
    summary,
    statement,
    dimensions,
    scopes,
    evidence,
    provenance: { created_by: 'compiler', method: type === 'procedure' ? 'declared' : 'observed', created_at: report.generated_at },
    authority: { level: 'observational', subject: `native inspection: ${id}`, source: evidence[0] },
    confidence,
    validity: { observed_at: report.generated_at },
    ...(revisionBinding(report, projectId) ? { revision_binding: revisionBinding(report, projectId) } : {}),
    relationships: [],
    status,
    payload: { ...payload, builder: BUILDER_ID },
  };
}

function digestableUnit(unit) {
  const copy = structuredClone(unit);
  if (copy.payload) delete copy.payload.generated_digest;
  return copy;
}

function finalizeGeneratedUnit(unit) {
  const generated_digest = hash(stableStringify(digestableUnit(unit)));
  return { ...unit, payload: { ...unit.payload, generated_digest } };
}

function createGeneratedUnits(report, projectId) {
  const units = [];
  const structureEvidence = evidenceFor(report, ['filesystem.inventory', 'filesystem.source-root', 'filesystem.test-root', 'package.node', 'workspace.pnpm']);
  if (structureEvidence.length > 0) {
    const packages = report.catalog.manifests.packages.map((item) => item.name ?? item.scope);
    const workspaces = report.catalog.manifests.workspaces;
    const sourceRoots = report.catalog.filesystem.source_roots;
    units.push(generatedBase(report, projectId, {
      id: 'structure', type: 'fact',
      summary: `Native inspection found ${packages.length} package${packages.length === 1 ? '' : 's'} and ${sourceRoots.length} source root${sourceRoots.length === 1 ? '' : 's'}.`,
      statement: `Observed packages: ${packages.length ? packages.join(', ') : 'none'}. Workspace patterns: ${workspaces.length ? workspaces.join(', ') : 'none'}. Source roots: ${sourceRoots.length ? sourceRoots.join(', ') : 'none'}.`,
      dimensions: { what: 'complete', how: 'partial', where: 'complete' },
      scopes: [{ kind: 'project', value: projectId }], evidence: structureEvidence,
      payload: { observed_kind: 'structure', packages, workspaces, source_roots: sourceRoots },
    }));
  }

  const commandGroups = new Map();
  for (const command of report.catalog.manifests.commands) {
    const items = commandGroups.get(command.category) ?? [];
    items.push(command);
    commandGroups.set(command.category, items);
  }
  for (const [category, commands] of [...commandGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const matchingEvidence = report.evidence
      .filter((item) => item.observation?.key === `command.${category}`)
      .map((item) => item.id).sort();
    const scopes = unique(commands.map((item) => item.scope)).map((scope) => scope === '.'
      ? { kind: 'project', value: projectId }
      : { kind: 'directory', value: scope });
    const declarations = commands.map((item) => `${item.package}:${item.name} -> ${item.command}`);
    units.push(generatedBase(report, projectId, {
      id: `command.${category}`, type: 'procedure',
      summary: compactListSummary(
        `Declared ${category} command${commands.length === 1 ? '' : 's'}: `,
        commands.map((item) => item.name),
      ),
      statement: `The manifests declare these ${category} commands: ${declarations.join('; ')}. Inspection did not execute or verify them.`,
      dimensions: { how: 'complete', where: 'complete', for_what: 'partial' },
      scopes, evidence: matchingEvidence, confidence: 0.98,
      payload: { observed_kind: 'declared-command', category, commands, executed: false },
    }));
  }

  const groupedArtifacts = [
    ['ci', 'CI', report.catalog.ci.workflows, evidenceFor(report, ['ci.workflow', 'ci.job', 'ci.command'])],
    ['instructions', 'agent instruction', report.catalog.instructions.files, evidenceFor(report, ['instruction.file', 'instruction.potential-conflict'])],
  ];
  for (const [id, label, paths, refs] of groupedArtifacts) {
    if (paths.length === 0 || refs.length === 0) continue;
    const conflicts = id === 'instructions' ? report.catalog.instructions.potential_conflicts : [];
    units.push(generatedBase(report, projectId, {
      id, type: 'artifact',
      summary: `Native inspection found ${paths.length} ${label} artifact${paths.length === 1 ? '' : 's'}.`,
      statement: `Observed ${label} artifacts: ${paths.join(', ')}.${conflicts.length ? ` ${conflicts.length} potential scoped conflict(s) require semantic review.` : ''}`,
      dimensions: { what: 'complete', where: 'complete', how: id === 'ci' ? 'partial' : undefined },
      scopes: [{ kind: 'project', value: projectId }], evidence: refs,
      status: conflicts.length ? 'disputed' : 'active',
      payload: { observed_kind: id, paths, potential_conflicts: conflicts },
    }));
  }

  return units.map((unit) => {
    unit.dimensions = Object.fromEntries(Object.entries(unit.dimensions).filter(([, value]) => value !== undefined));
    return finalizeGeneratedUnit(unit);
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function isManagedUnit(unit) {
  return unit.provenance?.created_by === 'compiler' && unit.payload?.builder === BUILDER_ID;
}

function managedUnitUnchanged(unit) {
  return unit.payload?.generated_digest === hash(stableStringify(digestableUnit(unit)));
}

function sameEvidenceObservation(a, b) {
  const normalize = (item) => {
    const copy = structuredClone(item);
    delete copy.observed_at;
    return copy;
  };
  return stableStringify(normalize(a)) === stableStringify(normalize(b));
}

function reconcileEvidence(existing, incoming) {
  const retained = existing.filter((item) => !(item.provider?.id === 'native' && item.observation));
  const previous = new Map(existing.filter((item) => item.provider?.id === 'native' && item.observation).map((item) => [item.id, item]));
  for (const item of incoming.filter((candidate) => candidate.observation?.key !== 'contexxxt.project-model')) {
    const prior = previous.get(item.id);
    retained.push(prior && sameEvidenceObservation(prior, item) ? prior : item);
  }
  return retained.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildProjectModel(report, existingModel = null) {
  const projectId = existingModel?.project?.id ?? idPart(report.project.id);
  const evidence = reconcileEvidence(existingModel?.evidence ?? [], report.evidence);
  const inspectionTimes = evidence.filter((item) => item.observation).map((item) => item.observed_at).filter(Boolean).sort();
  const normalizedReport = { ...report, evidence, generated_at: inspectionTimes.at(-1) ?? report.generated_at };
  const generated = createGeneratedUnits(normalizedReport, projectId);
  const generatedById = new Map(generated.map((unit) => [unit.id, unit]));
  const knowledge = [];
  const proposals = [];

  for (const existing of existingModel?.knowledge ?? []) {
    const replacement = generatedById.get(existing.id);
    if (!isManagedUnit(existing)) {
      if (replacement && stableStringify(existing) !== stableStringify(replacement)) {
        proposals.push({ kind: 'knowledge-id-collision', id: existing.id, reason: 'A non-builder KnowledgeUnit owns this stable ID; it was preserved.' });
        generatedById.delete(existing.id);
      }
      knowledge.push(existing);
      continue;
    }
    if (!managedUnitUnchanged(existing)) {
      proposals.push({ kind: replacement ? 'managed-unit-drift' : 'managed-unit-removal-drift', id: existing.id, reason: 'A builder-owned KnowledgeUnit was edited after generation; it was preserved.' });
      knowledge.push(existing);
      generatedById.delete(existing.id);
      continue;
    }
    if (replacement) {
      knowledge.push(replacement);
      generatedById.delete(existing.id);
    }
  }
  knowledge.push(...generatedById.values());
  knowledge.sort((a, b) => a.id.localeCompare(b.id));

  const observedTimes = evidence.map((item) => item.observed_at).filter(Boolean).sort();
  const createdAt = observedTimes.at(-1) ?? report.generated_at;
  const git = report.repository?.git;
  const snapshotSeed = hash(stableStringify({
    evidence: evidence.map((item) => [item.id, item.digest]),
    knowledge: knowledge.map((unit) => [unit.id, unit.payload?.generated_digest ?? hash(stableStringify(unit))]),
    revision: git?.head ?? null,
    dirty: Boolean(git?.status && (git.status.changed > 0 || git.status.untracked > 0 || git.status.conflicted > 0)),
  }));
  const model = {
    schema_version: PROJECT_MODEL_SCHEMA_VERSION,
    project: existingModel?.project ?? { id: projectId, name: report.project.name },
    snapshot: {
      id: `${projectId}.snapshot.${snapshotSeed.slice(0, 16)}`,
      created_at: createdAt,
      as_of: createdAt.slice(0, 10),
      ...(git?.head ? { revision: { commit: git.head, dirty: Boolean(git.status && (git.status.changed > 0 || git.status.untracked > 0 || git.status.conflicted > 0)) } } : {}),
    },
    evidence,
    knowledge,
  };
  return {
    model,
    proposals: proposals.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    stats: {
      evidence: evidence.length,
      generated_knowledge: generated.length,
      preserved_knowledge: knowledge.filter((unit) => !isManagedUnit(unit)).length,
    },
  };
}

export function isBuilderManagedUnit(unit) {
  return isManagedUnit(unit);
}

export function observationValue(evidence) {
  return parsedObservation(evidence);
}
