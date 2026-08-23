import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { portablePath } from './lib.mjs';

export const runtimeRoot = fileURLToPath(new URL('../runtime/', import.meta.url));

export async function readRuntimeFile(relativePath) {
  return readFile(join(runtimeRoot, relativePath), 'utf8');
}

export async function listRuntimeFiles(relativeDirectory) {
  const base = join(runtimeRoot, relativeDirectory);
  const files = [];
  const queue = [base];
  while (queue.length > 0) {
    const current = queue.shift();
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      else if (entry.isFile()) files.push(portablePath(relative(base, fullPath)));
    }
  }
  return files.sort();
}
