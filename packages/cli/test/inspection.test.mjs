import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { commandInspect } from '../src/inspection/command.mjs';
import { inspectProject, inspectionReportDigest, validateInspectionReport } from '../src/inspection/inspection.mjs';
import { stableStringify } from '../src/model/model.mjs';

const execFile = promisify(execFileCallback);
const testRoot = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testRoot, 'fixtures', 'inspection');
const repositoryRoot = join(testRoot, '..', '..', '..');
const fixedClock = () => new Date('2026-08-28T12:00:00.000Z');
const cleanup = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function observations(report, key) {
  return report.evidence.filter((item) => item.observation?.key === key);
}

async function copiedFixture(name) {
  const root = await mkdtemp(join(tmpdir(), `contexxxt-inspect-${name}-`));
  cleanup.push(root);
  await cp(join(fixtureRoot, name), root, { recursive: true });
  return root;
}

async function treeSnapshot(root) {
  const paths = (await readdir(root, { recursive: true })).sort();
  const contents = [];
  for (const path of paths) {
    try {
      contents.push([path, await readFile(join(root, path), 'utf8')]);
    } catch {
      contents.push([path, null]);
    }
  }
  return stableStringify(contents);
}

test('simple Node inspection returns normalized Evidence without executing project commands', async () => {
  const root = join(fixtureRoot, 'simple-node');
  const marker = join(root, 'command-ran.marker');
  const report = await inspectProject(root, { clock: fixedClock });

  assert.deepEqual(await validateInspectionReport(report), []);
  assert.equal(report.catalog.manifests.packages[0].name, 'inspection-simple-node');
  assert.deepEqual(report.catalog.manifests.commands.map((item) => item.category), ['build', 'test']);
  assert.equal(report.catalog.tests.frameworks.includes('node:test'), true);
  assert.equal(report.catalog.ci.jobs[0].job, 'verify');
  assert.deepEqual(report.catalog.ci.commands.map((item) => item.command), [
    'npm run build\nnode scripts/check-output.mjs',
    'npm test',
  ]);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  assert.ok(report.evidence.every((item) => item.observation && item.provider.id === 'native'));
});

test('monorepo inspection preserves package scopes and workspace evidence', async () => {
  const report = await inspectProject(join(fixtureRoot, 'monorepo'), { clock: fixedClock });

  assert.deepEqual(report.catalog.manifests.packages.map((item) => [item.name, item.scope]), [
    ['inspection-monorepo', '.'],
    ['@fixture/api', 'packages/api'],
    ['@fixture/web', 'packages/web'],
  ]);
  assert.deepEqual(report.catalog.manifests.workspaces, ['packages/*']);
  assert.equal(observations(report, 'package.node').length, 3);
});

test('scoped instructions with opposing directives are reported as potential conflicts', async () => {
  const report = await inspectProject(join(fixtureRoot, 'instructions-conflict'), { clock: fixedClock });

  assert.deepEqual(report.catalog.instructions.files, ['AGENTS.md', 'packages/api/AGENTS.md']);
  assert.deepEqual(report.catalog.instructions.potential_conflicts, [{
    subject: 'npm',
    paths: ['AGENTS.md', 'packages/api/AGENTS.md'],
  }]);
});

test('a project without manifests remains inspectable without invented packages', async () => {
  const report = await inspectProject(join(fixtureRoot, 'no-manifest'), { clock: fixedClock });

  assert.equal(report.coverage.status, 'complete');
  assert.deepEqual(report.catalog.manifests.manifests, []);
  assert.deepEqual(report.catalog.manifests.packages, []);
  assert.ok(report.catalog.filesystem.source_roots.includes('src'));
});

test('existing canonical and legacy contexxxt state are detected but never migrated by inspect', async () => {
  const root = await copiedFixture('with-contexxxt');
  const before = await treeSnapshot(root);
  const report = await inspectProject(root, { clock: fixedClock });
  const after = await treeSnapshot(root);

  assert.equal(report.catalog.contexxxt.root, '.contexxxt');
  assert.equal(report.catalog.contexxxt.project_model.schema_version, '1.1.0');
  assert.equal(report.catalog.contexxxt.legacy, null);
  assert.equal(after, before);
});

test('default command is byte-for-byte read-only and explicit output is no-clobber', async () => {
  const root = await copiedFixture('simple-node');
  const before = await treeSnapshot(root);
  const result = await commandInspect([root], {});
  const after = await treeSnapshot(root);

  assert.equal(result.code, 0);
  assert.equal(result.result.mode, 'read-only');
  assert.deepEqual(result.result.changes, []);
  assert.equal(after, before);

  const saved = await commandInspect([root], { output: 'inspection-report.json' });
  assert.deepEqual(saved.result.changes, [{ action: 'created', path: 'inspection-report.json' }]);
  const persisted = JSON.parse(await readFile(join(root, 'inspection-report.json'), 'utf8'));
  assert.deepEqual(await validateInspectionReport(persisted), []);
  await assert.rejects(
    () => commandInspect([root], { output: 'inspection-report.json' }),
    /no se sobrescribirá/,
  );
});

test('same repository state and clock produce byte-identical reports', async () => {
  const root = join(fixtureRoot, 'simple-node');
  const first = await inspectProject(root, { clock: fixedClock });
  const second = await inspectProject(root, { clock: fixedClock });

  assert.equal(stableStringify(first), stableStringify(second));
  assert.equal(first.digest, inspectionReportDigest(first));
  assert.equal(first.report_id, second.report_id);
});

test('file budgets are explicit and deterministically mark partial coverage', async () => {
  const report = await inspectProject(join(fixtureRoot, 'simple-node'), { limit: 1, clock: fixedClock });

  assert.equal(report.coverage.status, 'partial');
  assert.equal(report.coverage.inspected_files, 1);
  assert.ok(report.findings.some((item) => item.code === 'inspection-truncated'));
  assert.deepEqual(await validateInspectionReport(report), []);
});

test('generated build and test caches do not consume the inspection file budget', async () => {
  const root = await copiedFixture('simple-node');
  for (const directory of ['.cxx', '.expo', '.gradle', '.turbo', 'playwright-report', 'Pods', 'test-results']) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, 'large-cache-entry.json'), '{}\n', 'utf8');
  }

  const report = await inspectProject(root, { clock: fixedClock });

  assert.deepEqual(report.catalog.filesystem.generated_directories, [
    '.cxx', '.expo', '.gradle', '.turbo', 'Pods', 'playwright-report', 'test-results',
  ]);
  assert.equal(report.coverage.status, 'complete');
  assert.equal(report.coverage.inspected_files, 6);
});

test('contexxxt dogfood inspection observes Git and leaves the worktree unchanged', async () => {
  const before = await execFile('git', ['-C', repositoryRoot, 'status', '--porcelain=v1', '-z']);
  const report = await inspectProject(repositoryRoot, { clock: fixedClock });
  const after = await execFile('git', ['-C', repositoryRoot, 'status', '--porcelain=v1', '-z']);

  assert.equal(report.repository.git.root, '.');
  assert.equal(report.repository.git.worktrees.some((item) => item.path === '.'), true);
  assert.ok(report.evidence.every((item) => item.revision?.commit === report.repository.git.head));
  assert.equal(report.catalog.manifests.packages.some((item) => item.name === 'contexxxt'), true);
  assert.equal(report.catalog.contexxxt.project_model.schema_version, '1.1.0');
  assert.equal(after.stdout, before.stdout);
  assert.deepEqual(await validateInspectionReport(report), []);
});
