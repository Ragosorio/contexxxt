import { mkdir, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  SCHEMA_VERSION,
  VERSION,
  acquireLock,
  addDays,
  assertNoSymlinkPath,
  atomicWrite,
  fileSize,
  hash,
  normalizeRelativePath,
  pathExists,
  portablePath,
  readJson,
  readUtf8,
  resolveSafeRoot,
  safeSlug,
  today,
  walkFiles,
  writeJson,
  UsageError,
} from './lib.mjs';
import { listRuntimeFiles, readRuntimeFile } from './templates.mjs';

const contextFilePattern = /(^|\/)(AGENTS(?:\.override)?\.md|CLAUDE(?:\.local)?\.md|SKILL\.md|(?:IDENTITY|PRIVACY|MEMORY_POLICY|SPACE|PROJECT|STATE|SOURCES|DECISIONS|OPEN_QUESTIONS|HANDOFF)\.md|manifest\.json)$/i;
const instructionFilePattern = /(^|\/)(AGENTS(?:\.override)?\.md|CLAUDE(?:\.local)?\.md|SKILL\.md)$/i;
const sensitiveSurfacePattern = /(^|\/)(\.env(?:\..+)?|.*settings\.local\..*|.*\.(?:pem|key|p12))$/i;
const supportedProviders = new Set(['codex', 'claude-code', 'chatgpt', 'claude-chat', 'cowork']);
const cloudProviders = new Set(['chatgpt', 'claude-chat', 'cowork']);

function normalizeProviders(providers, { allowed = supportedProviders, required = true } = {}) {
  const unique = [...new Set(providers ?? [])].sort();
  if (required && unique.length === 0) throw new UsageError('Indica al menos un --provider.');
  const unsupported = unique.filter((provider) => !allowed.has(provider));
  if (unsupported.length > 0) throw new UsageError(`Proveedor no soportado: ${unsupported.join(', ')}`);
  return unique;
}

function validManagedEntry(entry) {
  return Boolean(
    entry
      && typeof entry === 'object'
      && typeof entry.path === 'string'
      && typeof entry.source === 'string'
      && Number.isInteger(entry.template_version)
      && entry.template_version >= 1
      && /^[a-f0-9]{64}$/.test(entry.applied_sha256 ?? '')
      && /^[a-f0-9]{64}$/.test(entry.generated_sha256 ?? '')
      && supportedProviders.has(entry.provider),
  );
}

function emptyManifest(mode = 'existing') {
  return {
    $schema: 'https://raw.githubusercontent.com/Ragosorio/contexxxt/main/schemas/manifest.schema.json',
    schema_version: SCHEMA_VERSION,
    context_os_version: VERSION,
    created_at: today(),
    updated_at: today(),
    mode,
    managed_files: [],
  };
}

function substituteTemplate(content, values = {}) {
  const defaults = {
    '__CREATED_AT__': today(),
    '__UPDATED_AT__': today(),
    '__REVIEW_ON__': addDays(today(), 30),
  };
  return Object.entries({ ...defaults, ...values }).reduce(
    (output, [needle, replacement]) => output.replaceAll(needle, replacement),
    content,
  );
}

async function loadManifest(root, mode = 'existing') {
  const path = join(root, '.contextos', 'manifest.json');
  if (!(await pathExists(path))) return emptyManifest(mode);
  await assertNoSymlinkPath(root, path);
  const manifest = await readJson(path);
  if (manifest.schema_version !== SCHEMA_VERSION || !Array.isArray(manifest.managed_files)) {
    throw new UsageError('El manifiesto no es compatible. Ejecuta context-os doctor antes de sincronizar.');
  }
  if (manifest.managed_files.some((entry) => !validManagedEntry(entry))) {
    throw new UsageError('El manifiesto contiene entradas inválidas. Ejecuta context-os doctor antes de sincronizar.');
  }
  const normalizedEntries = manifest.managed_files.map((entry) => ({
    ...entry,
    path: normalizeRelativePath(entry.path),
    source: portablePath(entry.source),
  }));
  if (new Set(normalizedEntries.map((entry) => entry.path)).size !== normalizedEntries.length) {
    throw new UsageError('El manifiesto contiene rutas administradas duplicadas. Ejecuta context-os doctor.');
  }
  manifest.managed_files = normalizedEntries;
  return manifest;
}

async function saveManifest(root, manifest) {
  manifest.updated_at = today();
  manifest.context_os_version = VERSION;
  manifest.managed_files = manifest.managed_files.map((entry) => ({
    ...entry,
    path: normalizeRelativePath(entry.path),
    source: portablePath(entry.source),
  }));
  manifest.managed_files.sort((a, b) => a.path.localeCompare(b.path));
  await writeJson(root, join(root, '.contextos', 'manifest.json'), manifest);
}

function managedEntry(manifest, path) {
  const normalized = normalizeRelativePath(path);
  return manifest.managed_files.find((entry) => entry.path === normalized);
}

function upsertManagedEntry(manifest, entry) {
  const normalized = {
    ...entry,
    path: normalizeRelativePath(entry.path),
    source: portablePath(entry.source),
  };
  const index = manifest.managed_files.findIndex((item) => item.path === normalized.path);
  if (index === -1) manifest.managed_files.push(normalized);
  else manifest.managed_files[index] = normalized;
}

async function proposalTarget(root, targetRelative) {
  const base = normalizeRelativePath(targetRelative).replaceAll('/', '__');
  let candidate = join(root, '.contextos', 'patches', `${base}.proposed`);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = join(root, '.contextos', 'patches', `${base}.proposed.${index}`);
    index += 1;
  }
  return candidate;
}

async function writeManagedFile({ root, manifest, source, targetRelative, content, provider, dryRun, changes, conflicts }) {
  const normalizedTarget = normalizeRelativePath(targetRelative);
  const normalizedSource = portablePath(source);
  const target = join(root, normalizedTarget);
  await assertNoSymlinkPath(root, target);
  const desiredHash = hash(content);
  const entry = managedEntry(manifest, normalizedTarget);
  const exists = await pathExists(target);

  if (!exists) {
    changes.push({ action: dryRun ? 'would-add' : 'created', path: normalizedTarget });
    if (!dryRun) {
      await atomicWrite(root, target, content);
      upsertManagedEntry(manifest, {
        path: normalizedTarget,
        source: normalizedSource,
        template_version: 1,
        applied_sha256: desiredHash,
        generated_sha256: desiredHash,
        provider,
      });
    }
    return;
  }

  const current = await readUtf8(target);
  const currentHash = hash(current);
  if (entry && currentHash === entry.applied_sha256) {
    if (currentHash === desiredHash) {
      changes.push({ action: 'unchanged', path: normalizedTarget });
      return;
    }
    changes.push({ action: dryRun ? 'would-update' : 'updated', path: normalizedTarget });
    if (!dryRun) {
      await atomicWrite(root, target, content);
      upsertManagedEntry(manifest, {
        ...entry,
        source: normalizedSource,
        template_version: 1,
        applied_sha256: desiredHash,
        generated_sha256: desiredHash,
        provider,
      });
    }
    return;
  }

  if (!entry && currentHash === desiredHash && content.includes('context-os:managed')) {
    changes.push({ action: dryRun ? 'would-adopt' : 'adopted', path: normalizedTarget });
    if (!dryRun) {
      upsertManagedEntry(manifest, {
        path: normalizedTarget,
        source: normalizedSource,
        template_version: 1,
        applied_sha256: desiredHash,
        generated_sha256: desiredHash,
        provider,
      });
    }
    return;
  }

  const proposal = await proposalTarget(root, normalizedTarget);
  const proposalRelative = portablePath(relative(root, proposal));
  conflicts.push({ path: normalizedTarget, proposal: proposalRelative });
  if (!dryRun) await atomicWrite(root, proposal, content);
}

async function sourceTree(root, sourceRelative, targetRelative, provider, context) {
  const sourceRoot = join(root, '.contextos', 'runtime', sourceRelative);
  if (!(await pathExists(sourceRoot))) throw new UsageError(`Falta la fuente canónica: .contextos/runtime/${sourceRelative}`);
  await assertNoSymlinkPath(root, sourceRoot);
  const files = await walkFiles(sourceRoot, { limit: 500 });
  for (const file of files) {
    const content = await readUtf8(join(sourceRoot, file));
    await writeManagedFile({
      ...context,
      root,
      source: `.contextos/runtime/${portablePath(join(sourceRelative, file))}`,
      targetRelative: portablePath(join(targetRelative, file)),
      content,
      provider,
    });
  }
}

async function syncProviders(root, providers, { dryRun = false } = {}) {
  const uniqueProviders = normalizeProviders(providers);
  const manifest = await loadManifest(root);
  const changes = [];
  const conflicts = [];

  const context = { manifest, dryRun, changes, conflicts };
  for (const provider of uniqueProviders) {
    if (provider === 'codex') {
      const sourcePath = join(root, '.contextos', 'runtime', 'adapters', 'codex', 'AGENTS.md');
      await assertNoSymlinkPath(root, sourcePath);
      const content = await readUtf8(sourcePath);
      await writeManagedFile({ ...context, root, source: '.contextos/runtime/adapters/codex/AGENTS.md', targetRelative: 'AGENTS.md', content, provider });
      await sourceTree(root, 'skill/context-os', '.agents/skills/context-os', provider, context);
      await sourceTree(root, 'agents/codex', '.codex/agents', provider, context);
      continue;
    }
    if (provider === 'claude-code') {
      const sourcePath = join(root, '.contextos', 'runtime', 'adapters', 'claude-code', 'CLAUDE.md');
      await assertNoSymlinkPath(root, sourcePath);
      const content = await readUtf8(sourcePath);
      await writeManagedFile({ ...context, root, source: '.contextos/runtime/adapters/claude-code/CLAUDE.md', targetRelative: 'CLAUDE.md', content, provider });
      await sourceTree(root, 'skill/context-os', '.claude/skills/context-os', provider, context);
      await sourceTree(root, 'agents/claude-code', '.claude/agents', provider, context);
      continue;
    }
    if (['chatgpt', 'claude-chat', 'cowork'].includes(provider)) {
      await sourceTree(root, `adapters/${provider}`, `.contextos/generated/${provider}`, provider, context);
      continue;
    }
  }

  if (!dryRun && changes.some((change) => !['unchanged'].includes(change.action))) await saveManifest(root, manifest);
  return { changes, conflicts };
}

export async function commandInit(positionals, options) {
  const inputPath = positionals[0] ?? '.';
  const requestedProviders = normalizeProviders(options.providers, { required: false });
  const root = await resolveSafeRoot(inputPath, { allowCreate: true });
  const existed = await pathExists(root);
  let existingEntries = [];
  if (existed) existingEntries = (await readdir(root)).filter((entry) => !['.git', '.DS_Store', '.contextos'].includes(entry));
  const mode = existingEntries.length > 0 ? 'existing' : 'new';
  const templateFiles = await listRuntimeFiles('instance');
  const changes = [];
  const conflicts = [];

  if (options.dry_run) {
    for (const file of templateFiles) {
      const targetRelative = portablePath(join('.contextos', file));
      const target = join(root, targetRelative);
      const exists = await pathExists(target);
      if (exists) await assertNoSymlinkPath(root, target);
      changes.push({ action: exists ? 'unchanged' : 'would-add', path: targetRelative });
    }
    const manifestPath = join(root, '.contextos', 'manifest.json');
    const manifestExists = await pathExists(manifestPath);
    if (manifestExists) await assertNoSymlinkPath(root, manifestPath);
    if (manifestExists) await loadManifest(root, mode);
    changes.push({ action: manifestExists ? 'unchanged' : 'would-add', path: '.contextos/manifest.json' });
    for (const provider of requestedProviders) changes.push({ action: 'would-sync', path: `provider:${provider}` });
    return {
      code: 0,
      result: { ok: true, command: 'init', version: VERSION, root, mode, summary: `Plan: ${changes.length} archivos para un proyecto ${mode}.`, changes, conflicts },
    };
  }

  await mkdir(root, { recursive: true });
  const release = await acquireLock(root);
  try {
    for (const file of templateFiles) {
      const targetRelative = portablePath(join('.contextos', file));
      const target = join(root, targetRelative);
      if (await pathExists(target)) {
        await assertNoSymlinkPath(root, target);
        changes.push({ action: 'unchanged', path: targetRelative });
        continue;
      }
      const content = substituteTemplate(await readRuntimeFile(join('instance', file)));
      await atomicWrite(root, target, content);
      changes.push({ action: 'created', path: targetRelative });
    }

    const manifestPath = join(root, '.contextos', 'manifest.json');
    if (!(await pathExists(manifestPath))) {
      await saveManifest(root, emptyManifest(mode));
      changes.push({ action: 'created', path: '.contextos/manifest.json' });
    } else {
      await assertNoSymlinkPath(root, manifestPath);
      await loadManifest(root, mode);
      changes.push({ action: 'unchanged', path: '.contextos/manifest.json' });
    }

    if (requestedProviders.length > 0) {
      const synced = await syncProviders(root, requestedProviders);
      changes.push(...synced.changes);
      conflicts.push(...synced.conflicts);
    }
  } finally {
    await release();
  }

  const created = changes.filter((change) => change.action === 'created').length;
  return {
    code: conflicts.length > 0 ? 1 : 0,
    result: {
      ok: conflicts.length === 0,
      command: 'init',
      version: VERSION,
      root,
      mode,
      summary: `Context OS inicializado: ${created} creados, ${changes.length - created} sin cambio${conflicts.length ? `, ${conflicts.length} conflictos` : ''}.`,
      changes,
      conflicts,
    },
  };
}

function normalizeInstructionLines(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*#>\d.()\s]+/, '').replace(/\s+/g, ' ').toLowerCase())
    .filter((line) => line.length >= 28 && !line.startsWith('context-os:') && !line.startsWith('generated-from:'));
}

async function managedPathsForAudit(root) {
  const manifestPath = join(root, '.contextos', 'manifest.json');
  if (!(await pathExists(manifestPath))) return new Set();
  try {
    await assertNoSymlinkPath(root, manifestPath);
    const manifest = await readJson(manifestPath);
    if (!Array.isArray(manifest.managed_files)) return new Set();
    return new Set(
      manifest.managed_files
        .filter(validManagedEntry)
        .map((entry) => normalizeRelativePath(entry.path)),
    );
  } catch {
    return new Set();
  }
}

export async function auditRoot(root, { limit = 5000 } = {}) {
  const discoveredFiles = await walkFiles(root, { limit: limit + 1 });
  const truncated = discoveredFiles.length > limit;
  const files = truncated ? discoveredFiles.slice(0, limit) : discoveredFiles;
  const findings = [];
  if (truncated) {
    findings.push({ severity: 'warning', code: 'audit-truncated', message: `La auditoría se detuvo tras ${limit} archivos; reduce el alcance o divide el proyecto.` });
  }
  const contextFiles = files.filter((file) => contextFilePattern.test(file));
  const instructionLines = new Map();
  const managedPaths = await managedPathsForAudit(root);

  for (const file of files) {
    if (sensitiveSurfacePattern.test(file)) {
      findings.push({ severity: 'info', code: 'sensitive-surface', path: file, message: 'Superficie sensible presente; contenido no inspeccionado ni mostrado.' });
    }
  }

  for (const file of contextFiles) {
    const fullPath = join(root, file);
    const size = await fileSize(fullPath);
    if (size > 32768 && instructionFilePattern.test(file)) findings.push({ severity: 'warning', code: 'instruction-file-large', path: file, bytes: size });
    if (size > 262144) continue;
    const content = await readUtf8(fullPath);
    for (const match of content.matchAll(/(?:review_on|review-on|revisar)[^\d]*(\d{4}-\d{2}-\d{2})/gi)) {
      if (match[1] < today()) findings.push({ severity: 'warning', code: 'review-overdue', path: file, review_on: match[1] });
    }
    const isCanonicalRuntime = file.startsWith('.contextos/runtime/');
    if (!instructionFilePattern.test(file) || isCanonicalRuntime || managedPaths.has(file)) continue;
    for (const line of normalizeInstructionLines(content)) {
      const owners = instructionLines.get(line) ?? new Set();
      owners.add(file);
      instructionLines.set(line, owners);
    }
  }

  for (const [line, owners] of instructionLines) {
    if (owners.size < 2) continue;
    findings.push({ severity: 'warning', code: 'duplicated-instruction', path: [...owners].sort().join(', '), fingerprint: hash(line).slice(0, 12) });
  }

  findings.sort((a, b) => `${a.severity}:${a.code}:${a.path}`.localeCompare(`${b.severity}:${b.code}:${b.path}`));
  return { files, contextFiles, findings, truncated };
}

export async function commandAudit(positionals) {
  const root = await resolveSafeRoot(positionals[0] ?? '.');
  const audit = await auditRoot(root);
  const actionable = audit.findings.filter((finding) => finding.severity !== 'info');
  return {
    code: actionable.length > 0 ? 1 : 0,
    result: {
      ok: actionable.length === 0,
      command: 'audit',
      version: VERSION,
      root,
      summary: `Auditoría: ${audit.files.length} archivos, ${audit.contextFiles.length} superficies de contexto, ${actionable.length} hallazgos accionables.`,
      findings: audit.findings,
      data: { file_count: audit.files.length, context_file_count: audit.contextFiles.length, truncated: audit.truncated },
    },
  };
}

export async function commandDoctor(positionals) {
  const root = await resolveSafeRoot(positionals[0] ?? '.');
  const findings = [];
  const required = [
    '.contextos/manifest.json',
    '.contextos/core/IDENTITY.md',
    '.contextos/core/PRIVACY.md',
    '.contextos/core/MEMORY_POLICY.md',
    '.contextos/spaces/_template/SPACE.md',
    '.contextos/projects/_template/PROJECT.md',
  ];

  for (const file of required) {
    const target = join(root, file);
    try {
      await assertNoSymlinkPath(root, target);
    } catch {
      findings.push({ severity: 'error', code: 'required-path-unsafe', path: file });
      continue;
    }
    if (!(await pathExists(target))) findings.push({ severity: 'error', code: 'required-file-missing', path: file });
  }

  let manifest;
  let managedEntries = [];
  const manifestPath = join(root, '.contextos', 'manifest.json');
  const manifestPathUnsafe = findings.some((finding) => finding.code === 'required-path-unsafe' && finding.path === '.contextos/manifest.json');
  if ((await pathExists(manifestPath)) && !manifestPathUnsafe) {
    try {
      manifest = await readJson(manifestPath);
      if (manifest.schema_version !== SCHEMA_VERSION) findings.push({ severity: 'error', code: 'schema-version-unsupported', path: '.contextos/manifest.json' });
      if (!Array.isArray(manifest.managed_files)) findings.push({ severity: 'error', code: 'managed-files-invalid', path: '.contextos/manifest.json' });
      else managedEntries = manifest.managed_files;
    } catch {
      findings.push({ severity: 'error', code: 'manifest-invalid-json', path: '.contextos/manifest.json' });
    }
  }

  const seenManagedPaths = new Set();
  for (const entry of managedEntries) {
    if (!validManagedEntry(entry)) {
      findings.push({ severity: 'error', code: 'managed-entry-invalid', path: '.contextos/manifest.json' });
      continue;
    }
    let normalizedPath;
    try {
      normalizedPath = normalizeRelativePath(entry.path);
    } catch {
      findings.push({ severity: 'error', code: 'managed-path-unsafe', path: String(entry.path) });
      continue;
    }
    if (seenManagedPaths.has(normalizedPath)) {
      findings.push({ severity: 'error', code: 'managed-path-duplicated', path: normalizedPath });
      continue;
    }
    seenManagedPaths.add(normalizedPath);
    const target = join(root, normalizedPath);
    try {
      await assertNoSymlinkPath(root, target);
    } catch {
      findings.push({ severity: 'error', code: 'managed-path-unsafe', path: normalizedPath });
      continue;
    }
    if (!(await pathExists(target))) {
      findings.push({ severity: 'error', code: 'managed-file-missing', path: normalizedPath });
      continue;
    }
    const currentHash = hash(await readUtf8(target));
    if (currentHash !== entry.applied_sha256) findings.push({ severity: 'warning', code: 'managed-file-drift', path: normalizedPath });
  }

  const audit = await auditRoot(root);
  findings.push(...audit.findings.filter((finding) => ['audit-truncated', 'review-overdue', 'instruction-file-large', 'duplicated-instruction'].includes(finding.code)));
  findings.sort((a, b) => `${a.severity}:${a.code}:${a.path}`.localeCompare(`${b.severity}:${b.code}:${b.path}`));
  const actionable = findings.filter((finding) => ['error', 'warning'].includes(finding.severity));
  return {
    code: actionable.length > 0 ? 1 : 0,
    result: { ok: actionable.length === 0, command: 'doctor', version: VERSION, root, summary: `Doctor: ${actionable.length} hallazgos.`, findings },
  };
}

export async function commandAddSpace(positionals, options) {
  const slug = safeSlug(positionals[0]);
  const root = await resolveSafeRoot(options.path ?? positionals[1] ?? '.');
  const templatePath = join(root, '.contextos', 'spaces', '_template', 'SPACE.md');
  if (!(await pathExists(templatePath))) throw new UsageError('Inicializa Context OS antes de crear un espacio.');
  const targetRelative = portablePath(join('.contextos', 'spaces', slug, 'SPACE.md'));
  const target = join(root, targetRelative);
  await assertNoSymlinkPath(root, templatePath);
  await assertNoSymlinkPath(root, target);
  if (await pathExists(target)) {
    return { code: 0, result: { ok: true, command: 'add-space', version: VERSION, root, summary: `El espacio ${slug} ya existe.`, changes: [{ action: 'unchanged', path: targetRelative }] } };
  }
  const content = substituteTemplate(await readUtf8(templatePath), { '__SPACE_ID__': slug, '__SPACE_TITLE__': slug.replaceAll('-', ' ') });
  if (options.dry_run) {
    return { code: 0, result: { ok: true, command: 'add-space', version: VERSION, root, summary: `Plan: crear el espacio ${slug}.`, changes: [{ action: 'would-add', path: targetRelative }] } };
  }
  await atomicWrite(root, target, content);
  return { code: 0, result: { ok: true, command: 'add-space', version: VERSION, root, summary: `Espacio creado: ${slug}.`, changes: [{ action: 'created', path: targetRelative }] } };
}

export async function commandSync(positionals, options) {
  const root = await resolveSafeRoot(positionals[0] ?? '.');
  if (!(await pathExists(join(root, '.contextos', 'manifest.json')))) throw new UsageError('Inicializa Context OS antes de sincronizar.');
  const release = options.dry_run ? null : await acquireLock(root);
  try {
    const synced = await syncProviders(root, options.providers, { dryRun: options.dry_run });
    return {
      code: synced.conflicts.length > 0 ? 1 : 0,
      result: {
        ok: synced.conflicts.length === 0,
        command: options.export_mode ? 'export' : 'sync',
        version: VERSION,
        root,
        summary: `${options.dry_run ? 'Plan' : 'Sync'}: ${synced.changes.length} operaciones, ${synced.conflicts.length} conflictos.`,
        changes: synced.changes,
        conflicts: synced.conflicts,
      },
    };
  } finally {
    if (release) await release();
  }
}

export async function commandExport(positionals, options) {
  const providers = normalizeProviders(options.providers, { allowed: cloudProviders });
  return commandSync(positionals, { ...options, providers, export_mode: true });
}

export async function commandPrompt(positionals) {
  const name = positionals[0];
  const allowed = ['discover', 'design', 'apply', 'session', 'memory', 'diagnose'];
  if (!allowed.includes(name)) throw new UsageError(`Prompt no disponible. Usa: ${allowed.join(', ')}.`);
  const text = await readRuntimeFile(join('prompts', `${name}.md`));
  return { code: 0, raw: text };
}

export async function commandStatus(positionals) {
  const root = await resolveSafeRoot(positionals[0] ?? '.');
  const spaceRoot = join(root, '.contextos', 'spaces');
  const projectRoot = join(root, '.contextos', 'projects');
  if (await pathExists(spaceRoot)) await assertNoSymlinkPath(root, spaceRoot);
  if (await pathExists(projectRoot)) await assertNoSymlinkPath(root, projectRoot);
  const spaces = (await pathExists(spaceRoot)) ? (await readdir(spaceRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== '_template').map((entry) => entry.name).sort() : [];
  const projects = (await pathExists(projectRoot)) ? (await readdir(projectRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== '_template').map((entry) => entry.name).sort() : [];
  const doctor = await commandDoctor([root]);
  return {
    code: doctor.code,
    result: {
      ok: doctor.code === 0,
      command: 'status',
      version: VERSION,
      root,
      summary: `Estado: ${spaces.length} espacios, ${projects.length} proyectos, ${doctor.result.findings.length} hallazgos de doctor.`,
      data: { spaces, projects, doctor_findings: doctor.result.findings.length },
    },
  };
}

export function helpText() {
  return `Context OS ${VERSION}\n\nUso:\n  context-os <comando> [ruta] [opciones]\n\nComandos:\n  init [ruta]                 Inicializa sin sobrescribir\n  audit [ruta]                Inventario de solo lectura\n  doctor [ruta]               Valida estructura, vigencia y drift\n  add-space <slug>            Crea un espacio configurable\n  sync [ruta] --provider ID   Genera un adaptador\n  export [ruta] --provider ID Genera un bloque para una superficie cloud\n  status [ruta]               Resume la instancia\n  prompt <nombre>             Imprime un prompt para uso solo-chat\n  version                     Muestra la versión\n  help                        Muestra esta ayuda\n\nOpciones:\n  --json       Salida JSON determinista\n  --dry-run    No escribe\n  --provider   codex, claude-code, chatgpt, claude-chat o cowork\n  --path       Ruta para add-space\n`;
}
