function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function resolveRef(rootSchema, reference) {
  if (!reference.startsWith('#/')) throw new Error(`Only local schema references are supported: ${reference}`);
  return reference.slice(2).split('/').reduce((value, segment) => {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    return value?.[key];
  }, rootSchema);
}

function matchesType(value, type) {
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'null') return value === null;
  return typeof value === type;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function validateNode(value, schema, rootSchema, path, errors) {
  if (schema.$ref) {
    const resolved = resolveRef(rootSchema, schema.$ref);
    if (!resolved) {
      errors.push({ code: 'schema-ref-missing', path, message: `Schema reference not found: ${schema.$ref}` });
      return;
    }
    validateNode(value, resolved, rootSchema, path, errors);
    return;
  }

  if (schema.const !== undefined && stableValue(value) !== stableValue(schema.const)) {
    errors.push({ code: 'schema-const', path, message: `Expected ${JSON.stringify(schema.const)}.` });
    return;
  }
  if (schema.enum && !schema.enum.some((candidate) => stableValue(candidate) === stableValue(value))) {
    errors.push({ code: 'schema-enum', path, message: `Expected one of: ${schema.enum.join(', ')}.` });
    return;
  }
  if (schema.type && !matchesType(value, schema.type)) {
    errors.push({ code: 'schema-type', path, message: `Expected ${schema.type}.` });
    return;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ code: 'schema-min-length', path, message: `Minimum length is ${schema.minLength}.` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ code: 'schema-max-length', path, message: `Maximum length is ${schema.maxLength}.` });
    }
    if (schema.pattern && !(new RegExp(schema.pattern).test(value))) {
      errors.push({ code: 'schema-pattern', path, message: `Value does not match ${schema.pattern}.` });
    }
    if (schema.format === 'date' && !validDate(value)) {
      errors.push({ code: 'schema-date', path, message: 'Expected a valid YYYY-MM-DD date.' });
    }
    if (schema.format === 'date-time' && !validDateTime(value)) {
      errors.push({ code: 'schema-date-time', path, message: 'Expected a valid ISO date-time.' });
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ code: 'schema-minimum', path, message: `Minimum value is ${schema.minimum}.` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ code: 'schema-maximum', path, message: `Maximum value is ${schema.maximum}.` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ code: 'schema-min-items', path, message: `Minimum item count is ${schema.minItems}.` });
    }
    if (schema.uniqueItems) {
      const values = value.map(stableValue);
      if (new Set(values).size !== values.length) {
        errors.push({ code: 'schema-unique-items', path, message: 'Array items must be unique.' });
      }
    }
    if (schema.items) value.forEach((item, index) => validateNode(item, schema.items, rootSchema, `${path}[${index}]`, errors));
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push({ code: 'schema-min-properties', path, message: `Minimum property count is ${schema.minProperties}.` });
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push({ code: 'schema-required', path: `${path}.${required}`, message: 'Required property is missing.' });
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties?.[key];
      if (childSchema) validateNode(child, childSchema, rootSchema, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) {
        errors.push({ code: 'schema-additional-property', path: `${path}.${key}`, message: 'Property is not allowed.' });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateNode(child, schema.additionalProperties, rootSchema, `${path}.${key}`, errors);
      }
    }
  }
}

export function validateJsonSchema(value, schema) {
  const errors = [];
  validateNode(value, schema, schema, '$', errors);
  return errors.sort((a, b) => `${a.path}:${a.code}`.localeCompare(`${b.path}:${b.code}`));
}
