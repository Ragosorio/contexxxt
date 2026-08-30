import { isAbsolute, join, relative, resolve } from 'node:path';
import { assertInsideRoot, pathExists, readJson, resolveSafeRoot, UsageError, VERSION } from '../lib.mjs';
import { validateLearningStore } from '../learning/learning.mjs';
import { evaluateSkillCandidate, synthesizeSkill, validateSkillBundle } from './synthesizer.mjs';

function scoped(root, value, fallback) {
  const path = value ? (isAbsolute(value) ? resolve(value) : resolve(root, value)) : resolve(root, fallback);
  assertInsideRoot(root, path);
  return path;
}

async function loadCandidates(root, option) {
  const path = scoped(root, option, '.contexxxt/learning-candidates.json');
  if (!(await pathExists(path))) throw new UsageError('Learning Candidate store no encontrado.');
  const store = await readJson(path);
  const errors = await validateLearningStore(store);
  if (errors.length > 0) throw new UsageError(`Learning Candidate store inválido: ${errors.length} errores.`);
  return { path, store };
}

export async function commandSkill(positionals, options) {
  const action = positionals[0] ?? 'validate';
  const root = await resolveSafeRoot(options.root ?? '.');
  if (action === 'synthesize') {
    const id = positionals[1];
    if (!id) throw new UsageError('skill synthesize requiere un LearningCandidate ID.');
    const loaded = await loadCandidates(root, options.store);
    const candidate = loaded.store.candidates.find((item) => item.id === id);
    if (!candidate) throw new UsageError(`Learning Candidate no encontrado: ${id}`);
    if (options.name && options.name !== candidate.skill_contract?.name) throw new UsageError('--name debe coincidir con skill_contract.name.');
    const name = options.name ?? candidate.skill_contract?.name ?? id;
    const output = scoped(root, options.output, join('.contexxxt', 'generated', 'skills', name));
    const result = await synthesizeSkill(root, candidate, output, {
      generatedAt: options.at ? new Date(options.at).toISOString() : new Date().toISOString(),
      storePath: relative(root, loaded.path),
    });
    return {
      code: result.status === 'rejected' || result.status === 'proposal-required' ? 1 : 0,
      result: {
        ok: ['generated', 'unchanged'].includes(result.status),
        command: 'skill synthesize',
        version: VERSION,
        root,
        summary: result.status === 'rejected'
          ? `Skill no generada: ${result.failures.join(', ')}.`
          : `${name}: ${result.status}; generated != promoted.`,
        changes: result.changes.map((item) => ({ ...item, path: relative(root, join(output, item.path)) })),
        data: { status: result.status, failures: result.failures, output: relative(root, output), promoted: false },
      },
    };
  }
  if (!['validate', 'eval'].includes(action)) throw new UsageError('skill admite: synthesize, validate o eval.');
  const value = positionals[1];
  if (!value) throw new UsageError(`skill ${action} requiere la ruta de una skill.`);
  const skillRoot = scoped(root, value);
  const data = action === 'eval' ? await evaluateSkillCandidate(skillRoot) : { errors: await validateSkillBundle(skillRoot) };
  const errors = data.errors;
  return {
    code: errors.length > 0 ? 1 : 0,
    result: {
      ok: errors.length === 0,
      command: `skill ${action}`,
      version: VERSION,
      root,
      summary: errors.length === 0 ? `Skill candidate ${action} determinista pasó.` : `Skill candidate inválida: ${errors.length} errores.`,
      findings: errors.map((error) => ({ severity: 'error', ...error })),
      data,
    },
  };
}
