import { isAbsolute, resolve } from 'node:path';
import { assertInsideRoot, pathExists, resolveSafeRoot, UsageError, VERSION, writeJson } from '../lib.mjs';
import { buildDerivedIndexes, loadProjectModel } from '../model/model.mjs';
import { resolveTask, validateContextPacket, validateTaskResolution } from './resolver.mjs';

function budget(options) {
  const maxBytes = options.max_bytes === undefined ? 12288 : Number(options.max_bytes);
  const maxTokens = options.max_tokens === undefined ? null : Number(options.max_tokens);
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 1048576) throw new UsageError('--max-bytes debe ser un entero entre 1024 y 1048576.');
  if (maxTokens !== null && (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 262144)) throw new UsageError('--max-tokens debe ser un entero entre 256 y 262144.');
  return maxTokens === null ? maxBytes : Math.min(maxBytes, maxTokens * 4);
}

export async function commandResolve(positionals, options) {
  const root = await resolveSafeRoot(options.root ?? '.');
  const target = options.target ?? positionals[0];
  const intent = options.intent ?? positionals.slice(target === positionals[0] ? 1 : 0).join(' ');
  const loaded = await loadProjectModel(root, options.model);
  if (loaded.errors.length > 0) throw new UsageError(`Project Model inválido: ${loaded.errors.length} errores.`);
  const data = resolveTask(loaded.model, buildDerivedIndexes(loaded.model), { target, intent, dimensions: options.dimensions, maxBytes: budget(options) });
  const contractErrors = [...await validateTaskResolution(data.resolution), ...await validateContextPacket(data.packet)];
  if (contractErrors.length > 0) throw new UsageError(`El resolver produjo contratos inválidos: ${contractErrors.length} errores.`);
  const changes = [];
  if (options.output) {
    const path = isAbsolute(options.output) ? resolve(options.output) : resolve(root, options.output);
    assertInsideRoot(root, path);
    if (await pathExists(path)) throw new UsageError(`El output ya existe y no se sobrescribirá: ${options.output}`);
    await writeJson(root, path, data);
    changes.push({ action: 'created', path: options.output });
  }
  return {
    code: data.resolution.can_proceed ? 0 : 1,
    result: {
      ok: data.resolution.can_proceed,
      command: 'resolve', version: VERSION, root,
      summary: `TaskResolution: ${data.resolution.required_dimensions.length} dimensiones requeridas, ${data.packet.budget.knowledge_units} KnowledgeUnits, ${data.packet.budget.emitted_bytes} bytes.`,
      changes,
      findings: data.resolution.questions.map((item) => ({ severity: 'warning', code: 'high-value-question', path: item.dimension, message: item.question })),
      data,
    },
  };
}
