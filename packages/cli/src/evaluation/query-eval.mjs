import { hash } from '../lib.mjs';
import { modelDigest, stableStringify } from '../model/model.mjs';
import { buildTargetContext, executeQuery } from '../query/query.mjs';

function resultIds(result) {
  if (Array.isArray(result.items)) return result.items.map((item) => typeof item === 'string' ? item : item.id);
  if (Array.isArray(result.knowledge)) return result.knowledge.map((item) => typeof item === 'string' ? item : item.id);
  return [];
}

function evaluateExpectation(result, expect = {}) {
  const failures = [];
  const ids = resultIds(result);
  if (expect.ids && stableStringify(ids) !== stableStringify(expect.ids)) failures.push(`ids: expected ${JSON.stringify(expect.ids)}, received ${JSON.stringify(ids)}`);
  if (expect.contains_ids) {
    for (const id of expect.contains_ids) if (!ids.includes(id)) failures.push(`contains_ids: missing ${id}`);
  }
  if (expect.empty !== undefined && (ids.length === 0) !== expect.empty) failures.push(`empty: expected ${expect.empty}, received ${ids.length === 0}`);
  if (expect.truncated !== undefined && result.budget?.truncated !== expect.truncated) failures.push(`truncated: expected ${expect.truncated}, received ${result.budget?.truncated}`);
  for (const [dimension, status] of Object.entries(expect.dimension_status ?? {})) {
    if (result.dimensions?.[dimension]?.status !== status) failures.push(`dimension ${dimension}: expected ${status}, received ${result.dimensions?.[dimension]?.status}`);
  }
  if (expect.conflict_count !== undefined && result.conflicts?.length !== expect.conflict_count) failures.push(`conflict_count: expected ${expect.conflict_count}, received ${result.conflicts?.length}`);
  return failures;
}

export function validateEvalSuite(suite) {
  const errors = [];
  if (!suite || typeof suite !== 'object' || Array.isArray(suite)) return [{ code: 'eval-suite-type', path: '$', message: 'Eval suite must be an object.' }];
  if (suite.schema_version !== '1.0.0') errors.push({ code: 'eval-suite-version', path: '$.schema_version', message: 'Expected 1.0.0.' });
  if (typeof suite.id !== 'string' || suite.id.length === 0) errors.push({ code: 'eval-suite-id', path: '$.id', message: 'Suite ID is required.' });
  if (!Array.isArray(suite.cases) || suite.cases.length === 0) errors.push({ code: 'eval-suite-cases', path: '$.cases', message: 'At least one case is required.' });
  const ids = new Set();
  for (const [index, item] of (suite.cases ?? []).entries()) {
    if (!item.id || ids.has(item.id)) errors.push({ code: 'eval-case-id', path: `$.cases[${index}].id`, message: 'Case IDs must be present and unique.' });
    ids.add(item.id);
    if (!['query', 'context'].includes(item.action)) errors.push({ code: 'eval-case-action', path: `$.cases[${index}].action`, message: 'Action must be query or context.' });
    if (item.action === 'query' && !item.selector) errors.push({ code: 'eval-case-selector', path: `$.cases[${index}].selector`, message: 'Query selector is required.' });
    if (item.action === 'context' && !item.target) errors.push({ code: 'eval-case-target', path: `$.cases[${index}].target`, message: 'Context target is required.' });
  }
  return errors;
}

export function runQueryEval(model, indexes, suite) {
  const suiteErrors = validateEvalSuite(suite);
  if (suiteErrors.length > 0) return { ok: false, validation_errors: suiteErrors };
  const cases = suite.cases.map((item) => {
    let result;
    try {
      result = item.action === 'query'
        ? executeQuery(model, indexes, item.selector, item.value, item.options ?? {})
        : buildTargetContext(model, indexes, item.target, item.options ?? {});
    } catch (error) {
      return { id: item.id, passed: false, failures: [`execution: ${error.message}`] };
    }
    const failures = evaluateExpectation(result, item.expect);
    return { id: item.id, passed: failures.length === 0, failures };
  });
  const passed = cases.filter((item) => item.passed).length;
  const inputDigest = hash(stableStringify({ suite, model: modelDigest(model) }));
  return {
    ok: passed === cases.length,
    eval_run_id: `query-eval:${inputDigest.slice(0, 16)}`,
    suite: suite.id,
    model_snapshot: model.snapshot.id,
    model_digest: modelDigest(model),
    total: cases.length,
    passed,
    failed: cases.length - passed,
    cases,
  };
}
