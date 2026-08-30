import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { dirname, join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  codebaseMemoryStructuralSnapshot,
  collectStructuralEvidence,
  compareStructuralProviders,
  defaultCodebaseMemoryProject,
  nativeStructuralSnapshot,
} from '../src/structural/providers.mjs';
import { stableStringify, validateProjectModel } from '../src/model/model.mjs';

const execFile = promisify(execFileCallback);
const testRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testRoot, 'fixtures', 'inspection', 'simple-node');
const cli = join(testRoot, '..', 'bin', 'contexxxt.mjs');
const clock = () => new Date('2026-08-29T12:00:00.000Z');
const timer = () => 100;

function fakeTransport({ tools = ['get_architecture', 'index_status'], status = 'ready', architecture } = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async describe() { return { available: true, id: 'codebase-memory', version: '0.test', tools }; },
    async invoke(tool) {
      calls += 1;
      if (tool === 'index_status') return { status, nodes: 10, edges: 12 };
      return architecture ?? {
        total_nodes: 10,
        total_edges: 12,
        node_labels: [{ label: 'Function', count: 4 }],
        edge_types: [{ type: 'CALLS', count: 3 }, { type: 'IMPORTS', count: 2 }],
        entry_points: [{ name: 'main', file: 'src/index.js' }],
        clusters: [{ id: 1, label: 'core' }],
        languages: [{ language: 'JavaScript', file_count: 2 }],
        packages: [{ name: 'fixture', node_count: 4 }],
      };
    },
  };
}

async function evidenceErrors(evidence) {
  return validateProjectModel({
    schema_version: '1.1.0',
    project: { id: 'fixture', name: 'Fixture' },
    snapshot: { id: 'fixture.snapshot', created_at: clock().toISOString(), as_of: '2026-08-29' },
    evidence,
    knowledge: [],
  });
}

test('Native provider emits stable, schema-valid structural Evidence without an optional dependency', async () => {
  const first = await nativeStructuralSnapshot(fixtureRoot, { clock, timer });
  const second = await nativeStructuralSnapshot(fixtureRoot, { clock, timer });

  assert.equal(first.provider.id, 'native');
  assert.equal(first.coverage.gaps.some((gap) => gap.includes('symbol')), true);
  assert.deepEqual(await evidenceErrors(first.evidence), []);
  assert.equal(stableStringify(first), stableStringify(second));
});

test('Codebase Memory provider negotiates capabilities instead of assuming them', async () => {
  const result = await codebaseMemoryStructuralSnapshot(fixtureRoot, {
    clock,
    timer,
    transport: fakeTransport({ tools: ['index_status'] }),
  });

  assert.equal(result.available, false);
  assert.equal(result.warning, 'missing-capabilities:get_architecture');
});

test('non-ready indexes degrade to Native rather than blocking inspection', async () => {
  const collected = await collectStructuralEvidence(fixtureRoot, {
    provider: 'auto',
    clock,
    timer,
    transport: fakeTransport({ status: 'stale' }),
  });

  assert.equal(collected.selected, 'native');
  assert.match(collected.warnings[0], /index-stale/);
  assert.equal(collected.snapshot.provider.id, 'native');
});

test('Codebase Memory results preserve provider, coverage, provenance and freshness gaps', async () => {
  const result = await codebaseMemoryStructuralSnapshot(fixtureRoot, {
    clock,
    timer,
    project: 'fixture-project',
    transport: fakeTransport(),
  });

  assert.equal(result.available, true);
  assert.equal(result.snapshot.repository.project, 'fixture-project');
  assert.equal(result.snapshot.coverage.status, 'partial');
  assert.equal(result.snapshot.structural_summary.entry_points, 1);
  assert.ok(result.snapshot.evidence.every((item) => item.provider.id === 'codebase-memory'));
  assert.ok(result.snapshot.evidence.every((item) => item.locator.uri.startsWith('codebase-memory://fixture-project/')));
  assert.deepEqual(await evidenceErrors(result.snapshot.evidence), []);
});

test('provider comparison reports measured structural deltas without claiming task quality', async () => {
  const result = await compareStructuralProviders(fixtureRoot, {
    clock,
    timer,
    transport: fakeTransport(),
    project: 'fixture-project',
  });

  assert.equal(result.available, true);
  assert.ok(result.claims.includes('more-entry-points-observed'));
  assert.ok(result.claims.includes('more-structural-relation-types-observed'));
  assert.equal(Object.hasOwn(result, 'quality_improvement'), false);
});

test('default project ID is deterministic and portable', () => {
  assert.equal(defaultCodebaseMemoryProject('workspace/My Project'), 'workspace-My-Project');
});

test('public structural inspect command supports explicit Native mode', async () => {
  const { stdout } = await execFile(process.execPath, [cli, 'structural', 'inspect', fixtureRoot, '--provider', 'native', '--json'], { encoding: 'utf8' });
  const result = JSON.parse(stdout);

  assert.equal(result.ok, true);
  assert.equal(result.command, 'structural inspect');
  assert.equal(result.data.selected, 'native');
  assert.equal(result.data.snapshot.provider.id, 'native');
});

test('public command accepts a host-delivered MCP snapshot without a private repository path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'contexxxt-structural-host-'));
  try {
    const snapshot = {
      descriptor: { version: '0.host', tools: ['get_architecture', 'index_status'] },
      status: { status: 'ready', nodes: 10, edges: 12 },
      architecture: {
        total_nodes: 10,
        total_edges: 12,
        edge_types: [{ type: 'CALLS', count: 3 }],
        entry_points: [{ name: 'main', file: 'src/index.js' }],
        clusters: [], languages: [], packages: [],
      },
    };
    await writeFile(join(root, 'cbm-snapshot.json'), `${JSON.stringify(snapshot)}\n`, 'utf8');
    const { stdout } = await execFile(process.execPath, [
      cli, 'structural', 'inspect', root, '--provider', 'codebase-memory', '--snapshot', 'cbm-snapshot.json', '--json',
    ], { encoding: 'utf8' });
    const result = JSON.parse(stdout);

    assert.equal(result.ok, true);
    assert.equal(result.data.selected, 'codebase-memory');
    assert.equal(result.data.snapshot.provider.version, '0.host');
    assert.equal(result.data.snapshot.structural_summary.entry_points, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
