import { createHash, randomBytes } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse, posix, relative, resolve, sep } from 'node:path';

export const VERSION = '0.1.0';
export const SCHEMA_VERSION = 1;

const commandOptions = new Map([
  ['init', new Set(['json', 'dry_run', 'provider'])],
  ['audit', new Set(['json'])],
  ['doctor', new Set(['json'])],
  ['add-space', new Set(['json', 'dry_run', 'path'])],
  ['sync', new Set(['json', 'dry_run', 'provider'])],
  ['export', new Set(['json', 'dry_run', 'provider'])],
  ['status', new Set(['json'])],
  ['prompt', new Set(['json'])],
  ['help', new Set(['json'])],
  ['version', new Set(['json'])],
  ['--help', new Set(['json'])],
  ['-h', new Set(['json'])],
  ['--version', new Set(['json'])],
  ['-v', new Set(['json'])],
]);

export function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const positionals = [];
  const options = { providers: [] };

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }

    const option = value.slice(2);
    const separatorIndex = option.indexOf('=');
    const rawKey = separatorIndex === -1 ? option : option.slice(0, separatorIndex);
    const inline = separatorIndex === -1 ? undefined : option.slice(separatorIndex + 1);
    if (!rawKey) throw new UsageError('Opción inválida: --');
    const key = rawKey.replaceAll('-', '_');
    const allowed = commandOptions.get(command) ?? new Set();
    if (!allowed.has(key)) throw new UsageError(`Opción desconocida para ${command}: --${rawKey}`);
    if (['json', 'dry_run'].includes(key)) {
      if (inline !== undefined && !['true', 'false'].includes(inline)) {
        throw new UsageError(`--${rawKey} solo admite true o false.`);
      }
      options[key] = inline === undefined ? true : inline === 'true';
      continue;
    }

    const next = inline ?? rest[index + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new UsageError(`Falta un valor para --${rawKey}`);
    }
    if (inline === undefined) index += 1;
    if (key === 'provider') options.providers.push(next);
    else options[key] = next;
  }

  return { command, positionals, options };
}

export class UsageError extends Error {}

export async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveSafeRoot(inputPath = '.', { allowCreate = false } = {}) {
  const root = resolve(inputPath);
  const home = resolve(homedir());
  if (root === parse(root).root || root === home) {
    throw new UsageError('Elige una carpeta específica; no se permite usar / ni el directorio personal completo.');
  }

  if (await pathExists(root)) {
    const info = await lstat(root);
    if (info.isSymbolicLink()) throw new UsageError('La raíz no puede ser un symlink.');
    if (!info.isDirectory()) throw new UsageError('La ruta objetivo debe ser una carpeta.');
    return realpath(root);
  }

  if (!allowCreate) throw new UsageError(`La carpeta no existe: ${root}`);
  const ancestor = await nearestExistingParent(dirname(root));
  const info = await lstat(ancestor);
  if (!info.isDirectory() && !info.isSymbolicLink()) {
    throw new UsageError('La ruta nueva debe depender de una carpeta existente.');
  }
  const canonicalInfo = await stat(ancestor);
  if (!canonicalInfo.isDirectory()) throw new UsageError('La ruta nueva debe depender de una carpeta existente.');
  const canonicalAncestor = await realpath(ancestor);
  return join(canonicalAncestor, relative(ancestor, root));
}

async function nearestExistingParent(path) {
  let current = resolve(path);
  while (!(await pathExists(current))) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export function assertInsideRoot(root, target) {
  const rel = relative(root, target);
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) return;
  throw new UsageError(`La ruta sale de la raíz permitida: ${target}`);
}

export function portablePath(path) {
  return path.replaceAll('\\', '/');
}

export function normalizeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new UsageError('El manifiesto contiene una ruta administrada inválida.');
  }
  const portable = portablePath(value);
  if (portable.startsWith('/') || /^[a-z]:/i.test(portable)) {
    throw new UsageError('El manifiesto contiene una ruta administrada absoluta.');
  }
  const normalized = posix.normalize(portable);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new UsageError('El manifiesto contiene una ruta administrada fuera del proyecto.');
  }
  return normalized;
}

export async function assertNoSymlinkPath(root, target) {
  assertInsideRoot(root, target);
  const rel = relative(root, target);
  const parts = rel.split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (!(await pathExists(current))) continue;
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new UsageError(`No se administra un symlink: ${relative(root, current)}`);
  }
}

export async function atomicWrite(root, target, content) {
  await assertNoSymlinkPath(root, target);
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(dirname(target), `.context-os-${process.pid}-${randomBytes(4).toString('hex')}.tmp`);
  let temporaryCreated = false;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    temporaryCreated = true;
    await rename(temporary, target);
  } catch (error) {
    if (temporaryCreated) await rm(temporary, { force: true });
    throw error;
  }
}

export function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function readUtf8(path) {
  return readFile(path, 'utf8');
}

export async function readJson(path) {
  return JSON.parse(await readUtf8(path));
}

export async function writeJson(root, path, value) {
  await atomicWrite(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function acquireLock(root) {
  const lockPath = join(root, '.contextos', '.lock');
  await assertNoSymlinkPath(root, lockPath);
  await mkdir(dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, 'wx');
    try {
      await handle.writeFile(`${process.pid}\n`, 'utf8');
    } catch (error) {
      await handle.close();
      await rm(lockPath, { force: true });
      throw error;
    }
  } catch (error) {
    if (error?.code === 'EEXIST') throw new UsageError('Otra operación de Context OS parece estar en curso.');
    throw error;
  }
  return async () => {
    try {
      await handle.close();
    } finally {
      await rm(lockPath, { force: true });
    }
  };
}

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', '.astro', 'coverage', '.next', '.vercel']);

export async function walkFiles(root, { limit = 5000 } = {}) {
  const output = [];
  const queue = [''];
  while (queue.length > 0 && output.length < limit) {
    const relDir = queue.shift();
    const directory = join(root, relDir);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const relPath = join(relDir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) queue.push(relPath);
      } else if (entry.isFile()) {
        output.push(portablePath(relPath));
        if (output.length >= limit) break;
      }
    }
  }
  return output.sort();
}

export async function fileSize(path) {
  return (await stat(path)).size;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function safeSlug(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value ?? '')) {
    throw new UsageError('El slug admite minúsculas, números y guiones; no puede empezar o terminar con guion.');
  }
  return value;
}

export function orderedResult(result) {
  const ordered = {};
  for (const key of ['ok', 'command', 'version', 'root', 'mode', 'summary', 'changes', 'findings', 'conflicts', 'data']) {
    if (result[key] !== undefined) ordered[key] = result[key];
  }
  return ordered;
}

export function printResult(result, { json = false } = {}) {
  if (json) {
    process.stdout.write(`${JSON.stringify(orderedResult(result))}\n`);
    return;
  }
  if (result.summary) process.stdout.write(`${result.summary}\n`);
  for (const change of result.changes ?? []) process.stdout.write(`  ${change.action.padEnd(9)} ${change.path}\n`);
  for (const finding of result.findings ?? []) process.stdout.write(`  [${finding.severity}] ${finding.code}: ${finding.path ?? finding.message}\n`);
  for (const conflict of result.conflicts ?? []) process.stdout.write(`  [conflict] ${conflict.path} -> ${conflict.proposal}\n`);
}
