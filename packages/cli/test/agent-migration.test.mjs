import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commandAgent } from '../src/agents/command.mjs';
import { commandMigrate } from '../src/migration/command.mjs';
import { loadProjectModel } from '../src/model/model.mjs';

const cleanup = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function root() {
  const value = await mkdtemp(join(tmpdir(), 'contexxxt-agent-'));
  cleanup.push(value);
  return value;
}

test('Codex and Claude adapters install only retrieval instructions and uninstall by verified digest', async () => {
  const project = await root();
  const codex = await commandAgent(['install', 'codex'], { root: project });
  const claude = await commandAgent(['install', 'claude-code'], { root: project });
  const agents = await readFile(join(project, 'AGENTS.md'), 'utf8');
  const instructions = await readFile(join(project, 'CLAUDE.md'), 'utf8');

  assert.equal(codex.code, 0);
  assert.equal(claude.code, 0);
  assert.match(agents, /contexxxt resolve/);
  assert.match(instructions, /Project Model is canonical/);
  assert.doesNotMatch(agents, /"knowledge"\s*:/);
  assert.equal((await commandAgent(['status', 'codex'], { root: project })).result.data.state, 'installed');

  assert.equal((await commandAgent(['uninstall', 'codex'], { root: project })).code, 0);
  await assert.rejects(readFile(join(project, 'AGENTS.md')), { code: 'ENOENT' });
  assert.equal(await readFile(join(project, 'CLAUDE.md'), 'utf8'), instructions);
});

test('agent install preserves user-owned instructions and creates a no-clobber proposal', async () => {
  const project = await root();
  await writeFile(join(project, 'AGENTS.md'), '# User instructions\n', 'utf8');
  const result = await commandAgent(['install', 'codex'], { root: project });

  assert.equal(result.code, 1);
  assert.equal(await readFile(join(project, 'AGENTS.md'), 'utf8'), '# User instructions\n');
  assert.match(await readFile(join(project, '.contexxxt', 'proposals', 'agents', 'codex-AGENTS.md'), 'utf8'), /contexxxt resolve/);
});

test('uninstall refuses a drifted managed adapter', async () => {
  const project = await root();
  await commandAgent(['install', 'codex'], { root: project });
  await writeFile(join(project, 'AGENTS.md'), '# Edited by user\n', 'utf8');
  const result = await commandAgent(['uninstall', 'codex'], { root: project });

  assert.equal(result.code, 1);
  assert.equal(await readFile(join(project, 'AGENTS.md'), 'utf8'), '# Edited by user\n');
});

test('legacy migration is explicit, dry-runnable, preserves .contextos, and creates a valid canon', async () => {
  const project = await root();
  await mkdir(join(project, '.contextos'), { recursive: true });
  await writeFile(join(project, '.contextos', 'README.md'), 'Legacy remains available.\n', 'utf8');
  await writeFile(join(project, 'README.md'), '# Fixture project\n', 'utf8');

  const status = await commandMigrate(['status'], { root: project });
  assert.equal(status.result.data.legacy_root, true);
  assert.equal(status.result.data.canonical_model, false);
  const dry = await commandMigrate(['contextos'], { root: project, dry_run: true });
  assert.equal(dry.result.mode, 'dry-run');
  await assert.rejects(readFile(join(project, '.contexxxt', 'project-model.json')), { code: 'ENOENT' });

  const migrated = await commandMigrate(['contextos'], { root: project });
  assert.equal(migrated.code, 0);
  assert.equal(await readFile(join(project, '.contextos', 'README.md'), 'utf8'), 'Legacy remains available.\n');
  const model = await loadProjectModel(project);
  assert.deepEqual(model.errors, []);
  const report = JSON.parse(await readFile(join(project, '.contexxxt', 'migrations', 'contextos-v1.json'), 'utf8'));
  assert.equal(report.legacy_preserved, true);
  assert.equal(report.canonical_switched, true);

  const repeated = await commandMigrate(['contextos'], { root: project });
  assert.deepEqual(repeated.result.changes, []);
});
