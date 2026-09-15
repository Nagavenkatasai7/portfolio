// A JSON-schema subset validator — the shape the extraction service constrains
// its tool-call output to, reimplemented small enough to run in the browser demo.
// Supported keywords: type, required, properties, enum, pattern, minLength, items.

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function typeMatches(expected, value) {
  switch (expected) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    case 'object': return typeOf(value) === 'object';
    case 'array': return Array.isArray(value);
    default: return true;
  }
}

function label(path) {
  return path || 'value';
}

function check(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type && !typeMatches(schema.type, value)) {
    errors.push(`${label(path)}: expected ${schema.type}, got ${typeOf(value)}`);
    return; // further keyword checks would be noise on the wrong type
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${label(path)}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${label(path)}: shorter than minLength ${schema.minLength}`);
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${label(path)}: does not match pattern ${schema.pattern}`);
    }
  }

  if (typeOf(value) === 'object') {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(`${path ? `${path}.` : ''}${key}: required property is missing`);
        }
      }
    }
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        check(sub, value[key], path ? `${path}.${key}` : key, errors);
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => check(schema.items, item, `${label(path)}[${i}]`, errors));
  }
}

/** validate(schema, value) -> { ok: true } | { ok: false, errors: string[] } */
export function validate(schema, value) {
  const errors = [];
  check(schema, value, '', errors);
  return errors.length ? { ok: false, errors } : { ok: true };
}

export const FILING_SCHEMA = {
  type: 'object',
  required: ['application_number', 'filing_date', 'applicant', 'claims_count', 'status'],
  properties: {
    application_number: { type: 'string', pattern: '^\\d{2}/\\d{3},\\d{3}$' },
    filing_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    applicant: { type: 'string', minLength: 1 },
    claims_count: { type: 'integer' },
    status: { type: 'string', enum: ['pending', 'granted', 'abandoned'] },
  },
};

// Both payloads are synthetic and say so on their face: a well-formed serial
// number and a plausible date would read as one of the real filings the service
// processed. The reserved 00/000,000 and an obviously placeholder applicant keep
// the demo about the schema's shape, which is the only thing it is evidence of.
export const SAMPLE_OK = {
  application_number: '00/000,000',
  filing_date: '2022-06-21',
  applicant: 'Example Applicant, Inc.',
  claims_count: 20,
  status: 'pending',
};

export const SAMPLE_BAD = {
  application_number: '00/000,000',
  filing_date: '2022-06-21',
  applicant: 'Example Applicant, Inc.',
  claims_count: 'twelve',
  status: 'maybe',
};
