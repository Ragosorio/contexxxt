import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, dirname, join, relative } from 'node:path';
import { VERSION, hash, portablePath } from '../lib.mjs';
import { PROJECT_MODEL_SCHEMA_VERSION, readProjectModelSchema, stableStringify } from '../model/model.mjs';
import { validateJsonSchema } from '../model/json-schema.mjs';

const execFile = promisify(execFileCallback);

export const INSPECTION_REPORT_SCHEMA_VERSION = '1.0.0';

const skippedDirectoryNames = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'vendor', 'target', '.venv', 'venv', '__pycache__',
]);
const generatedDirectoryNames = new Set([
  'dist', 'build', 'coverage', '.astro', '.next', '.nuxt', '.output', '.vercel', '.turbo',
  '.expo', '.gradle', '.cxx', 'Pods', 'playwright-report', 'test-results', 'out', 'generated',
]);
const sourceRootNames = new Set(['src', 'lib', 'app', 'apps', 'packages', 'services', 'cmd', 'internal']);
const testRootNames = new Set(['test', 'tests', '__tests__', 'spec', 'e2e']);
const documentationNames = new Map([
  ['readme.md', 'readme'],
  ['architecture.md', 'architecture'],
  ['product.md', 'product'],
  ['contributing.md', 'contributing'],
  ['security.md', 'security'],
  ['changelog.md', 'changelog'],
  ['license', 'license'],
  ['license.md', 'license'],
]);
const instructionPattern = /(^|\/)(AGENTS(?:\.override)?\.md|CLAUDE(?:\.local)?\.md|SKILL\.md)$/i;
const sensitivePattern = /(^|\/)(\.env(?:\..+)?|.*settings\.local\..*|.*\.(?:pem|key|p12))$/i;
const manifestNames = new Set([
  'package.json', 'pnpm-workspace.yaml', 'pnpm-workspace.yml', 'pyproject.toml', 'Cargo.toml',
  'go.mod', 'composer.json', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
]);

function isFixturePath(path) {
  return /(^|\/)(test|tests)\/fixtures\//i.test(path);
}

function jsonValue(value) {
  return typeof value === 'string' ? value : stableStringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedIdPart(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'value';
}

function scopeForPath(path) {
  const directory = portablePath(dirname(path));
  if (directory === '.') return [{ kind: 'project', value: '*' }];
  return [{ kind: 'directory', value: directory }];
}

function makeEvidence({ category, key, value, summary, uri, observedAt, digest, coverage = 'complete', gaps = [], sensitivity = 'public', symbol }) {
  const serialized = jsonValue(value);
  const contentDigest = digest ?? sha256(serialized);
  const identityDigest = sha256(`${uri}:${symbol ?? ''}:${contentDigest}`);
  return {
    id: `inspection.${normalizedIdPart(category)}.${normalizedIdPart(key)}.${identityDigest.slice(0, 12)}`,
    type: 'repository_fact',
    summary: summary.slice(0, 240),
    observation: { category, key, value: serialized.slice(0, 4000) },
    locator: { uri, ...(symbol ? { symbol } : {}) },
    digest: contentDigest,
    observed_at: observedAt,
    provider: { id: 'native', version: VERSION, capabilities_used: [category] },
    coverage: { status: coverage, scopes: scopeForPath(uri), ...(gaps.length > 0 ? { gaps } : {}) },
    authority: { level: 'observational', subject: key },
    sensitivity,
  };
}

async function readSmallFile(root, path, maxBytes = 524288) {
  const fullPath = join(root, path);
  const info = await lstat(fullPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) return null;
  return readFile(fullPath, 'utf8');
}

async function scanFilesystem(root, limit) {
  const files = [];
  const directories = [];
  const generated = [];
  const symlinks = [];
  const queue = [''];
  let truncated = false;
  while (queue.length > 0) {
    const relDir = queue.shift();
    let entries;
    try {
      entries = await readdir(join(root, relDir), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relPath = portablePath(join(relDir, entry.name));
      if (entry.isSymbolicLink()) {
        symlinks.push(relPath);
        continue;
      }
      if (entry.isDirectory()) {
        directories.push(relPath);
        if (generatedDirectoryNames.has(entry.name)) {
          generated.push(relPath);
          continue;
        }
        if (!skippedDirectoryNames.has(entry.name)) queue.push(relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(relPath);
      if (files.length >= limit) {
        truncated = true;
        queue.length = 0;
        break;
      }
    }
  }
  return {
    files: files.sort(),
    directories: directories.sort(),
    generated: [...new Set(generated)].sort(),
    symlinks: symlinks.sort(),
    truncated,
  };
}

async function git(root, args) {
  try {
    const { stdout } = await execFile('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

function parseGitStatus(output) {
  if (output === null) return null;
  const entries = output.split('\0').filter(Boolean);
  const counts = { changed: 0, staged: 0, unstaged: 0, untracked: 0, conflicted: 0 };
  for (const entry of entries) {
    const code = entry.slice(0, 2);
    if (code === '??') counts.untracked += 1;
    else {
      counts.changed += 1;
      if (code[0] !== ' ') counts.staged += 1;
      if (code[1] !== ' ') counts.unstaged += 1;
      if (['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(code)) counts.conflicted += 1;
    }
  }
  return counts;
}

function parseWorktrees(output, gitRoot) {
  if (!output) return [];
  const blocks = output.trim().split(/\n\n+/);
  return blocks.map((block) => {
    const values = Object.fromEntries(block.split('\n').map((line) => {
      const separator = line.indexOf(' ');
      return separator === -1 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
    }));
    const path = values.worktree;
    return {
      path: path === gitRoot ? '.' : path?.startsWith(`${gitRoot}/`) ? portablePath(relative(gitRoot, path)) : path,
      head: values.HEAD,
      branch: typeof values.branch === 'string' ? values.branch.replace('refs/heads/', '') : null,
      detached: values.detached === true,
      bare: values.bare === true,
    };
  }).sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

async function inspectRepository({ root, add }) {
  const gitRoot = (await git(root, ['rev-parse', '--show-toplevel']))?.trim() ?? null;
  if (!gitRoot) {
    add({ category: 'repository', key: 'git.present', value: 'false', summary: 'No Git repository was detected for the inspected root.', uri: '.' });
    return { git: null };
  }
  const [head, branch, statusOutput, trackedOutput, worktreesOutput] = await Promise.all([
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']),
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
    git(root, ['ls-files', '-z']),
    git(root, ['worktree', 'list', '--porcelain']),
  ]);
  const status = parseGitStatus(statusOutput);
  const repository = {
    root: portablePath(relative(root, gitRoot)) || '.',
    head: head?.trim() ?? null,
    branch: branch?.trim() || null,
    detached: !branch,
    tracked_files: trackedOutput?.split('\0').filter(Boolean).length ?? null,
    status,
    worktrees: parseWorktrees(worktreesOutput, gitRoot),
  };
  add({ category: 'repository', key: 'git.root', value: repository.root, summary: `Git root resolves to ${repository.root}.`, uri: '.git' });
  if (repository.head) add({ category: 'repository', key: 'git.head', value: repository.head, summary: `Git HEAD is ${repository.head.slice(0, 12)}.`, uri: '.git/HEAD' });
  add({ category: 'repository', key: 'git.branch', value: repository.branch ?? 'detached', summary: repository.branch ? `Current Git branch is ${repository.branch}.` : 'Git HEAD is detached.', uri: '.git/HEAD' });
  add({ category: 'repository', key: 'git.status', value: status ?? {}, summary: status ? `Git reports ${status.changed} changed and ${status.untracked} untracked paths.` : 'Git status could not be read.', uri: '.git', coverage: status ? 'complete' : 'unknown', gaps: status ? [] : ['git status unavailable'] });
  add({ category: 'repository', key: 'git.worktrees', value: repository.worktrees, summary: `Git reports ${repository.worktrees.length} worktree${repository.worktrees.length === 1 ? '' : 's'}.`, uri: '.git' });
  return { git: repository };
}

function commandCategory(name, command) {
  const normalized = name.toLowerCase();
  const value = `${normalized} ${command.toLowerCase()}`;
  if (/^(dev|start|serve)(:|$)/.test(normalized)) return 'dev';
  if (/^build(:|$)/.test(normalized)) return 'build';
  if (/^test(:|$)/.test(normalized) || /\b(node --test|vitest|jest|mocha|pytest|cargo test|go test)\b/.test(value)) return 'test';
  if (/^lint(:|$)/.test(normalized)) return 'lint';
  if (/^(typecheck|type-check|check-types)(:|$)/.test(normalized) || /\btsc\b/.test(command)) return 'typecheck';
  if (/^(check|verify|validate)(:|$)/.test(normalized)) return 'check';
  if (/^(release|publish|version)(:|$)/.test(normalized)) return 'release';
  if (/^deploy(:|$)/.test(normalized)) return 'deploy';
  return null;
}

async function inspectPackageJson({ root, path, add, findings, packages, commands, testFrameworks }) {
  const content = await readSmallFile(root, path);
  if (content === null) return;
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    findings.push({ severity: 'warning', code: 'manifest-invalid-json', path });
    add({ category: 'manifest', key: 'manifest.invalid', value: path, summary: `${path} contains invalid JSON.`, uri: path, digest: hash(content), coverage: 'partial', gaps: ['manifest could not be parsed'] });
    return;
  }
  const packageScope = portablePath(dirname(path)) === '.' ? '.' : portablePath(dirname(path));
  const descriptor = { path, scope: packageScope, name: manifest.name ?? null, private: manifest.private === true, type: manifest.type ?? null };
  packages.push(descriptor);
  add({ category: 'manifest', key: 'package.node', value: descriptor, summary: `${path} declares Node package ${manifest.name ?? '(unnamed)'}.`, uri: path, digest: hash(content) });
  for (const [name, command] of Object.entries(manifest.scripts ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof command !== 'string') continue;
    const category = commandCategory(name, command);
    if (!category) continue;
    const item = { package: manifest.name ?? packageScope, scope: packageScope, name, category, command };
    commands.push(item);
    add({ category: 'command', key: `command.${category}`, value: item, summary: `${path} declares ${category} command "${name}"; it was not executed.`, uri: path, symbol: `scripts.${name}`, digest: hash(command) });
  }
  const dependencies = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
  const frameworks = [
    ['vitest', 'vitest'], ['jest', 'jest'], ['mocha', 'mocha'], ['@playwright/test', 'playwright'], ['cypress', 'cypress'],
  ];
  for (const [dependency, framework] of frameworks) {
    if (!Object.hasOwn(dependencies, dependency)) continue;
    testFrameworks.add(framework);
    add({ category: 'test', key: 'test.framework-dependency', value: { framework, dependency, package: manifest.name ?? packageScope }, summary: `${path} declares ${dependency}, evidence for the ${framework} test framework.`, uri: path, symbol: `devDependencies.${dependency}`, digest: hash(`${dependency}:${dependencies[dependency]}`) });
  }
  for (const item of commands.filter((entry) => entry.scope === packageScope && entry.category === 'test')) {
    if (/\bnode\s+--test\b/.test(item.command)) testFrameworks.add('node:test');
  }
}

function parsePnpmWorkspace(content) {
  const packages = [];
  let inPackages = false;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^packages\s*:/.test(line)) { inPackages = true; continue; }
    if (inPackages && /^-\s+/.test(line)) packages.push(line.replace(/^-\s+/, '').replace(/^['"]|['"]$/g, ''));
    else if (inPackages && line && !line.startsWith('#')) inPackages = false;
  }
  return packages.sort();
}

async function inspectManifests({ root, scan, add, findings }) {
  const manifests = scan.files.filter((path) => !isFixturePath(path) && manifestNames.has(basename(path))).sort();
  const packages = [];
  const commands = [];
  const workspaces = [];
  const testFrameworks = new Set();
  for (const path of manifests) {
    if (basename(path) === 'package.json') {
      await inspectPackageJson({ root, path, add, findings, packages, commands, testFrameworks });
      continue;
    }
    const content = await readSmallFile(root, path);
    if (content === null) continue;
    const name = basename(path);
    add({ category: 'manifest', key: `manifest.${normalizedIdPart(name)}`, value: path, summary: `${path} was detected as a ${name} manifest.`, uri: path, digest: hash(content) });
    if (/^pnpm-workspace\.ya?ml$/.test(name)) {
      const patterns = parsePnpmWorkspace(content);
      workspaces.push(...patterns);
      add({ category: 'manifest', key: 'workspace.pnpm', value: patterns, summary: `${path} declares ${patterns.length} pnpm workspace pattern${patterns.length === 1 ? '' : 's'}.`, uri: path, digest: hash(content) });
    }
  }
  return { manifests, packages: packages.sort((a, b) => a.path.localeCompare(b.path)), commands: commands.sort((a, b) => `${a.scope}:${a.name}`.localeCompare(`${b.scope}:${b.name}`)), workspaces: [...new Set(workspaces)].sort(), test_frameworks: [...testFrameworks].sort() };
}

async function inspectFilesystem({ scan, add }) {
  const inventoryFiles = scan.files.filter((path) => path !== '.contexxxt/project-model.json');
  const inventoryDirectories = scan.directories.filter((path) => path !== '.contexxxt');
  const topLevel = [...new Set([...inventoryFiles, ...inventoryDirectories].map((path) => path.split('/')[0]))].sort();
  const sourceRoots = scan.directories.filter((path) => !isFixturePath(`${path}/`) && sourceRootNames.has(basename(path))).sort();
  const testRoots = scan.directories.filter((path) => !isFixturePath(`${path}/`) && testRootNames.has(basename(path))).sort();
  const sensitive = scan.files.filter((path) => sensitivePattern.test(path)).sort();
  add({ category: 'filesystem', key: 'filesystem.inventory', value: { files: inventoryFiles.length, directories: inventoryDirectories.length, top_level: topLevel }, summary: `Filesystem inventory found ${inventoryFiles.length} project files and ${inventoryDirectories.length} directories; canonical model storage is reported separately.`, uri: '.', coverage: scan.truncated ? 'partial' : 'complete', gaps: scan.truncated ? ['file limit reached'] : [] });
  for (const path of sourceRoots) add({ category: 'filesystem', key: 'filesystem.source-root', value: path, summary: `${path} is a conventionally named source root.`, uri: path });
  for (const path of testRoots) add({ category: 'filesystem', key: 'filesystem.test-root', value: path, summary: `${path} is a conventionally named test root.`, uri: path });
  for (const path of scan.generated) add({ category: 'filesystem', key: 'filesystem.generated-directory', value: path, summary: `${path} matches a generated-output directory convention and was not traversed.`, uri: path, coverage: 'partial', gaps: ['directory contents intentionally skipped'] });
  if (sensitive.length > 0) add({ category: 'filesystem', key: 'filesystem.sensitive-surfaces', value: sensitive, summary: `${sensitive.length} potentially sensitive path${sensitive.length === 1 ? '' : 's'} detected; contents were not inspected.`, uri: '.', sensitivity: 'secret-reference' });
  return { top_level: topLevel, source_roots: sourceRoots, test_roots: testRoots, generated_directories: scan.generated, symlinks: scan.symlinks, sensitive_surfaces: sensitive };
}

async function inspectCi({ root, scan, add }) {
  const workflows = scan.files.filter((path) => !isFixturePath(path) && /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)).sort();
  const jobs = [];
  const commands = [];
  for (const path of workflows) {
    const content = await readSmallFile(root, path);
    if (content === null) continue;
    const name = content.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? basename(path);
    add({ category: 'ci', key: 'ci.workflow', value: { path, name }, summary: `${path} defines GitHub Actions workflow ${name}.`, uri: path, digest: hash(content) });
    let inJobs = false;
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const rawLine = lines[index];
      if (/^jobs:\s*$/.test(rawLine)) { inJobs = true; continue; }
      const job = inJobs ? rawLine.match(/^  ([A-Za-z0-9_-]+):\s*$/)?.[1] : null;
      if (job) jobs.push({ workflow: path, job });
      const run = rawLine.match(/^(\s+)(?:-\s+)?run:\s*(.*)$/);
      if (!run) continue;
      let command = run[2].trim();
      if (command === '|' || command === '>') {
        const indentation = run[1].length;
        const block = [];
        for (let next = index + 1; next < lines.length; next += 1) {
          const candidate = lines[next];
          if (candidate.trim() && candidate.match(/^\s*/)[0].length <= indentation) break;
          if (candidate.trim()) block.push(candidate.trim());
          index = next;
        }
        command = block.join(command === '>' ? ' ' : '\n');
      }
      if (command) commands.push({ workflow: path, command });
    }
  }
  for (const item of jobs.sort((a, b) => `${a.workflow}:${a.job}`.localeCompare(`${b.workflow}:${b.job}`))) add({ category: 'ci', key: 'ci.job', value: item, summary: `${item.workflow} declares CI job ${item.job}.`, uri: item.workflow, symbol: `jobs.${item.job}` });
  for (const [index, item] of commands.sort((a, b) => `${a.workflow}:${a.command}`.localeCompare(`${b.workflow}:${b.command}`)).entries()) add({ category: 'ci', key: 'ci.command', value: item, summary: `${item.workflow} declares a CI run command; it was not executed.`, uri: item.workflow, symbol: `run.${index}`, digest: hash(item.command) });
  return { workflows, jobs, commands };
}

function documentKind(path) {
  const lower = path.toLowerCase();
  const name = basename(lower);
  if (documentationNames.has(name)) return documentationNames.get(name);
  if (/(^|\/)(adr|adrs|decisions)\//.test(lower) && /\.md$/.test(lower)) return 'adr';
  if (/(^|\/)docs\//.test(lower) && /\.mdx?$/.test(lower)) return 'documentation';
  return null;
}

async function inspectDocumentation({ root, scan, add }) {
  const documents = [];
  for (const path of scan.files) {
    if (isFixturePath(path)) continue;
    const kind = documentKind(path);
    if (!kind) continue;
    const content = await readSmallFile(root, path);
    if (content === null) continue;
    documents.push({ path, kind });
    add({ category: 'documentation', key: `documentation.${kind}`, value: path, summary: `${path} was detected as ${kind} documentation.`, uri: path, digest: hash(content) });
  }
  return documents.sort((a, b) => a.path.localeCompare(b.path));
}

function directiveCandidates(content) {
  const output = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*]\s*/, '').trim();
    const polarity = /\b(never|do not|must not|no)\b/i.test(line) ? 'negative' : /\b(always|must|required|use)\b/i.test(line) ? 'positive' : null;
    if (!polarity) continue;
    const subject = line.toLowerCase()
      .replace(/\b(always|never|do not|must not|must|required|use|no)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (subject.length >= 3) output.push({ polarity, subject, line: line.slice(0, 240) });
  }
  return output;
}

async function inspectInstructions({ root, scan, add }) {
  const files = scan.files.filter((path) => !isFixturePath(path) && instructionPattern.test(path)).sort();
  const directives = [];
  for (const path of files) {
    const content = await readSmallFile(root, path, 262144);
    if (content === null) continue;
    const scope = portablePath(dirname(path)) === '.' ? '.' : portablePath(dirname(path));
    const scopeLabel = scope === '.' ? 'project' : scope;
    add({ category: 'instruction', key: 'instruction.file', value: { path, scope, kind: basename(path) }, summary: `${path} supplies ${basename(path)} instructions for scope ${scopeLabel}.`, uri: path, digest: hash(content), coverage: content.length >= 262144 ? 'partial' : 'complete' });
    for (const directive of directiveCandidates(content)) directives.push({ ...directive, path, scope });
  }
  const conflicts = [];
  const bySubject = new Map();
  for (const directive of directives) {
    const values = bySubject.get(directive.subject) ?? [];
    values.push(directive);
    bySubject.set(directive.subject, values);
  }
  for (const [subject, values] of bySubject) {
    const polarities = new Set(values.map((value) => value.polarity));
    const paths = [...new Set(values.map((value) => value.path))].sort();
    if (polarities.size < 2 || paths.length < 2) continue;
    const conflict = { subject, paths };
    conflicts.push(conflict);
    add({ category: 'instruction', key: 'instruction.potential-conflict', value: conflict, summary: `Potential instruction conflict for "${subject}" across ${paths.join(', ')}.`, uri: paths[0], coverage: 'partial', gaps: ['semantic review required'] });
  }
  return { files, potential_conflicts: conflicts.sort((a, b) => a.subject.localeCompare(b.subject)) };
}

async function inspectTests({ scan, manifests, add }) {
  const testFiles = scan.files.filter((path) => {
    if (isFixturePath(path)) return false;
    if (/\.(test|spec)\.[^.]+$/i.test(path)) return true;
    return /(^|\/)(test|tests|__tests__|spec|e2e)\/.*\.(c?js|mjs|jsx|ts|tsx|py|go|rs|java|php)$/i.test(path);
  }).sort();
  add({ category: 'test', key: 'test.files', value: { count: testFiles.length, roots: [...new Set(testFiles.map((path) => path.split('/').slice(0, -1).join('/')))].sort() }, summary: `Filesystem conventions identify ${testFiles.length} test file${testFiles.length === 1 ? '' : 's'}.`, uri: '.', coverage: scan.truncated ? 'partial' : 'complete', gaps: scan.truncated ? ['file limit reached'] : [] });
  return { files: testFiles, frameworks: manifests.test_frameworks, commands: manifests.commands.filter((item) => item.category === 'test') };
}

async function inspectCurrentContexxxt({ root, scan, add, findings }) {
  const state = { root: null, project_model: null, legacy: null };
  if (scan.directories.includes('.contexxxt')) state.root = '.contexxxt';
  if (scan.files.includes('.contexxxt/project-model.json')) {
    try {
      const model = JSON.parse(await readFile(join(root, '.contexxxt/project-model.json'), 'utf8'));
      state.project_model = { path: '.contexxxt/project-model.json', schema_version: model.schema_version ?? null, evidence_count: model.evidence?.length ?? null, knowledge_count: model.knowledge?.length ?? null };
      add({ category: 'contexxxt', key: 'contexxxt.project-model', value: state.project_model, summary: `.contexxxt/project-model.json uses schema ${model.schema_version ?? 'unknown'} with ${model.knowledge?.length ?? 0} KnowledgeUnits.`, uri: '.contexxxt/project-model.json', digest: hash(await readFile(join(root, '.contexxxt/project-model.json'), 'utf8')) });
    } catch {
      findings.push({ severity: 'warning', code: 'project-model-unreadable', path: '.contexxxt/project-model.json' });
    }
  }
  if (scan.directories.includes('.contextos') || scan.files.some((path) => path.startsWith('.contextos/'))) {
    state.legacy = { path: '.contextos', manifest: null };
    if (scan.files.includes('.contextos/manifest.json')) {
      try {
        const manifest = JSON.parse(await readFile(join(root, '.contextos/manifest.json'), 'utf8'));
        state.legacy.manifest = { schema_version: manifest.schema_version ?? null, context_os_version: manifest.context_os_version ?? null };
      } catch {
        findings.push({ severity: 'warning', code: 'legacy-manifest-unreadable', path: '.contextos/manifest.json' });
      }
    }
    add({ category: 'contexxxt', key: 'contexxxt.legacy-contextos', value: state.legacy, summary: 'Legacy .contextos/ state was detected; no migration was performed.', uri: '.contextos', coverage: 'complete' });
  }
  return state;
}

function stableReportPayload(report) {
  return {
    schema_version: report.schema_version,
    evidence_schema_version: report.evidence_schema_version,
    project: report.project,
    repository: report.repository,
    coverage: report.coverage,
    catalog: report.catalog,
    findings: report.findings,
    evidence: report.evidence.map((item) => ({ ...item, observed_at: '<inspection-time>' })),
  };
}

export function inspectionReportDigest(report) {
  return sha256(stableStringify(stableReportPayload(report)));
}

export async function validateInspectionReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) return [{ code: 'inspection-report-type', path: '$', message: 'InspectionReport must be an object.' }];
  if (report.schema_version !== INSPECTION_REPORT_SCHEMA_VERSION) errors.push({ code: 'inspection-report-version', path: '$.schema_version', message: `Expected ${INSPECTION_REPORT_SCHEMA_VERSION}.` });
  if (report.evidence_schema_version !== PROJECT_MODEL_SCHEMA_VERSION) errors.push({ code: 'inspection-evidence-version', path: '$.evidence_schema_version', message: `Expected ${PROJECT_MODEL_SCHEMA_VERSION}.` });
  if (!Array.isArray(report.evidence)) errors.push({ code: 'inspection-evidence-type', path: '$.evidence', message: 'Evidence must be an array.' });
  const schema = await readProjectModelSchema();
  const evidenceSchema = { $ref: '#/$defs/evidence', $defs: schema.$defs };
  const seen = new Set();
  for (const [index, item] of (report.evidence ?? []).entries()) {
    for (const error of validateJsonSchema(item, evidenceSchema)) errors.push({ ...error, path: error.path.replace(/^\$/, `$.evidence[${index}]`) });
    if (seen.has(item.id)) errors.push({ code: 'duplicate-evidence-id', path: `$.evidence[${index}].id`, message: `Duplicate evidence ID: ${item.id}.` });
    seen.add(item.id);
  }
  if (report.digest && report.digest !== inspectionReportDigest(report)) errors.push({ code: 'inspection-report-digest', path: '$.digest', message: 'InspectionReport digest does not match its stable payload.' });
  return errors.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}

export async function inspectProject(root, { limit = 10000, clock = () => new Date() } = {}) {
  const observedAt = clock().toISOString();
  const findings = [];
  const evidence = [];
  const add = (item) => evidence.push(makeEvidence({ ...item, observedAt }));
  const scan = await scanFilesystem(root, limit);
  const repository = await inspectRepository({ root, add });
  const filesystem = await inspectFilesystem({ scan, add });
  const manifests = await inspectManifests({ root, scan, add, findings });
  const ci = await inspectCi({ root, scan, add });
  const tests = await inspectTests({ scan, manifests, add });
  const documentation = await inspectDocumentation({ root, scan, add });
  const instructions = await inspectInstructions({ root, scan, add });
  const contexxxt = await inspectCurrentContexxxt({ root, scan, add, findings });
  if (repository.git) {
    const status = repository.git.status;
    const revision = {
      commit: repository.git.head,
      branch: repository.git.branch,
      dirty: Boolean(status && (status.changed > 0 || status.untracked > 0 || status.conflicted > 0)),
    };
    for (const item of evidence) item.revision = revision;
  }
  if (scan.truncated) findings.push({ severity: 'warning', code: 'inspection-truncated', path: '.', message: `Inspection stopped at ${limit} files.` });
  findings.sort((a, b) => `${a.severity}:${a.code}:${a.path}`.localeCompare(`${b.severity}:${b.code}:${b.path}`));
  evidence.sort((a, b) => a.id.localeCompare(b.id));
  const report = {
    schema_version: INSPECTION_REPORT_SCHEMA_VERSION,
    evidence_schema_version: PROJECT_MODEL_SCHEMA_VERSION,
    report_id: '',
    generated_at: observedAt,
    root,
    project: { id: normalizedIdPart(basename(root)), name: basename(root) },
    repository,
    coverage: { status: scan.truncated ? 'partial' : 'complete', inspected_files: scan.files.length, truncated: scan.truncated, gaps: scan.truncated ? ['file limit reached'] : [] },
    catalog: { filesystem, manifests, ci, tests, documentation, instructions, contexxxt },
    findings,
    evidence,
    digest: '',
  };
  report.digest = inspectionReportDigest(report);
  report.report_id = `inspection:${report.digest.slice(0, 16)}`;
  return report;
}
