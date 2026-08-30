import { isAbsolute, resolve } from 'node:path';
import { assertInsideRoot, readJson, resolveSafeRoot, UsageError, VERSION } from '../lib.mjs';
import {
  collectStructuralEvidence,
  compareStructuralProviders,
  createCodebaseMemoryCliTransport,
  createCodebaseMemorySnapshotTransport,
  defaultCodebaseMemoryProject,
} from './providers.mjs';

function providerOption(options) {
  const values = options.providers ?? [];
  if (values.length > 1) throw new UsageError('Usa un solo --provider para structural.');
  return values[0] ?? 'auto';
}

export async function commandStructural(positionals, options) {
  const action = positionals[0] ?? 'capabilities';
  const root = await resolveSafeRoot(positionals[1] ?? options.root ?? '.');
  let transport = createCodebaseMemoryCliTransport();
  if (options.snapshot) {
    const snapshotPath = isAbsolute(options.snapshot) ? resolve(options.snapshot) : resolve(root, options.snapshot);
    assertInsideRoot(root, snapshotPath);
    let snapshot;
    try { snapshot = await readJson(snapshotPath); } catch (error) {
      if (error?.code === 'ENOENT') throw new UsageError(`Snapshot estructural no encontrado: ${options.snapshot}`);
      if (error instanceof SyntaxError) throw new UsageError(`Snapshot estructural contiene JSON inválido: ${options.snapshot}`);
      throw error;
    }
    transport = createCodebaseMemorySnapshotTransport(snapshot);
  }
  const project = options.project ?? defaultCodebaseMemoryProject(root);
  if (action === 'capabilities') {
    const optional = await transport.describe();
    return {
      code: 0,
      result: {
        ok: true,
        command: 'structural capabilities',
        version: VERSION,
        root,
        summary: optional.available ? `Native disponible; Codebase Memory ${optional.version} detectado.` : 'Native disponible; Codebase Memory no detectado.',
        data: {
          native: { available: true, capabilities: ['topology', 'manifests', 'commands', 'documentation', 'instructions'] },
          codebase_memory: optional,
          project,
        },
      },
    };
  }
  if (action === 'inspect') {
    const collected = await collectStructuralEvidence(root, { provider: providerOption(options), project, transport });
    return {
      code: 0,
      result: {
        ok: true,
        command: 'structural inspect',
        version: VERSION,
        root,
        summary: `${collected.selected} produjo ${collected.snapshot.evidence.length} Evidence estructurales con cobertura ${collected.snapshot.coverage.status}.`,
        findings: collected.warnings.map((message) => ({ severity: 'warning', code: 'structural-provider-fallback', message })),
        data: collected,
      },
    };
  }
  if (action === 'compare') {
    const comparison = await compareStructuralProviders(root, { project, transport });
    return {
      code: 0,
      result: {
        ok: true,
        command: 'structural compare',
        version: VERSION,
        root,
        summary: comparison.available
          ? `Comparación completa: ${comparison.claims.length} diferencias estructurales medibles; no implica mejora de calidad de tarea.`
          : `Codebase Memory no disponible; Native sigue operativo (${comparison.warning}).`,
        data: comparison,
      },
    };
  }
  throw new UsageError('Acción structural desconocida. Usa capabilities, inspect o compare.');
}
