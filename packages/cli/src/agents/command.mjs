import { rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { atomicWrite, hash, pathExists, readJson, readUtf8, resolveSafeRoot, UsageError, VERSION, writeJson } from '../lib.mjs';

const markerStart = '<!-- contexxxt:agent-adapter:start -->';
const markerEnd = '<!-- contexxxt:agent-adapter:end -->';

function hostConfig(host) {
  if (host === 'codex') return { target: 'AGENTS.md', label: 'Codex' };
  if (host === 'claude-code') return { target: 'CLAUDE.md', label: 'Claude Code' };
  throw new UsageError('agent requiere host codex o claude-code.');
}

function content(host) {
  const { label } = hostConfig(host);
  return `${markerStart}
# contexxxt adapter for ${label}

Before non-trivial project work, use the public contexxxt interface to compile task-specific context:

\`npx contexxxt resolve --target "<target>" --intent "<intent>" --json\`

Use \`contexxxt query\` for a specific KnowledgeUnit or Evidence only when the compact packet leaves a decision-relevant gap. Prefer these commands over reading the complete \`.contexxxt/project-model.json\` except for debugging or audit.

After execution, run the packet's verification requirements. Record only structured observations through \`contexxxt observe ingest\`; never persist raw transcripts or secret values.

The Project Model is canonical. This adapter teaches retrieval; it does not copy project knowledge.
${markerEnd}
`;
}

async function loadManifest(root) {
  const path = join(root, '.contexxxt', 'agent-adapters.json');
  if (!(await pathExists(path))) return { path, value: { schema_version: '1.0.0', adapters: [] } };
  const value = await readJson(path);
  if (value.schema_version !== '1.0.0' || !Array.isArray(value.adapters)) throw new UsageError('Agent adapter manifest inválido.');
  return { path, value };
}

export async function commandAgent(positionals, options) {
  const action = positionals[0] ?? 'status';
  const host = positionals[1] ?? options.host;
  const config = hostConfig(host);
  const root = await resolveSafeRoot(options.root ?? '.');
  const target = join(root, config.target);
  const desired = content(host);
  const manifest = await loadManifest(root);
  const entry = manifest.value.adapters.find((item) => item.host === host);
  if (action === 'status') {
    const exists = await pathExists(target);
    const actual = exists ? await readUtf8(target) : null;
    const state = !exists ? 'absent' : actual === desired ? 'installed' : entry ? 'drifted' : 'user-owned';
    return { code: state === 'drifted' ? 1 : 0, result: { ok: state !== 'drifted', command: 'agent status', version: VERSION, root, summary: `${host}: ${state}.`, data: { host, target: config.target, state, managed: Boolean(entry) } } };
  }
  if (action === 'install') {
    if (await pathExists(target)) {
      const actual = await readUtf8(target);
      if (actual === desired) return { code: 0, result: { ok: true, command: 'agent install', version: VERSION, root, summary: `${config.target} ya contiene el adapter exacto.`, changes: [{ action: 'unchanged', path: config.target }], data: { installed: true, managed: Boolean(entry) } } };
      const proposal = join(root, '.contexxxt', 'proposals', 'agents', `${host}-${config.target}`);
      if (await pathExists(proposal) && await readUtf8(proposal) !== desired) throw new UsageError(`La propuesta existente tiene drift y no será sobrescrita: ${relative(root, proposal)}`);
      if (!(await pathExists(proposal))) await atomicWrite(root, proposal, desired);
      return { code: 1, result: { ok: false, command: 'agent install', version: VERSION, root, summary: `${config.target} es user-owned; se preservó y se generó una propuesta.`, changes: [{ action: 'proposal', path: relative(root, proposal) }], data: { installed: false, managed: false } } };
    }
    await atomicWrite(root, target, desired);
    manifest.value.adapters = manifest.value.adapters.filter((item) => item.host !== host);
    manifest.value.adapters.push({ host, target: config.target, digest: hash(desired), created_by_contexxxt: true });
    manifest.value.adapters.sort((a, b) => a.host.localeCompare(b.host));
    await writeJson(root, manifest.path, manifest.value);
    return { code: 0, result: { ok: true, command: 'agent install', version: VERSION, root, summary: `${host} adapter instalado sin copiar el Project Model.`, changes: [{ action: 'created', path: config.target }, { action: 'updated', path: relative(root, manifest.path) }], data: { installed: true, managed: true } } };
  }
  if (action === 'uninstall') {
    if (!entry) return { code: 0, result: { ok: true, command: 'agent uninstall', version: VERSION, root, summary: `${host}: no hay adapter administrado.`, changes: [] } };
    if (await pathExists(target)) {
      const actual = await readUtf8(target);
      if (hash(actual) !== entry.digest) return { code: 1, result: { ok: false, command: 'agent uninstall', version: VERSION, root, summary: `${config.target} tiene drift y no será eliminado.`, findings: [{ severity: 'error', code: 'managed-adapter-drift', path: config.target, message: 'Restore or reconcile the managed adapter before uninstall.' }] } };
      await rm(target);
    }
    manifest.value.adapters = manifest.value.adapters.filter((item) => item.host !== host);
    await writeJson(root, manifest.path, manifest.value);
    return { code: 0, result: { ok: true, command: 'agent uninstall', version: VERSION, root, summary: `${host} adapter eliminado de forma verificable.`, changes: [{ action: 'deleted', path: config.target }, { action: 'updated', path: relative(root, manifest.path) }] } };
  }
  throw new UsageError('agent admite: install, status o uninstall.');
}
