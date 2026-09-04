// @ts-check

import { sha256Hex as sharedSha256Hex } from "@aerobeat/web-hash";

/** Internal clone limit shared only by canonical song-package boundaries. */
export const runtimePackageDataLimits = Object.freeze({ maximumItems: 500_000 });

/**
 * Return whether a value is a plain enumerable data record.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainDataRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}

/**
 * Read one already-narrowed plain-data field without invoking user code.
 *
 * @param {Record<string, unknown>} record
 * @param {string} key
 * @returns {unknown}
 */
export function dataProperty(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && descriptor.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

/** @param {unknown} value @param {readonly string[]} keys @returns {value is Record<string, unknown>} */
export function hasExactDataKeys(value, keys) {
  if (!isPlainDataRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every((key) => typeof key === "string" && keys.includes(key));
}

/** Locale-independent Unicode code-point ordering for durable identities. @param {string} left @param {string} right */
export function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Read an own data-only diagnostic string without invoking accessors. @param {unknown} value @param {string} key */
export function diagnosticString(value, key) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : null;
}

/**
 * Narrow untrusted package data into deeply frozen JSON-like data without executing
 * accessors or retaining browser/provider objects.
 *
 * @param {unknown} value
 * @param {{maximumDepth?: number, maximumItems?: number, maximumStringLength?: number}} [limits]
 * @returns {unknown}
 */
export function cloneFrozenData(value, limits = {}) {
  const maximumDepth = limits.maximumDepth ?? 48;
  const maximumItems = limits.maximumItems ?? 100_000;
  const maximumStringLength = limits.maximumStringLength ?? 1_000_000;
  const seen = new Set();
  let items = 0;
  return visit(value, 0);

  /** @param {unknown} current @param {number} depth @returns {unknown} */
  function visit(current, depth) {
    items += 1;
    if (items > maximumItems) throw dataError("data_too_large", "Content data exceeds the item limit");
    if (depth > maximumDepth) throw dataError("data_too_deep", "Content data exceeds the nesting limit");
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "string") {
      if (current.length > maximumStringLength) throw dataError("string_too_large", "Content string exceeds the length limit");
      return current;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw dataError("number_invalid", "Content numbers must be finite");
      return Object.is(current, -0) ? 0 : current;
    }
    if (typeof current !== "object") throw dataError("data_type_invalid", "Content data must be JSON-like");
    if (seen.has(current)) throw dataError("data_cycle", "Content data must not contain cycles");
    seen.add(current);
    try {
      if (Array.isArray(current)) return Object.freeze(current.map((entry) => visit(entry, depth + 1)));
      if (!isPlainDataRecord(current)) throw dataError("data_record_invalid", "Content records must be plain enumerable data");
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(current)) {
        if (typeof key !== "string") throw dataError("data_key_invalid", "Content keys must be strings");
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw dataError("data_descriptor_invalid", "Content accessors and hidden fields are not allowed");
        result[key] = visit(descriptor.value, depth + 1);
      }
      return Object.freeze(result);
    } finally {
      seen.delete(current);
    }
  }
}

/** @param {unknown} value @returns {string} */
export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

/** @param {unknown} value @returns {unknown} */
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (isPlainDataRecord(value)) {
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) result[key] = sortValue(value[key]);
    return result;
  }
  return value;
}

/** @param {Uint8Array | string} value @returns {Promise<string>} */
export async function sha256Hex(value) {
  try {
    return await sharedSha256Hex(value);
  } catch {
    throw dataError("hash_unavailable", "SHA-256 is unavailable in this environment");
  }
}

/** @param {unknown} value @returns {value is Uint8Array} */
export function isByteArray(value) { return value instanceof Uint8Array; }

/** @param {string} code @param {string} message @returns {Error & {code: string}} */
export function dataError(code, message) {
  const error = /** @type {Error & {code: string}} */ (new Error(message));
  error.name = "AeroContentRuntimeError";
  error.code = code;
  return error;
}
