import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { atomicWrite, hash, pathExists, readJson } from '../lib.mjs';

export const GENERATED_SKILL_VERSION = '1.0.0';

function yamlString(value) {
  return JSON.stringify(value);
}

function skillMarkdown(candidate) {
  const contract = candidate.skill_contract;
  const workflow = contract.workflow.map((step, index) => `${index + 1}. ${step}`).join('\n');
  const verification = contract.verification.map((item) => `- ${item}`).join('\n');
  return `---
name: ${contract.name}
description: ${yamlString(contract.description)}
---

# ${contract.name}

Use the project's public contexxxt commands so the Project Model remains the source of truth. Load detailed KnowledgeUnits or raw Evidence only when the compact result leaves a decision-relevant gap.

## Workflow

${workflow}

## Verification

${verification}

## Contract

- Prefer \`contexxxt resolve --target <target> --intent <intent>\` before non-trivial work.
- Follow the packet's constraints, decisions, unknowns and verification requirements.
- Record structured verification through \`contexxxt observe ingest\`; do not store raw transcripts or secret values.
- Treat this bundle as compiled routing/workflow, not canonical project knowledge.
`;
}

function evals(candidate) {
  const contract = candidate.skill_contract;
  const rows = [];
  let id = 1;
  for (const prompt of contract.positive_triggers) {
    rows.push({ id: id++, prompt, expected_output: 'The skill should trigger and route the task through contexxxt resolve before implementation.', files: [], expectations: ['The skill triggers.', 'A compact ContextPacket is requested before non-trivial work.'] });
  }
  for (const prompt of contract.negative_triggers) {
    rows.push({ id: id++, prompt, expected_output: 'The skill should not trigger because the task does not need project-specific context compilation.', files: [], expectations: ['The skill does not trigger.'] });
  }
  for (const boundary of contract.boundary_triggers) {
    rows.push({ id: id++, prompt: boundary.prompt, expected_output: boundary.should_trigger ? 'The skill should trigger at this boundary.' : 'The skill should not trigger at this boundary.', files: [], expectations: [`The skill ${boundary.should_trigger ? 'triggers' : 'does not trigger'}.`] });
  }
  return { skill_name: contract.name, evals: rows };
}

function routingCases(candidate) {
  const contract = candidate.skill_contract;
  return {
    schema_version: '1.0.0',
    cases: [
      ...contract.positive_triggers.map((prompt) => ({ prompt, should_trigger: true, class: 'positive' })),
      ...contract.negative_triggers.map((prompt) => ({ prompt, should_trigger: false, class: 'negative' })),
      ...contract.boundary_triggers.map((item) => ({ ...item, class: 'boundary' })),
    ],
  };
}

function eligibility(candidate) {
  const failures = [];
  if (candidate.status !== 'supported') failures.push('candidate-not-supported');
  if (candidate.kind !== 'skill') failures.push('candidate-kind-is-not-skill');
  if (candidate.suggested_form !== 'skill') failures.push('smaller-artifact-preferred');
  if (candidate.support_count < 2) failures.push('insufficient-repetition');
  if (candidate.confidence < 0.8) failures.push('confidence-below-threshold');
  if (candidate.authority === 'unknown') failures.push('authority-unknown');
  if (['high', 'critical'].includes(candidate.risk)) failures.push('risk-requires-human-authority');
  if (!candidate.skill_contract) failures.push('skill-contract-missing');
  return failures;
}

function desiredFiles(candidate, { generatedAt, storePath }) {
  const skill = skillMarkdown(candidate);
  const evalSuite = `${JSON.stringify(evals(candidate), null, 2)}\n`;
  const routing = `${JSON.stringify(routingCases(candidate), null, 2)}\n`;
  const contents = {
    'SKILL.md': skill,
    'evals/evals.json': evalSuite,
    'evals/routing.json': routing,
  };
  const manifest = {
    schema_version: GENERATED_SKILL_VERSION,
    kind: 'contexxxt-generated-skill',
    status: 'generated',
    name: candidate.skill_contract.name,
    candidate_id: candidate.id,
    generated_at: generatedAt,
    source: { candidate_store: storePath, project_model: '.contexxxt/project-model.json' },
    target_agents: ['codex', 'claude-code'],
    canonical_knowledge_source: '.contexxxt/project-model.json',
    files: Object.entries(contents).map(([path, content]) => ({ path, digest: hash(content), bytes: Buffer.byteLength(content) })),
    promotion: { status: 'pending-behavioral-eval', generated_is_promoted: false },
  };
  contents['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
  return contents;
}

export async function synthesizeSkill(root, candidate, outputRoot, { generatedAt, storePath }) {
  const failures = eligibility(candidate);
  if (failures.length > 0) return { status: 'rejected', failures, changes: [] };
  const files = desiredFiles(candidate, { generatedAt, storePath });
  const changes = [];
  let conflict = false;
  for (const [relativePath, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const path = join(outputRoot, relativePath);
    if (!(await pathExists(path))) {
      changes.push({ action: 'create', path: relativePath, content });
      continue;
    }
    const existing = await readFile(path, 'utf8');
    if (existing === content) changes.push({ action: 'unchanged', path: relativePath });
    else {
      conflict = true;
      changes.push({ action: 'conflict', path: relativePath, expected_digest: hash(content), actual_digest: hash(existing) });
    }
  }
  if (conflict) return { status: 'proposal-required', failures: ['generated-bundle-drift'], changes };
  for (const change of changes) {
    if (change.action === 'create') await atomicWrite(root, join(outputRoot, change.path), change.content);
  }
  return {
    status: changes.some((item) => item.action === 'create') ? 'generated' : 'unchanged',
    failures: [],
    changes: changes.map(({ content, ...item }) => item),
    name: candidate.skill_contract.name,
  };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};
  const values = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    try { values[key] = JSON.parse(raw); } catch { values[key] = raw; }
  }
  return values;
}

export async function validateSkillBundle(skillRoot) {
  const errors = [];
  const required = ['SKILL.md', 'manifest.json', 'evals/evals.json', 'evals/routing.json'];
  for (const path of required) if (!(await pathExists(join(skillRoot, path)))) errors.push({ code: 'missing-file', path });
  if (errors.length > 0) return errors;
  let manifest;
  let evalSuite;
  let routing;
  try {
    manifest = await readJson(join(skillRoot, 'manifest.json'));
    evalSuite = await readJson(join(skillRoot, 'evals/evals.json'));
    routing = await readJson(join(skillRoot, 'evals/routing.json'));
  } catch {
    return [{ code: 'invalid-json', path: skillRoot }];
  }
  const skill = await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
  const frontmatter = parseFrontmatter(skill);
  if (!frontmatter.name || !frontmatter.description) errors.push({ code: 'invalid-frontmatter', path: 'SKILL.md' });
  if (frontmatter.name !== basename(skillRoot) || manifest.name !== frontmatter.name || evalSuite.skill_name !== frontmatter.name) errors.push({ code: 'name-mismatch', path: 'SKILL.md' });
  if (Buffer.byteLength(skill) > 12000) errors.push({ code: 'skill-router-too-large', path: 'SKILL.md' });
  if (!Array.isArray(evalSuite.evals) || evalSuite.evals.length < 5) errors.push({ code: 'insufficient-evals', path: 'evals/evals.json' });
  const classes = new Set((routing.cases ?? []).map((item) => item.class));
  for (const expected of ['positive', 'negative', 'boundary']) if (!classes.has(expected)) errors.push({ code: 'missing-routing-class', path: `evals/routing.json:${expected}` });
  for (const file of manifest.files ?? []) {
    const path = join(skillRoot, file.path);
    if (!(await pathExists(path))) errors.push({ code: 'manifest-broken-reference', path: file.path });
    else if (hash(await readFile(path, 'utf8')) !== file.digest) errors.push({ code: 'manifest-drift', path: file.path });
  }
  return errors.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}

export async function evaluateSkillCandidate(skillRoot) {
  const errors = await validateSkillBundle(skillRoot);
  const skill = errors.some((item) => item.path === 'SKILL.md') ? '' : await readFile(join(skillRoot, 'SKILL.md'), 'utf8');
  const routing = errors.some((item) => item.path.startsWith('evals/routing')) ? { cases: [] } : await readJson(join(skillRoot, 'evals/routing.json'));
  const counts = { positive: 0, negative: 0, boundary: 0 };
  for (const item of routing.cases ?? []) counts[item.class] += 1;
  const deterministic = {
    structure_valid: errors.length === 0,
    progressive_disclosure: Buffer.byteLength(skill) <= 12000,
    positive_cases: counts.positive,
    negative_cases: counts.negative,
    boundary_cases: counts.boundary,
    skill_bytes: Buffer.byteLength(skill),
  };
  return {
    ok: errors.length === 0 && counts.positive >= 2 && counts.negative >= 2 && counts.boundary >= 1,
    errors,
    deterministic,
    behavioral_comparison: { status: 'not-run', promoted: false, reason: 'Phase 8 baseline/variant agent runs are required.' },
  };
}
