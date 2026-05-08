/**
 * Recursively converts all object keys from snake_case to camelCase,
 * and coerces numeric strings (from MySQL DECIMAL/FLOAT columns) to numbers.
 */

function toCamel(str) {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
}

/** Returns true if the string looks like a plain number (integer or decimal). */
function isNumericString(val) {
  if (typeof val !== 'string' || val.trim() === '') return false
  return /^-?\d+(\.\d+)?$/.test(val.trim())
}

function transformKeys(value) {
  if (Array.isArray(value)) {
    return value.map(transformKeys)
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date) && !(Buffer.isBuffer(value))) {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[toCamel(k)] = transformKeys(v)
    }
    return out
  }
  // Coerce numeric strings from MySQL to actual numbers
  if (isNumericString(value)) {
    return parseFloat(value)
  }
  return value
}

/**
 * Intercepts res.json() and transforms the payload keys to camelCase
 * while coercing MySQL numeric strings to JS numbers.
 * Skips transformation for error responses (4xx/5xx) so error messages
 * containing snake_case words are never silently mutated.
 */
function camelCaseResponse(req, res, next) {
  const originalJson = res.json.bind(res)
  res.json = function (body) {
    if (res.statusCode >= 400) {
      return originalJson(body)
    }
    return originalJson(transformKeys(body))
  }
  next()
}

module.exports = camelCaseResponse
