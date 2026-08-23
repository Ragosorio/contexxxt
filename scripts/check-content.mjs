import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';

const root = new URL('../', import.meta.url);
const docsRoot = new URL('../src/content/docs/docs/', import.meta.url);
const textExtensions = new Set(['.astro', '.css', '.html', '.js', '.json', '.md', '.mdx', '.mjs', '.svg', '.toml', '.ts', '.txt', '.yaml', '.yml']);
const ignoredDirectories = new Set(['.astro', '.git', 'dist', 'node_modules']);
const ignoredFiles = new Set(['pnpm-lock.yaml']);

const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }

  return files;
}

function localPath(path) {
  return relative(root.pathname, path).split(sep).join('/');
}

function routeToCandidates(route) {
  const clean = route.split(/[?#]/, 1)[0].replace(/^\/docs\/?/, '').replace(/\/$/, '');
  if (!clean) return ['index.md', 'index.mdx'];
  return [`${clean}.md`, `${clean}.mdx`, `${clean}/index.md`, `${clean}/index.mdx`];
}

const docsFiles = (await walk(docsRoot.pathname)).filter((path) => ['.md', '.mdx'].includes(extname(path)));
const docsRelative = new Set(docsFiles.map((path) => relative(docsRoot.pathname, path).split(sep).join('/')));

for (const path of docsFiles) {
  const source = await readFile(path, 'utf8');
  const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    failures.push(`${localPath(path)}: falta frontmatter`);
    continue;
  }
  if (!/^title:\s*\S+/m.test(frontmatter[1])) failures.push(`${localPath(path)}: falta title`);
  if (!/^description:\s*\S+/m.test(frontmatter[1])) failures.push(`${localPath(path)}: falta description`);
}

const allFiles = (await walk(root.pathname)).filter((path) => textExtensions.has(extname(path)) && !ignoredFiles.has(path.split(sep).at(-1)));
const forbidden = [
  { pattern: /\/(?:Users|home)\/[^/\s]+/i, label: 'ruta local absoluta' },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, label: 'correo embebido' },
];

const privateMarkers = (process.env.CONTEXTOS_PRIVATE_MARKERS ?? '')
  .split(',')
  .map((marker) => marker.trim())
  .filter(Boolean);

for (const path of allFiles) {
  const source = await readFile(path, 'utf8');
  if (localPath(path) !== 'scripts/check-content.mjs') {
    for (const { pattern, label } of forbidden) {
      if (pattern.test(source)) failures.push(`${localPath(path)}: contiene ${label}`);
    }
    for (const marker of privateMarkers) {
      if (source.toLocaleLowerCase().includes(marker.toLocaleLowerCase())) {
        failures.push(`${localPath(path)}: contiene un marcador privado configurado localmente`);
      }
    }
  }

  if (!['.astro', '.md', '.mdx'].includes(extname(path))) continue;
  for (const match of source.matchAll(/(?:(?:href|content)=["']|\]\(|link:\s*)(\/docs\/[A-Za-z0-9_./-]*)/g)) {
    const route = match[1];
    if (!routeToCandidates(route).some((candidate) => docsRelative.has(candidate))) {
      failures.push(`${localPath(path)}: enlace interno sin destino ${route}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Content checks failed (${failures.length}):`);
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Content checks passed: ${docsFiles.length} páginas y ${allFiles.length} archivos públicos revisados.`);
}
