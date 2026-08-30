import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { hash, portablePath, VERSION } from '../lib.mjs';
import { inspectProject } from '../inspection/inspection.mjs';
import { stableStringify } from '../model/model.mjs';

const execFile = promisify(execFileCallback);

export const STRUCTURAL_SNAPSHOT_VERSION = '1.0.0';

function iso(clock) {
  return clock().toISOString();
}

function compactValue(value, maxBytes = 4000) {
  const serialized = stableStringify(value);
  return Buffer.byteLength(serialized) <= maxBytes ? serialized : `${serialized.slice(0, maxBytes - 32)}...<truncated:${Buffer.byteLength(serialized)}> `;
}

function evidence({ id, summary, value, key, observedAt, provider, coverage, uri = '.', revision }) {
  const serialized = compactValue(value);
  return {
    id: `structural.${provider.id}.${id}.${hash(serialized).slice(0, 12)}`,
    type: 'repository_fact',
    summary: summary.slice(0, 240),
    observation: { category: 'structural', key, value: serialized },
    locator: { uri },
    digest: hash(serialized),
    observed_at: observedAt,
    ...(revision ? { revision } : {}),
    provider,
    coverage,
    authority: { level: 'observational', subject: key },
    sensitivity: 'public',
  };
}

function metrics(startedAt, toolCalls, payload, timer) {
  return {
    tool_calls: toolCalls,
    duration_ms: Math.max(0, Math.round(timer() - startedAt)),
    result_bytes: Buffer.byteLength(stableStringify(payload)),
    evidence_count: payload.evidence.length,
  };
}

function nativeEvidence(report, observedAt) {
  const provider = { id: 'native', version: VERSION, capabilities_used: ['topology', 'manifests', 'commands', 'documentation', 'instructions'] };
  const coverage = {
    status: 'partial',
    scopes: [{ kind: 'project', value: '*' }],
    gaps: ['Native inspection does not claim complete symbol, caller, data-flow, or impact coverage.'],
  };
  const revision = report.repository.git ? {
    commit: report.repository.git.head,
    branch: report.repository.git.branch,
    dirty: Boolean(report.repository.git.status?.changed || report.repository.git.status?.untracked),
  } : undefined;
  const items = [
    ['topology', 'structural.topology', 'Native inspection found repository topology.', {
      source_roots: report.catalog.filesystem.source_roots,
      test_roots: report.catalog.filesystem.test_roots,
      generated_directories: report.catalog.filesystem.generated_directories,
    }],
    ['packages', 'structural.packages', `Native inspection found ${report.catalog.manifests.packages.length} package descriptors.`, report.catalog.manifests.packages],
    ['commands', 'structural.commands', `Native inspection found ${report.catalog.manifests.commands.length} declared project commands.`, report.catalog.manifests.commands],
    ['documentation', 'structural.documentation', `Native inspection found ${report.catalog.documentation.length} documentation sources.`, report.catalog.documentation],
    ['instructions', 'structural.instructions', `Native inspection found ${report.catalog.instructions.files.length} agent instruction sources.`, report.catalog.instructions],
  ];
  return items.map(([id, key, summary, value]) => evidence({ id, key, summary, value, observedAt, provider, coverage, revision }));
}

export async function nativeStructuralSnapshot(root, { clock = () => new Date(), timer = () => performance.now(), limit = 10000 } = {}) {
  const startedAt = timer();
  const report = await inspectProject(root, { clock, limit });
  const observedAt = iso(clock);
  const base = {
    schema_version: STRUCTURAL_SNAPSHOT_VERSION,
    provider: { id: 'native', version: VERSION, capabilities: ['topology', 'manifests', 'commands', 'documentation', 'instructions'] },
    repository: { root: '.', revision: report.repository.git?.head ?? null },
    coverage: {
      status: 'partial',
      gaps: ['No complete symbol, caller, data-flow, or impact graph.'],
    },
    warnings: [],
    evidence: nativeEvidence(report, observedAt),
  };
  return { ...base, metrics: metrics(startedAt, 1, base, timer) };
}

function parseTools(help) {
  const match = help.match(/Tools:\s*([\s\S]*?)(?:\n\n|$)/);
  if (!match) return [];
  return [...new Set(match[1].split(/[\s,]+/).map((item) => item.trim()).filter((item) => /^[a-z][a-z0-9_]+$/.test(item)))].sort();
}

function parseJsonOutput(stdout, tool) {
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* logs are not payloads */ }
  }
  throw new Error(`${tool} did not return a JSON payload.`);
}

export function createCodebaseMemoryCliTransport({ executable = 'codebase-memory-mcp', run = execFile } = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async describe() {
      try {
        const [{ stdout: versionOut }, { stdout: helpOut }] = await Promise.all([
          run(executable, ['--version'], { encoding: 'utf8', maxBuffer: 1024 * 1024 }),
          run(executable, ['--help'], { encoding: 'utf8', maxBuffer: 1024 * 1024 }),
        ]);
        return { available: true, id: 'codebase-memory', version: versionOut.trim().split(/\s+/).at(-1), tools: parseTools(helpOut) };
      } catch (error) {
        return { available: false, id: 'codebase-memory', version: null, tools: [], reason: error?.code === 'ENOENT' ? 'executable-not-found' : 'capability-probe-failed' };
      }
    },
    async invoke(tool, input) {
      calls += 1;
      try {
        const { stdout } = await run(executable, ['cli', tool, JSON.stringify(input)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
        return parseJsonOutput(stdout, tool);
      } catch (error) {
        const stdout = error?.stdout == null ? '' : String(error.stdout);
        const stderr = error?.stderr == null ? '' : String(error.stderr);
        if (stdout.trim()) return parseJsonOutput(stdout, tool);
        if (stderr.trim()) return parseJsonOutput(stderr, tool);
        throw error;
      }
    },
  };
}

export function createCodebaseMemorySnapshotTransport(payload) {
  let calls = 0;
  const descriptor = payload?.descriptor ?? {};
  const tools = descriptor.tools ?? [
    ...(payload?.status ? ['index_status'] : []),
    ...(payload?.architecture ? ['get_architecture'] : []),
  ];
  return {
    get calls() { return calls; },
    async describe() {
      return {
        available: Boolean(payload?.architecture),
        id: 'codebase-memory',
        version: descriptor.version ?? 'host-snapshot',
        tools: [...new Set(tools)].sort(),
        ...(!payload?.architecture ? { reason: 'snapshot-missing-architecture' } : {}),
      };
    },
    async invoke(tool) {
      calls += 1;
      if (tool === 'index_status') return payload.status;
      if (tool === 'get_architecture') return payload.architecture;
      throw new Error(`Snapshot does not contain ${tool}.`);
    },
  };
}

export function defaultCodebaseMemoryProject(root) {
  return portablePath(root).replace(/^\/+/, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

function cbmEvidence(architecture, { descriptor, project, observedAt, capabilitiesUsed }) {
  const provider = {
    id: 'codebase-memory',
    version: descriptor.version,
    capabilities_used: capabilitiesUsed,
  };
  const coverage = {
    status: 'partial',
    scopes: [{ kind: 'project', value: '*' }],
    gaps: ['Provider index revision is not exposed; freshness against Git HEAD is unverified.'],
  };
  const items = [
    ['graph', 'structural.graph', `Codebase Memory reports ${architecture.total_nodes ?? 0} nodes and ${architecture.total_edges ?? 0} edges.`, {
      total_nodes: architecture.total_nodes ?? 0,
      total_edges: architecture.total_edges ?? 0,
      node_labels: architecture.node_labels ?? [],
      edge_types: architecture.edge_types ?? [],
    }],
    ['entry-points', 'structural.entry-points', `Codebase Memory reports ${(architecture.entry_points ?? []).length} entry points.`, architecture.entry_points ?? []],
    ['clusters', 'structural.clusters', `Codebase Memory reports ${(architecture.clusters ?? []).length} structural clusters.`, architecture.clusters ?? []],
    ['languages', 'structural.languages', `Codebase Memory reports ${(architecture.languages ?? []).length} indexed languages.`, architecture.languages ?? []],
    ['packages', 'structural.packages', `Codebase Memory reports ${(architecture.packages ?? []).length} structural packages.`, architecture.packages ?? []],
  ];
  return items.map(([id, key, summary, value]) => evidence({
    id, key, summary, value, observedAt, provider, coverage, uri: `codebase-memory://${project}/${id}`,
  }));
}

export async function codebaseMemoryStructuralSnapshot(root, {
  clock = () => new Date(),
  timer = () => performance.now(),
  project = defaultCodebaseMemoryProject(root),
  transport = createCodebaseMemoryCliTransport(),
} = {}) {
  const startedAt = timer();
  const descriptor = await transport.describe();
  if (!descriptor.available) return { available: false, descriptor, warning: descriptor.reason };
  const required = ['get_architecture'];
  const missing = required.filter((tool) => !descriptor.tools.includes(tool));
  if (missing.length > 0) return { available: false, descriptor, warning: `missing-capabilities:${missing.join(',')}` };
  try {
    let status = null;
    const providerWarnings = [];
    const capabilitiesUsed = [];
    if (descriptor.tools.includes('index_status')) {
      try {
        status = await transport.invoke('index_status', { project });
        capabilitiesUsed.push('index_status');
        if (status.status && status.status !== 'ready') return { available: false, descriptor, warning: `index-${status.status}`, status };
        if (status.error) providerWarnings.push(`Index status could not be confirmed: ${status.error}.`);
      } catch {
        providerWarnings.push('Provider index status call failed; architecture may still be queried read-only.');
      }
    } else providerWarnings.push('Provider does not expose index_status; index readiness is unconfirmed.');
    const architecture = await transport.invoke('get_architecture', { project });
    capabilitiesUsed.push('get_architecture');
    if (architecture.error) return { available: false, descriptor, warning: 'architecture-unavailable', detail: architecture.error };
    const observedAt = iso(clock);
    const base = {
      schema_version: STRUCTURAL_SNAPSHOT_VERSION,
      provider: { id: 'codebase-memory', version: descriptor.version, capabilities: capabilitiesUsed.sort() },
      repository: { root: '.', project, revision: null },
      coverage: {
        status: 'partial',
        gaps: ['Provider index revision is not exposed; freshness against Git HEAD is unverified.'],
      },
      warnings: [
        'Structural evidence is observational; absence in the graph does not prove inexistence.',
        ...providerWarnings,
      ],
      evidence: cbmEvidence(architecture, { descriptor, project, observedAt, capabilitiesUsed: capabilitiesUsed.sort() }),
      structural_summary: {
        nodes: architecture.total_nodes ?? status.nodes ?? 0,
        edges: architecture.total_edges ?? status.edges ?? 0,
        entry_points: (architecture.entry_points ?? []).length,
        clusters: (architecture.clusters ?? []).length,
        relation_types: (architecture.edge_types ?? []).length,
      },
    };
    return { available: true, snapshot: { ...base, metrics: metrics(startedAt, transport.calls, base, timer) } };
  } catch (error) {
    return { available: false, descriptor, warning: 'provider-call-failed', detail: error?.message };
  }
}

function measurement(snapshot) {
  const capabilities = new Set(snapshot.provider.capabilities);
  const structural = snapshot.structural_summary ?? {};
  return {
    provider: snapshot.provider.id,
    coverage: snapshot.coverage.status,
    evidence: snapshot.metrics.evidence_count,
    result_bytes: snapshot.metrics.result_bytes,
    tool_calls: snapshot.metrics.tool_calls,
    duration_ms: snapshot.metrics.duration_ms,
    capabilities: [...capabilities].sort(),
    entry_points: structural.entry_points ?? 0,
    relation_types: structural.relation_types ?? 0,
    clusters: structural.clusters ?? 0,
  };
}

export async function compareStructuralProviders(root, options = {}) {
  const native = await nativeStructuralSnapshot(root, options);
  const optional = await codebaseMemoryStructuralSnapshot(root, options);
  const nativeMeasurement = measurement(native);
  if (!optional.available) {
    return {
      available: false,
      fallback: 'native',
      warning: optional.warning,
      native: nativeMeasurement,
      optional: null,
      claims: [],
    };
  }
  const optionalMeasurement = measurement(optional.snapshot);
  const claims = [];
  if (optionalMeasurement.entry_points > nativeMeasurement.entry_points) claims.push('more-entry-points-observed');
  if (optionalMeasurement.relation_types > nativeMeasurement.relation_types) claims.push('more-structural-relation-types-observed');
  if (optionalMeasurement.clusters > nativeMeasurement.clusters) claims.push('structural-clusters-observed');
  return {
    available: true,
    fallback: null,
    warning: optional.snapshot.coverage.gaps[0],
    native: nativeMeasurement,
    optional: optionalMeasurement,
    deltas: {
      entry_points: optionalMeasurement.entry_points - nativeMeasurement.entry_points,
      relation_types: optionalMeasurement.relation_types - nativeMeasurement.relation_types,
      clusters: optionalMeasurement.clusters - nativeMeasurement.clusters,
      result_bytes: optionalMeasurement.result_bytes - nativeMeasurement.result_bytes,
      tool_calls: optionalMeasurement.tool_calls - nativeMeasurement.tool_calls,
      duration_ms: optionalMeasurement.duration_ms - nativeMeasurement.duration_ms,
    },
    claims,
  };
}

export async function collectStructuralEvidence(root, { provider = 'auto', ...options } = {}) {
  if (provider === 'native') return { selected: 'native', snapshot: await nativeStructuralSnapshot(root, options), warnings: [] };
  if (!['auto', 'codebase-memory'].includes(provider)) throw new Error(`Unknown structural provider: ${provider}`);
  const optional = await codebaseMemoryStructuralSnapshot(root, options);
  if (optional.available) return { selected: 'codebase-memory', snapshot: optional.snapshot, warnings: optional.snapshot.warnings };
  return {
    selected: 'native',
    snapshot: await nativeStructuralSnapshot(root, options),
    warnings: [`Codebase Memory unavailable (${optional.warning}); Native fallback selected.`],
  };
}
