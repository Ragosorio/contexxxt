import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { basename, join } from 'node:path';
import { auditRoot, commandAddSpace, commandAudit, commandDoctor, commandInit, commandSync } from '../src/commands.mjs';
import { parseArgs, pathExists, resolveSafeRoot } from '../src/lib.mjs';

const cleanup = [];

async function fixture(prefix = 'context-os-test-') {
  const path = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('init is idempotent and preserves the manifest on the second run', async () => {
  const root = await fixture();
  const first = await commandInit([root], { providers: [], dry_run: false });
  const manifestBefore = await readFile(join(root, '.contextos', 'manifest.json'), 'utf8');
  const second = await commandInit([root], { providers: [], dry_run: false });
  const manifestAfter = await readFile(join(root, '.contextos', 'manifest.json'), 'utf8');

  assert.equal(first.code, 0);
  assert.ok(first.result.changes.some((change) => change.action === 'created'));
  assert.equal(second.result.changes.filter((change) => change.action === 'created').length, 0);
  assert.equal(manifestAfter, manifestBefore);
});

test('sync preserves a human-owned AGENTS.md and creates a proposal', async () => {
  const root = await fixture();
  const original = '# Human owned\n\nKeep this exact instruction.\n';
  await writeFile(join(root, 'AGENTS.md'), original, 'utf8');
  await commandInit([root], { providers: [], dry_run: false });

  const result = await commandSync([root], { providers: ['codex'], dry_run: false });

  assert.equal(result.code, 1);
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), original);
  assert.equal(result.result.conflicts[0].path, 'AGENTS.md');
  assert.match(result.result.conflicts[0].proposal, /^\.contextos\/patches\//);
});

test('sync detects manual drift in a managed adapter without overwriting it', async () => {
  const root = await fixture();
  await commandInit([root], { providers: [], dry_run: false });
  await commandSync([root], { providers: ['codex'], dry_run: false });
  const path = join(root, 'AGENTS.md');
  const drifted = `${await readFile(path, 'utf8')}\nHuman note.\n`;
  await writeFile(path, drifted, 'utf8');

  const result = await commandSync([root], { providers: ['codex'], dry_run: false });

  assert.equal(result.code, 1);
  assert.equal(await readFile(path, 'utf8'), drifted);
  assert.ok(result.result.conflicts.some((conflict) => conflict.path === 'AGENTS.md'));
});

test('audit reports a sensitive surface without echoing its value', async () => {
  const root = await fixture();
  const fakeValue = ['not', 'a', 'real', 'credential'].join('-');
  await writeFile(join(root, '.env'), `SERVICE_TOKEN=${fakeValue}\n`, 'utf8');

  const result = await commandAudit([root]);
  const serialized = JSON.stringify(result.result);

  assert.ok(result.result.findings.some((finding) => finding.code === 'sensitive-surface' && finding.path === '.env'));
  assert.equal(serialized.includes(fakeValue), false);
});

test('fresh init passes doctor and a valid space can be added', async () => {
  const root = await fixture();
  await commandInit([root], { providers: [], dry_run: false });
  const added = await commandAddSpace(['investigacion'], { path: root });
  const doctor = await commandDoctor([root]);

  assert.equal(added.code, 0);
  assert.match(await readFile(join(root, '.contextos', 'spaces', 'investigacion', 'SPACE.md'), 'utf8'), /id: investigacion/);
  assert.equal(doctor.code, 0);
});

test('dangerous broad roots are rejected', async () => {
  await assert.rejects(() => resolveSafeRoot('/'), /carpeta específica/);
  await assert.rejects(() => resolveSafeRoot(homedir()), /carpeta específica/);
});

test('cloud adapter export writes only inside .contextos/generated', async () => {
  const root = await fixture();
  await commandInit([root], { providers: [], dry_run: false });
  const result = await commandSync([root], { providers: ['chatgpt'], dry_run: false });
  const entries = await readdir(join(root, '.contextos', 'generated', 'chatgpt'));

  assert.equal(result.code, 0);
  assert.deepEqual(entries.sort(), ['custom-instructions.md', 'project-instructions.md']);
});

test('doctor ignores intentional canonical and managed copies after provider sync', async () => {
  const root = await fixture();
  await commandInit([root], { providers: ['codex', 'claude-code'], dry_run: false });

  const doctor = await commandDoctor([root]);

  assert.equal(doctor.code, 0);
  assert.equal(doctor.result.findings.length, 0);
});

test('unsupported providers are rejected before init writes anything', async () => {
  const root = await fixture();

  await assert.rejects(
    () => commandInit([root], { providers: ['codex', 'unsupported'], dry_run: false }),
    /Proveedor no soportado/,
  );

  assert.deepEqual(await readdir(root), []);
});

test('unsupported provider cannot leave an untracked partial sync', async () => {
  const root = await fixture();
  await commandInit([root], { providers: [], dry_run: false });

  await assert.rejects(
    () => commandSync([root], { providers: ['codex', 'unsupported'], dry_run: false }),
    /Proveedor no soportado/,
  );

  assert.equal(await pathExists(join(root, 'AGENTS.md')), false);
  const manifest = JSON.parse(await readFile(join(root, '.contextos', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.managed_files, []);
});

test('doctor rejects managed paths that escape the project', async () => {
  const root = await fixture();
  await commandInit([root], { providers: [], dry_run: false });
  const manifestPath = join(root, '.contextos', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.managed_files.push({
    path: '../outside/secret.md',
    source: '.contextos/runtime/source.md',
    template_version: 1,
    applied_sha256: 'a'.repeat(64),
    generated_sha256: 'a'.repeat(64),
    provider: 'codex',
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const doctor = await commandDoctor([root]);

  assert.equal(doctor.code, 1);
  assert.ok(doctor.result.findings.some((finding) => finding.code === 'managed-path-unsafe'));
});

test('a new root below a symlinked parent resolves to its canonical location', async () => {
  const realParent = await fixture('context-os-real-');
  const linkContainer = await fixture('context-os-link-');
  const linkedParent = join(linkContainer, 'parent-link');
  await symlink(realParent, linkedParent, 'dir');

  const resolved = await resolveSafeRoot(join(linkedParent, 'new-project'), { allowCreate: true });

  assert.equal(resolved, join(await realpath(realParent), 'new-project'));
  assert.equal(basename(resolved), 'new-project');
});

test('init dry-run reports existing files as unchanged', async () => {
  const root = await fixture();
  await commandInit([root], { providers: [], dry_run: false });

  const dryRun = await commandInit([root], { providers: [], dry_run: true });

  assert.equal(dryRun.code, 0);
  assert.ok(dryRun.result.changes.every((change) => change.action === 'unchanged'));
});

test('sync refuses a symlinked managed target without changing its destination', async () => {
  const root = await fixture();
  const external = await fixture('context-os-external-');
  const externalFile = join(external, 'outside.md');
  const original = '# Outside\n\nThis file is not part of the project.\n';
  await writeFile(externalFile, original, 'utf8');
  await commandInit([root], { providers: [], dry_run: false });
  await symlink(externalFile, join(root, 'AGENTS.md'));

  await assert.rejects(
    () => commandSync([root], { providers: ['codex'], dry_run: false }),
    /No se administra un symlink/,
  );

  assert.equal(await readFile(externalFile, 'utf8'), original);
});

test('audit reports when its file budget truncates discovery', async () => {
  const root = await fixture();
  await Promise.all([
    writeFile(join(root, 'a.md'), 'a\n', 'utf8'),
    writeFile(join(root, 'b.md'), 'b\n', 'utf8'),
    writeFile(join(root, 'c.md'), 'c\n', 'utf8'),
  ]);

  const audit = await auditRoot(root, { limit: 2 });

  assert.equal(audit.truncated, true);
  assert.equal(audit.files.length, 2);
  assert.ok(audit.findings.some((finding) => finding.code === 'audit-truncated'));
});

test('add-space dry-run never creates the requested space', async () => {
  const root = await fixture();
  await commandInit([root], { providers: [], dry_run: false });

  const result = await commandAddSpace(['solo-plan'], { path: root, dry_run: true });

  assert.equal(result.result.changes[0].action, 'would-add');
  assert.equal(await pathExists(join(root, '.contextos', 'spaces', 'solo-plan')), false);
});

test('argument parsing rejects ignored options and preserves equals signs in values', () => {
  assert.throws(() => parseArgs(['init', '.', '--dryrun']), /Opción desconocida/);
  assert.throws(() => parseArgs(['init', '.', '--path', '/tmp/elsewhere']), /Opción desconocida/);
  assert.throws(() => parseArgs(['init', '.', '--dry-run=maybe']), /solo admite true o false/);

  const parsed = parseArgs(['add-space', 'demo', '--path=/tmp/context=os']);
  assert.equal(parsed.options.path, '/tmp/context=os');
});
