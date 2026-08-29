// @ts-check

import { cloneFrozenData, dataError, diagnosticString, hasExactDataKeys, isByteArray, isPlainDataRecord, sha256Hex } from "./runtime-data.js";

/** @typedef {Readonly<{path: string, kind: "audio" | "background" | "chart" | "other", hash: string, critical: boolean, url: string | null, readable: boolean, status: "ready" | "fallback", errorCode: string | null}>} PublicAssetSnapshot */
/** @typedef {{path: string, kind: "audio" | "background" | "chart" | "other", hash: string, critical: boolean, url: string | null, bytes: Uint8Array | null, readable: boolean, status: "ready" | "fallback", errorCode: string | null}} LoadedAsset */

const audioExtensions = new Set(["egg", "ogg", "mp3", "wav", "m4a", "aac", "flac", "webm"]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const videoExtensions = new Set(["mp4", "webm", "mov", "m4v"]);
const maximumMetadataBytes = 16 * 1024 * 1024;
const maximumAssets = 2048;
const maximumAssetBytes = 128 * 1024 * 1024;
const maximumTotalAssetBytes = 512 * 1024 * 1024;
const defaultTimeoutMs = 15_000;

/**
 * Parse deterministic AEROPKG1 bytes and validate every embedded asset.
 *
 * @param {Uint8Array} bytes
 */
export async function parseAeroPackage(bytes) {
  if (!isByteArray(bytes) || bytes.byteLength < 12 || bytes.byteLength > maximumMetadataBytes + maximumTotalAssetBytes + 12) throw dataError("aeropkg_invalid", "AEROPKG1 bytes are invalid");
  const magic = "AEROPKG1";
  for (let index = 0; index < magic.length; index += 1) if (bytes[index] !== magic.charCodeAt(index)) throw dataError("aeropkg_magic_invalid", "AEROPKG1 magic is invalid");
  const metadataLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true);
  if (metadataLength <= 0 || metadataLength > maximumMetadataBytes || 12 + metadataLength > bytes.byteLength) throw dataError("aeropkg_metadata_invalid", "AEROPKG1 metadata length is invalid");
  let metadataValue;
  try { metadataValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(12, 12 + metadataLength))); } catch { throw dataError("aeropkg_metadata_invalid", "AEROPKG1 metadata is not valid UTF-8 JSON"); }
  const metadata = requireRecord(cloneFrozenData(metadataValue), "aeropkg_metadata_invalid");
  if (!hasExactDataKeys(metadata, ["schema", "version", "packageHash", "package", "assets"]) || metadata.schema !== "aerobeat/authored_package_export" || metadata.version !== 1) throw dataError("aeropkg_schema_invalid", "AEROPKG1 metadata schema is unsupported");
  const packageHash = requireHash(metadata.packageHash, "aeropkg_package_hash_invalid");
  const table = requireArray(metadata.assets, "aeropkg_assets_invalid");
  if (table.length > maximumAssets) throw dataError("aeropkg_assets_invalid", "AEROPKG1 contains too many assets");
  const payloadStart = 12 + metadataLength;
  const seen = new Set();
  let expectedOffset = 0;
  /** @type {{path: string, kind: "audio" | "background" | "chart" | "other", hash: string, critical: boolean, url: null, bytes: Uint8Array}[]} */
  const assets = [];
  for (const rawEntry of table) {
    const entry = requireRecord(rawEntry, "aeropkg_asset_invalid");
    if (!hasExactDataKeys(entry, ["path", "offset", "byteLength", "sha256"])) throw dataError("aeropkg_asset_invalid", "AEROPKG1 asset table entries must be exact records");
    const path = normalizeAssetPath(entry.path);
    if (entry.path !== path || path !== path.toLowerCase()) throw dataError("aeropkg_asset_path_noncanonical", "AEROPKG1 asset paths must already be normalized lowercase paths");
    if (seen.has(path.toLowerCase())) throw dataError("asset_duplicate", "Asset paths must be case-insensitively unique");
    seen.add(path.toLowerCase());
    if (!Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.byteLength) || Number(entry.offset) !== expectedOffset || Number(entry.byteLength) < 0 || Number(entry.byteLength) > maximumAssetBytes) throw dataError("aeropkg_asset_range_invalid", "AEROPKG1 asset ranges must be contiguous and bounded");
    const start = safeAdd(payloadStart, Number(entry.offset));
    const end = safeAdd(start, Number(entry.byteLength));
    if (end > bytes.byteLength) throw dataError("aeropkg_asset_range_invalid", "AEROPKG1 asset range exceeds payload");
    const hash = requireBareHash(entry.sha256, "asset_hash_invalid");
    const assetBytes = bytes.slice(start, end);
    if (await sha256Hex(assetBytes) !== hash) throw dataError("asset_hash_mismatch", `Asset ${path} failed SHA-256 verification`);
    const kind = inferKind(path);
    assets.push({ path, kind, hash, critical: kind === "audio" || kind === "chart", url: null, bytes: assetBytes });
    expectedOffset = safeAdd(expectedOffset, Number(entry.byteLength));
    if (expectedOffset > maximumTotalAssetBytes) throw dataError("aeropkg_asset_range_invalid", "AEROPKG1 assets exceed the total byte limit");
  }
  if (payloadStart + expectedOffset !== bytes.byteLength) throw dataError("aeropkg_trailing_bytes", "AEROPKG1 contains unclaimed trailing bytes");
  return Object.freeze({ package: metadata.package, packageHash, assets: Object.freeze(assets) });
}

/**
 * Load and verify explicit package asset descriptors.
 *
 * @param {unknown} value
 * @param {{fetch?: typeof globalThis.fetch, baseUrl?: string, signal?: AbortSignal, timeoutMs?: number, maximumAssetBytes?: number}} [options]
 */
export async function loadPackageAssets(value, options = {}) {
  const input = value === undefined ? [] : requireArray(value, "assets_invalid");
  if (input.length > maximumAssets) throw dataError("assets_invalid", "Package contains too many assets");
  const configuredMaximum = normalizePositiveLimit(options.maximumAssetBytes, maximumAssetBytes, "asset_limit_invalid");
  const seen = new Set();
  let totalBytes = 0;
  /** @type {LoadedAsset[]} */
  const loaded = [];
  for (const rawEntry of input) {
    const entry = requireRecord(rawEntry, "asset_invalid");
    if (Reflect.ownKeys(entry).some((key) => typeof key !== "string" || !["path", "kind", "hash", "url", "bytes", "critical"].includes(key))) throw dataError("asset_invalid", "Asset descriptors contain unsupported fields");
    const path = normalizeAssetPath(entry.path);
    if (seen.has(path.toLowerCase())) throw dataError("asset_duplicate", "Asset paths must be case-insensitively unique");
    seen.add(path.toLowerCase());
    const kind = normalizeKind(entry.kind, path);
    const critical = kind === "audio" || kind === "chart" || entry.critical === true;
    const hash = normalizeHash(entry.hash);
    if (critical && !hash) throw dataError("asset_hash_missing", `Critical asset ${path} has no declared SHA-256`);
    const url = normalizeAssetUrl(entry.url, options.baseUrl);
    let bytes = normalizeBytes(entry.bytes);
    let readable = bytes !== null;
    let status = /** @type {"ready" | "fallback"} */ ("ready");
    let errorCode = null;
    try {
      if (!bytes && url) bytes = await fetchBytes(url, options.fetch, options.signal, options.timeoutMs, configuredMaximum);
      if (!bytes) throw dataError("asset_unavailable", `Asset ${path} has no readable source`);
      if (bytes.byteLength > configuredMaximum) throw dataError("asset_too_large", `Asset ${path} exceeds the byte limit`);
      totalBytes = safeAdd(totalBytes, bytes.byteLength);
      if (totalBytes > maximumTotalAssetBytes) throw dataError("assets_too_large", "Package assets exceed the total byte limit");
      readable = true;
      if (hash && await sha256Hex(bytes) !== hash) throw dataError("asset_hash_mismatch", `Asset ${path} failed SHA-256 verification`);
    } catch (cause) {
      const code = errorCodeFor(cause);
      if (critical) throw cause;
      bytes = null; readable = false; status = "fallback"; errorCode = code;
    }
    loaded.push({ path, kind, hash, critical, url, bytes, readable, status, errorCode });
  }
  if (!loaded.some((entry) => entry.kind === "audio" && entry.status === "ready")) throw dataError("audio_missing", "Playable content requires one verified audio asset");
  return loaded;
}

/** @param {readonly LoadedAsset[]} assets @returns {readonly PublicAssetSnapshot[]} */
export function publicAssetSnapshots(assets) {
  return Object.freeze(assets.map((asset) => Object.freeze({ path: asset.path, kind: asset.kind, hash: asset.hash, critical: asset.critical, url: asset.url, readable: asset.readable, status: asset.status, errorCode: asset.errorCode })));
}

/** @param {unknown} value @returns {string} */
export function normalizeAssetPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value)) throw dataError("asset_path_invalid", "Asset path is invalid");
  const normalized = value.replaceAll("\\", "/").normalize("NFC").replace(/^\.\//u, "");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/u.test(normalized) || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) throw dataError("asset_path_invalid", "Asset path must be relative and normalized");
  return normalized;
}

/** @param {string} path @returns {"audio" | "background" | "chart" | "other"} */
function inferKind(path) { const extension = path.split(".").at(-1)?.toLowerCase() ?? ""; if (audioExtensions.has(extension)) return "audio"; if (imageExtensions.has(extension) || videoExtensions.has(extension)) return "background"; if (extension === "json" || extension === "yaml" || extension === "yml") return "chart"; return "other"; }
/** @param {unknown} value @param {string} path */
function normalizeKind(value, path) { if (value === undefined || value === null || value === "") return inferKind(path); if (value === "audio" || value === "background" || value === "chart" || value === "other") return value; throw dataError("asset_kind_invalid", "Asset kind is invalid"); }
/** @param {unknown} value @returns {string} */
function normalizeHash(value) { if (value === undefined || value === null || value === "") return ""; if (typeof value === "string") return value.startsWith("sha256:") ? requireHash(value, "asset_hash_invalid").slice(7) : requireBareHash(value, "asset_hash_invalid"); if (hasExactDataKeys(value, ["schema", "version", "algorithm", "value"]) && value.schema === "aerobeat/content_hash" && value.version === 1 && value.algorithm === "sha256" && typeof value.value === "string") return requireBareHash(value.value, "asset_hash_invalid"); throw dataError("asset_hash_invalid", "Asset SHA-256 declaration is invalid"); }
/** @param {unknown} value @returns {Uint8Array | null} */
function normalizeBytes(value) { if (value === undefined || value === null) return null; if (value instanceof Uint8Array) return Uint8Array.from(value); if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0)); throw dataError("asset_bytes_invalid", "Asset bytes must be Uint8Array or ArrayBuffer"); }
/** @param {unknown} value @param {string | undefined} baseUrl @returns {string | null} */
function normalizeAssetUrl(value, baseUrl) { if (value === undefined || value === null || value === "") return null; if (typeof value !== "string") throw dataError("asset_url_invalid", "Asset URL must be a string"); let parsed; try { parsed = new URL(value, baseUrl); } catch { throw dataError("asset_url_invalid", "Asset URL is invalid"); } if (parsed.protocol !== "https:" && parsed.protocol !== "blob:" && !(parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"))) throw dataError("asset_url_insecure", "External assets require HTTPS or localhost HTTP"); return parsed.href; }
/** @param {string} url @param {typeof globalThis.fetch | undefined} injected @param {AbortSignal | undefined} signal @param {number | undefined} timeoutMs @param {number} maximumBytes */
async function fetchBytes(url, injected, signal, timeoutMs, maximumBytes) {
  const fetchFunction = injected ?? globalThis.fetch;
  if (!fetchFunction) throw dataError("fetch_unavailable", "Fetch is unavailable");
  const timeout = normalizePositiveLimit(timeoutMs, defaultTimeoutMs, "timeout_invalid");
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  let timeoutId;
  try {
    const request = Promise.resolve().then(() => fetchFunction(url, { mode: "cors", credentials: "omit", redirect: "follow", signal: controller.signal }));
    const timeoutFailure = new Promise((_, reject) => { timeoutId = setTimeout(() => { controller.abort(); reject(dataError("fetch_timeout", "External asset request timed out")); }, timeout); });
    const response = /** @type {Response} */ (await Promise.race([raceAbort(request, controller.signal), timeoutFailure]));
    if (!response.ok) throw dataError("asset_http_failed", `External asset returned HTTP ${response.status}`);
    if (response.url) normalizeAssetUrl(response.url, undefined);
    const declared = response.headers?.get?.("content-length");
    if (declared !== null && declared !== undefined && declared !== "") {
      if (!/^(0|[1-9][0-9]*)$/u.test(declared)) throw dataError("asset_length_invalid", "External asset Content-Length is invalid");
      const parsed = Number(declared);
      if (!Number.isSafeInteger(parsed) || parsed > maximumBytes) throw dataError("asset_too_large", "External asset exceeds the byte limit");
    }
    const bytes = new Uint8Array(await raceAbort(response.arrayBuffer(), controller.signal));
    if (bytes.byteLength > maximumBytes) throw dataError("asset_too_large", "External asset exceeds the byte limit");
    return bytes;
  } catch (cause) {
    if (signal?.aborted) throw dataError("operation_aborted", "Content load was cancelled");
    if (cause && typeof cause === "object" && "code" in cause) throw cause;
    throw dataError("cors_unreadable", diagnosticString(cause, "message") ?? "External asset could not be read through CORS");
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abort);
  }
}
/** @param {Promise<unknown>} promise @param {AbortSignal} signal */
async function raceAbort(promise, signal) {
  if (signal.aborted) throw dataError("operation_aborted", "Content load was cancelled");
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(dataError("operation_aborted", "Content load was cancelled")); };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (cause) => { cleanup(); reject(cause); });
  });
}
/** @param {unknown} value @param {number} fallback @param {string} code */
function normalizePositiveLimit(value, fallback, code) { if (value === undefined) return fallback; if (!Number.isSafeInteger(value) || Number(value) <= 0) throw dataError(code, "Runtime limit must be a positive safe integer"); return Number(value); }
/** @param {number} left @param {number} right */
function safeAdd(left, right) { const result = left + right; if (!Number.isSafeInteger(result)) throw dataError("aeropkg_asset_range_invalid", "Asset byte range overflowed"); return result; }
/** @param {unknown} value @param {string} code */
function requireRecord(value, code) { if (!isPlainDataRecord(value)) throw dataError(code, "Expected a plain asset record"); return value; }
/** @param {unknown} value @param {string} code */
function requireArray(value, code) { if (!Array.isArray(value)) throw dataError(code, "Expected an asset array"); return value; }
/** @param {unknown} value @param {string} code */
function requireHash(value, code) { if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) throw dataError(code, "Expected a lowercase prefixed SHA-256"); return value; }
/** @param {unknown} value @param {string} code */
function requireBareHash(value, code) { if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw dataError(code, "Expected a lowercase SHA-256"); return value; }
/** @param {unknown} cause */
function errorCodeFor(cause) { return diagnosticString(cause, "code") ?? "asset_failed"; }
