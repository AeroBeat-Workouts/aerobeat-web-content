// @ts-check

import {
  backgroundSuggestionPrecedence,
  isBackgroundSuggestion,
  isPersistenceHandle,
  isThemeDescriptor,
  serviceIds
} from "@aerobeat/web-contracts";
import { loadPackageAssets, normalizeAssetPath, parseAeroPackage, publicAssetSnapshots } from "./assets.js";
import { composeRuntimeVariant, validateRuntimePackage } from "./package-content.js";
import { cloneFrozenData, compareCodePoints, dataError, dataProperty, diagnosticString, isPlainDataRecord } from "./runtime-data.js";

/** @typedef {ReturnType<typeof createAeroContentRuntime>} AeroContentRuntime */
/** @typedef {Readonly<Record<string, unknown>>} DataRecord */
/** @typedef {import("./package-content.js").RuntimeVariant} RuntimeVariant */
/** @typedef {import("./assets.js").LoadedAsset} LoadedAsset */

/** @type {Readonly<Record<string, unknown>>} */
export const aeroContentRuntimeCapabilities = Object.freeze({
  directPackages: true,
  externalUrls: true,
  persistenceHandles: true,
  aeroPackageV1: true,
  sha256Verification: true,
  corsReadability: true,
  cosmeticFallback: true,
  variantComposition: true,
  pausedFutureSwap: true,
  playlistAllowlistRequired: false
});

/**
 * Create one content runtime for one connected `aero-game`.
 *
 * @param {{fetch?: typeof globalThis.fetch, persistenceResolver?: {loadPackage?: (handle: DataRecord) => Promise<unknown>, readAsset?: (handle: DataRecord, path: string) => Promise<Uint8Array>, exportPackage?: (handle: DataRecord) => Promise<unknown>}, supportedRulesetIds?: readonly string[], supportedRecipeIds?: readonly string[], onListenerError?: (error: unknown) => void}} [options]
 */
export function createAeroContentRuntime(options = {}) {
  const runtimeOptions = normalizeRuntimeConfiguration(options);
  const listeners = new Set();
  let generation = 0;
  let activeAbort = new AbortController();
  let destroyed = false;
  /** @type {LoadedAsset[]} */
  let assets = [];
  /** @type {Map<string, RuntimeVariant>} */
  let variantById = new Map();
  /** @type {Map<string, RuntimeVariant>} */
  let composedVariants = new Map();
  /** @type {RuntimeVariant | null} */
  let selectedVariant = null;
  /** @type {readonly DataRecord[]} */
  let resolvedEvents = Object.freeze([]);
  let playbackState = "idle";
  let playbackPositionMs = 0;
  let judgedEventIds = new Set();
  let activeEventIds = new Set();
  /** @type {(() => Promise<unknown>) | null} */
  let reloadLoader = null;
  /** @type {RuntimeLoadOptions} */
  let reloadOptions = {};
  /** @type {DataRecord | null} */
  let loadedPackage = null;
  let loadedBpm = 120;
  let packageId = null;
  let packageHash = null;
  let sourceSnapshot = null;
  let contentLineage = null;
  let themeSnapshot = null;
  let backgroundSnapshot = fallbackBackground();
  let snapshot = makeSnapshot("idle", null);

  const service = Object.freeze({
    /**
     * Load a direct package wrapper. Raw bytes remain private to this service.
     *
     * @param {unknown} input Plain package or `{package, packageHash, assets}` wrapper.
     * @param {RuntimeLoadOptions} [loadOptions]
     */
    loadPackage(input, loadOptions = {}) {
      assertOpen();
      const normalizedOptions = normalizeLoadOptions(loadOptions);
      const wrapper = isPlainDataRecord(input) && Object.hasOwn(input, "package") ? input : { package: input, assets: normalizedOptions.assets ?? [] };
      const loader = async () => ({ package: dataProperty(wrapper, "package"), packageHash: dataProperty(wrapper, "packageHash") ?? normalizedOptions.packageHash ?? null, assets: dataProperty(wrapper, "assets") ?? normalizedOptions.assets ?? [], baseUrl: normalizedOptions.baseUrl });
      return startLoad(loader, Object.freeze({ kind: "direct", id: "direct-package" }), normalizedOptions);
    },
    /**
     * Load a CORS-readable external package JSON URL.
     *
     * @param {string} url
     * @param {RuntimeLoadOptions} [loadOptions]
     */
    loadExternalPackage(url, loadOptions = {}) {
      assertOpen();
      const normalizedOptions = normalizeLoadOptions(loadOptions);
      const normalizedUrl = normalizeExternalUrl(url);
      const loader = async () => {
        const value = await fetchPackageJson(normalizedUrl, activeAbort.signal);
        const wrapper = isPlainDataRecord(value) && Object.hasOwn(value, "package") ? value : { package: value, assets: normalizedOptions.assets ?? [] };
        return { package: dataProperty(wrapper, "package"), packageHash: dataProperty(wrapper, "packageHash") ?? normalizedOptions.packageHash ?? null, assets: dataProperty(wrapper, "assets") ?? normalizedOptions.assets ?? [], baseUrl: normalizedUrl };
      };
      return startLoad(loader, Object.freeze({ kind: "external_url", id: normalizedUrl }), normalizedOptions);
    },
    /**
     * Resolve an authored persistence handle through the injected public resolver.
     *
     * @param {unknown} handleValue
     * @param {RuntimeLoadOptions} [loadOptions]
     */
    loadPersistenceHandle(handleValue, loadOptions = {}) {
      assertOpen();
      const normalizedOptions = normalizeLoadOptions(loadOptions);
      if (!isPersistenceHandle(handleValue)) throw dataError("persistence_handle_invalid", "Persistence handle does not satisfy the public contract");
      const handle = /** @type {DataRecord} */ (cloneFrozenData(handleValue));
      const resolver = runtimeOptions.persistenceResolver;
      if (!resolver) throw dataError("persistence_resolver_unavailable", "No persistence resolver was injected");
      const loader = async () => {
        if (resolver.exportPackage) {
          const exported = await resolver.exportPackage(handle);
          const bytes = extractExportBytes(exported);
          const parsed = await parseAeroPackage(bytes);
          return { ...parsed, baseUrl: undefined };
        }
        if (!resolver.loadPackage || !resolver.readAsset) throw dataError("persistence_resolver_incomplete", "Persistence resolver needs exportPackage or loadPackage/readAsset");
        const loaded = await resolver.loadPackage(handle);
        if (!isPlainDataRecord(loaded)) throw dataError("persistence_record_invalid", "Persistence resolver returned an invalid record");
        const rawPaths = dataProperty(loaded, "assetPaths");
        const paths = rawPaths === undefined ? [] : normalizePathList(rawPaths);
        const declarations = normalizedOptions.assetHashes ?? Object.freeze({});
        const loadedAssets = [];
        for (const path of paths) {
          const bytes = await resolver.readAsset(handle, path);
          if (!(bytes instanceof Uint8Array)) throw dataError("persistence_asset_invalid", "Persistence resolver returned invalid asset bytes");
          loadedAssets.push({ path, hash: dataProperty(declarations, path), bytes });
        }
        return { package: dataProperty(loaded, "package"), packageHash: handle.packageHash, assets: loadedAssets, baseUrl: undefined };
      };
      return startLoad(loader, Object.freeze({ kind: "persistence_handle", id: `${handle.namespace}:${handle.key}`, handle }), normalizedOptions);
    },
    async reload() {
      assertOpen();
      if (!reloadLoader || !sourceSnapshot) throw dataError("reload_unavailable", "No content source is available to reload");
      return startLoad(reloadLoader, sourceSnapshot, reloadOptions);
    },
    /** @param {string} variantId @param {{modifierIds?: readonly string[]}} [selection] */
    async selectVariant(variantId, selection = {}) {
      assertReady();
      if (playbackState === "running") throw dataError("variant_swap_running", "Variants may not change while gameplay is running");
      const target = await resolveVariant(requireBoundedString(variantId, "variant_identity_invalid", 256), normalizeModifierSelection(selection));
      selectedVariant = target;
      resolvedEvents = timelineFor(target, loadedBpm);
      publish();
      return target;
    },
    /**
     * Replace only future targets while paused. Past, judged and active event objects
     * remain the exact frozen objects already observed by gameplay.
     *
     * @param {string} variantId
     * @param {{modifierIds?: readonly string[]}} [selection]
     */
    async swapFutureVariant(variantId, selection = {}) {
      assertReady();
      if (playbackState !== "paused") throw dataError("variant_swap_not_paused", "Future-target swaps require a paused session");
      const target = await resolveVariant(requireBoundedString(variantId, "variant_identity_invalid", 256), normalizeModifierSelection(selection));
      const future = timelineFor(target, loadedBpm);
      const preserved = resolvedEvents.filter((event) => Number(event.centerTimestampMs) < playbackPositionMs || judgedEventIds.has(String(event.eventId)) || activeEventIds.has(String(event.eventId)));
      const preservedIds = new Set(preserved.map((event) => String(event.eventId)));
      const preservedTargets = new Set(preserved.flatMap(eventTargetKeys));
      const replacement = future.filter((event) => Number(event.centerTimestampMs) >= playbackPositionMs && !preservedIds.has(String(event.eventId)) && eventTargetKeys(event).every((key) => !preservedTargets.has(key)));
      resolvedEvents = Object.freeze([...preserved, ...replacement].sort((left, right) => Number(left.centerTimestampMs) - Number(right.centerTimestampMs) || compareCodePoints(String(left.eventId), String(right.eventId))));
      selectedVariant = target;
      publish();
      return target;
    },
    /** @param {{state: "idle" | "running" | "paused" | "stopped", positionMs: number, judgedEventIds?: readonly string[], activeEventIds?: readonly string[]}} state */
    setPlaybackState(state) {
      assertReady();
      const narrowed = normalizePlaybackState(state);
      const nextJudgedEventIds = new Set(narrowed.judgedEventIds); const nextActiveEventIds = new Set(narrowed.activeEventIds);
      if (playbackState === narrowed.state && playbackPositionMs === narrowed.positionMs && equalStringSets(judgedEventIds, nextJudgedEventIds) && equalStringSets(activeEventIds, nextActiveEventIds)) return;
      playbackState = narrowed.state; playbackPositionMs = narrowed.positionMs;
      judgedEventIds = nextJudgedEventIds; activeEventIds = nextActiveEventIds;
      publish();
    },
    /** @param {string} path */
    readAsset(path) {
      assertReady();
      const normalized = normalizeAssetPath(path);
      const asset = assets.find((entry) => entry.path.toLowerCase() === normalized.toLowerCase());
      if (!asset?.bytes) throw dataError("asset_not_found", "Verified asset is unavailable");
      return Uint8Array.from(asset.bytes);
    },
    getSnapshot() { return snapshot; },
    getCapabilities() { return aeroContentRuntimeCapabilities; },
    /** @param {(value: typeof snapshot) => void} listener */
    subscribe(listener) {
      assertOpen(); if (typeof listener !== "function") throw dataError("listener_invalid", "Listener must be a function");
      listeners.add(listener); notify(listener); return () => listeners.delete(listener);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; generation += 1; activeAbort.abort(); clearLoaded(); sourceSnapshot = null; reloadLoader = null; reloadOptions = {}; listeners.clear();
      snapshot = makeSnapshot("destroyed", Object.freeze({ code: "service_destroyed", message: "Content runtime is destroyed" }));
    }
  });
  return service;

  /** @param {() => Promise<unknown>} loader @param {DataRecord} publicSource @param {RuntimeLoadOptions} loadOptions */
  async function startLoad(loader, publicSource, loadOptions) {
    assertOpen();
    activeAbort.abort(); activeAbort = new AbortController(); const localAbort = activeAbort; const localGeneration = ++generation;
    const externalAbort = () => localAbort.abort(); loadOptions.signal?.addEventListener("abort", externalAbort, { once: true });
    clearLoaded(); reloadLoader = null; reloadOptions = {}; sourceSnapshot = publicSource; snapshot = makeSnapshot("loading", null); notifyAll();
    try {
      const raw = await raceAbort(loader(), localAbort.signal); checkCurrent(localGeneration, localAbort.signal);
      if (!isPlainDataRecord(raw)) throw dataError("content_source_invalid", "Content source loader returned an invalid record");
      const packageValue = raw.package;
      const packageAudio = audioDeclaration(packageValue);
      let declarations = Array.isArray(raw.assets) ? raw.assets.map((entry) => enrichAssetHash(entry, packageAudio)) : [];
      const songSuggestion = presentationSuggestion(packageValue);
      const suggestedBackground = backgroundFromSuggestion(songSuggestion);
      if (suggestedBackground?.url && !declarations.some((entry) => isPlainDataRecord(entry) && entry.url === suggestedBackground.url)) declarations.push({ path: pathFromUrl(suggestedBackground.url), kind: "background", url: suggestedBackground.url, hash: suggestedBackground.hash, critical: false });
      const packageResult = await validateRuntimePackage(packageValue, { declaredPackageHash: raw.packageHash ?? null, supportedRulesetIds: runtimeOptions.supportedRulesetIds, supportedRecipeIds: runtimeOptions.supportedRecipeIds });
      checkCurrent(localGeneration, localAbort.signal);
      const loadedAssets = await loadPackageAssets(declarations, { fetch: runtimeOptions.fetch, baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : loadOptions.baseUrl, signal: localAbort.signal, timeoutMs: runtimeOptions.timeoutMs, maximumAssetBytes: runtimeOptions.maximumAssetBytes });
      checkCurrent(localGeneration, localAbort.signal);
      verifyPackageAudio(packageResult.song, loadedAssets);
      loadedPackage = packageResult.package; loadedBpm = packageResult.bpm; packageId = packageResult.packageId; packageHash = packageResult.packageHash; contentLineage = packageResult.source; assets = loadedAssets;
      variantById = new Map(packageResult.variants.map((variant) => [variant.variantId, variant])); composedVariants.clear();
      selectedVariant = packageResult.variants.find((variant) => variant.mode === "flow") ?? packageResult.variants[0] ?? null;
      resolvedEvents = selectedVariant ? timelineFor(selectedVariant, loadedBpm) : Object.freeze([]);
      playbackState = "idle"; playbackPositionMs = 0; judgedEventIds.clear(); activeEventIds.clear();
      themeSnapshot = resolveTheme(songSuggestion, loadOptions);
      backgroundSnapshot = resolveBackground(songSuggestion, loadOptions, loadedAssets);
      reloadLoader = loader;
      reloadOptions = { ...loadOptions, signal: undefined };
      snapshot = makeSnapshot("ready", null); notifyAll();
      return snapshot;
    } catch (cause) {
      if (localGeneration !== generation || localAbort.signal.aborted) throw dataError("operation_aborted", "Content load was cancelled");
      clearLoaded(); const failure = publicError(cause); snapshot = makeSnapshot("error", failure); notifyAll(); throw cause;
    } finally { loadOptions.signal?.removeEventListener("abort", externalAbort); }
  }

  /** @param {string} variantId @param {readonly string[]} modifiers */
  async function resolveVariant(variantId, modifiers) {
    const base = variantById.get(variantId);
    if (!base) throw dataError("variant_not_found", "Content variant was not found");
    const key = `${variantId}|${[...modifiers].sort().join(",")}`;
    const cached = composedVariants.get(key); if (cached) return cached;
    const composed = await composeRuntimeVariant(base, modifiers, String(packageId)); composedVariants.set(key, composed); return composed;
  }
  function clearLoaded() { assets = []; variantById.clear(); composedVariants.clear(); selectedVariant = null; resolvedEvents = Object.freeze([]); loadedPackage = null; packageId = null; packageHash = null; contentLineage = null; themeSnapshot = null; backgroundSnapshot = fallbackBackground(); playbackState = "idle"; playbackPositionMs = 0; judgedEventIds.clear(); activeEventIds.clear(); }
  function publish() { snapshot = makeSnapshot("ready", null); notifyAll(); }
  function notifyAll() { for (const listener of [...listeners]) notify(listener); }
  /** @param {(value: typeof snapshot) => void} listener */
  function notify(listener) { try { listener(snapshot); } catch (error) { try { runtimeOptions.onListenerError?.(error); } catch { /* listener diagnostics cannot break content */ } } }
  function assertOpen() { if (destroyed) throw dataError("service_destroyed", "Content runtime is destroyed"); }
  function assertReady() { assertOpen(); if (!loadedPackage || snapshot.state !== "ready") throw dataError("content_not_ready", "Content is not ready"); }
  /** @param {number} currentGeneration @param {AbortSignal} signal */
  function checkCurrent(currentGeneration, signal) { if (destroyed || currentGeneration !== generation || signal.aborted) throw dataError("operation_aborted", "Content load was cancelled"); }
  /** @param {"idle" | "loading" | "ready" | "error" | "destroyed"} state @param {Readonly<{code: string, message: string}> | null} error */
  function makeSnapshot(state, error) {
    return Object.freeze({
      schema: "aerobeat/content_runtime_snapshot", version: 1, serviceId: serviceIds.contentLibrary, state, generation,
      source: sourceSnapshot, lineage: contentLineage, packageId, packageHash, song: loadedPackage?.song ?? null,
      variants: Object.freeze([...variantById.values()].map(publicVariant)), selectedVariant: selectedVariant ? publicVariant(selectedVariant) : null,
      resolvedEvents, playback: Object.freeze({ state: playbackState, positionMs: playbackPositionMs, judgedEventIds: Object.freeze([...judgedEventIds]), activeEventIds: Object.freeze([...activeEventIds]) }),
      assets: publicAssetSnapshots(assets), theme: themeSnapshot, background: backgroundSnapshot,
      capabilities: aeroContentRuntimeCapabilities, error
    });
  }

  /** @param {string} url @param {AbortSignal} signal */
  async function fetchPackageJson(url, signal) {
    const fetchFunction = runtimeOptions.fetch ?? globalThis.fetch;
    if (!fetchFunction) throw dataError("fetch_unavailable", "Fetch is unavailable");
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    let timeoutId;
    try {
      const request = Promise.resolve().then(() => fetchFunction(url, { mode: "cors", credentials: "omit", redirect: "follow", signal: controller.signal }));
      const timeoutFailure = new Promise((_, reject) => { timeoutId = setTimeout(() => { controller.abort(); reject(dataError("fetch_timeout", "External package request timed out")); }, runtimeOptions.timeoutMs); });
      const response = /** @type {Response} */ (await Promise.race([raceAbort(request, controller.signal), timeoutFailure]));
      if (!response.ok) throw dataError("package_http_failed", `External package returned HTTP ${response.status}`);
      if (response.url) normalizeExternalUrl(response.url);
      const declared = response.headers?.get?.("content-length");
      if (declared !== null && declared !== undefined && declared !== "") {
        if (!/^(0|[1-9][0-9]*)$/u.test(declared) || !Number.isSafeInteger(Number(declared))) throw dataError("package_length_invalid", "External package Content-Length is invalid");
        if (Number(declared) > runtimeOptions.maximumPackageBytes) throw dataError("package_too_large", "External package exceeds the byte limit");
      }
      const text = /** @type {string} */ (await raceAbort(response.text(), controller.signal));
      if (new TextEncoder().encode(text).byteLength > runtimeOptions.maximumPackageBytes) throw dataError("package_too_large", "External package exceeds the byte limit");
      try { return JSON.parse(text); } catch { throw dataError("package_json_invalid", "External package response is not valid JSON"); }
    } catch (cause) {
      if (signal.aborted) throw dataError("operation_aborted", "Content load was cancelled");
      if (cause && typeof cause === "object" && "code" in cause) throw cause;
      throw dataError("cors_unreadable", diagnosticString(cause, "message") ?? "External package was not CORS-readable");
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", abort);
    }
  }
}

/** @typedef {{signal?: AbortSignal, assets?: readonly unknown[], assetHashes?: Readonly<Record<string, unknown>>, packageHash?: unknown, baseUrl?: string, defaultTheme?: unknown, playlistTheme?: unknown, athleteTheme?: unknown, hostTheme?: unknown, defaultBackground?: unknown, playlistBackground?: unknown, athleteBackground?: unknown, hostBackground?: unknown}} RuntimeLoadOptions */

/** @param {unknown} value */
function normalizeRuntimeConfiguration(value) {
  if (!isPlainDataRecord(value)) throw dataError("runtime_options_invalid", "Runtime options must be a plain data record");
  const fetchValue = dataProperty(value, "fetch");
  const listenerError = dataProperty(value, "onListenerError");
  const resolverValue = dataProperty(value, "persistenceResolver");
  if (fetchValue !== undefined && typeof fetchValue !== "function") throw dataError("runtime_fetch_invalid", "Injected fetch must be a function");
  if (listenerError !== undefined && typeof listenerError !== "function") throw dataError("runtime_listener_invalid", "Listener error handler must be a function");
  const supportedRulesetIds = normalizeOptionalStringArray(dataProperty(value, "supportedRulesetIds"), 16, "runtime_rulesets_invalid");
  const supportedRecipeIds = normalizeOptionalStringArray(dataProperty(value, "supportedRecipeIds"), 16, "runtime_recipes_invalid");
  return Object.freeze({
    fetch: /** @type {typeof globalThis.fetch | undefined} */ (fetchValue),
    onListenerError: /** @type {((error: unknown) => void) | undefined} */ (listenerError),
    persistenceResolver: normalizePersistenceResolver(resolverValue),
    supportedRulesetIds,
    supportedRecipeIds,
    timeoutMs: positiveSafeInteger(dataProperty(value, "timeoutMs"), 15_000, "runtime_timeout_invalid"),
    maximumPackageBytes: positiveSafeInteger(dataProperty(value, "maximumPackageBytes"), 16 * 1024 * 1024, "runtime_package_limit_invalid"),
    maximumAssetBytes: positiveSafeInteger(dataProperty(value, "maximumAssetBytes"), 128 * 1024 * 1024, "runtime_asset_limit_invalid")
  });
}
/** @param {unknown} value */
function normalizePersistenceResolver(value) {
  if (value === undefined) return undefined;
  if (!isPlainDataRecord(value)) throw dataError("persistence_resolver_invalid", "Persistence resolver must be a plain record");
  const loadPackage = dataProperty(value, "loadPackage"); const readAsset = dataProperty(value, "readAsset"); const exportPackage = dataProperty(value, "exportPackage");
  if ([loadPackage, readAsset, exportPackage].some((entry) => entry !== undefined && typeof entry !== "function")) throw dataError("persistence_resolver_invalid", "Persistence resolver operations must be functions");
  return Object.freeze({ loadPackage: /** @type {((handle: DataRecord) => Promise<unknown>) | undefined} */ (loadPackage), readAsset: /** @type {((handle: DataRecord, path: string) => Promise<Uint8Array>) | undefined} */ (readAsset), exportPackage: /** @type {((handle: DataRecord) => Promise<unknown>) | undefined} */ (exportPackage) });
}
/** @param {unknown} value @returns {RuntimeLoadOptions} */
function normalizeLoadOptions(value) {
  if (!isPlainDataRecord(value)) throw dataError("load_options_invalid", "Load options must be a plain data record");
  const signal = dataProperty(value, "signal");
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw dataError("abort_signal_invalid", "Load signal must be an AbortSignal");
  const assets = dataProperty(value, "assets"); if (assets !== undefined && !Array.isArray(assets)) throw dataError("assets_invalid", "Load assets must be an array");
  const hashes = dataProperty(value, "assetHashes");
  if (hashes !== undefined && !isPlainDataRecord(hashes)) throw dataError("asset_hashes_invalid", "Asset hashes must be a plain record");
  const baseUrl = dataProperty(value, "baseUrl"); if (baseUrl !== undefined && typeof baseUrl !== "string") throw dataError("base_url_invalid", "Base URL must be a string");
  const result = Object.create(null);
  for (const key of ["packageHash", "defaultTheme", "playlistTheme", "athleteTheme", "hostTheme", "defaultBackground", "playlistBackground", "athleteBackground", "hostBackground"]) result[key] = dataProperty(value, key);
  Object.assign(result, { signal, assets, assetHashes: hashes, baseUrl });
  return Object.freeze(result);
}
/** @param {unknown} value */
function normalizeModifierSelection(value) { if (!isPlainDataRecord(value)) throw dataError("selection_invalid", "Variant selection must be a plain record"); return normalizeOptionalStringArray(dataProperty(value, "modifierIds"), 7, "modifiers_invalid") ?? Object.freeze([]); }
/** @param {unknown} value */
function normalizePlaybackState(value) {
  if (!isPlainDataRecord(value)) throw dataError("playback_state_invalid", "Playback state must be a plain record");
  const state = dataProperty(value, "state"); const positionMs = dataProperty(value, "positionMs");
  if (typeof state !== "string" || !["idle", "running", "paused", "stopped"].includes(state) || typeof positionMs !== "number" || !Number.isFinite(positionMs) || positionMs < 0) throw dataError("playback_state_invalid", "Playback state is invalid");
  return Object.freeze({ state: /** @type {"idle" | "running" | "paused" | "stopped"} */ (state), positionMs, judgedEventIds: normalizeOptionalStringArray(dataProperty(value, "judgedEventIds"), 100_000, "event_ids_invalid") ?? Object.freeze([]), activeEventIds: normalizeOptionalStringArray(dataProperty(value, "activeEventIds"), 100_000, "event_ids_invalid") ?? Object.freeze([]) });
}
/** @param {Set<string>} left @param {Set<string>} right */
function equalStringSets(left, right) { return left.size === right.size && [...left].every((value) => right.has(value)); }
/** @param {unknown} value @param {number} maximum @param {string} code */
function normalizeOptionalStringArray(value, maximum, code) { if (value === undefined) return undefined; if (!Array.isArray(value) || value.length > maximum || value.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 512)) throw dataError(code, "Expected a bounded string array"); return Object.freeze([...new Set(value)]); }
/** @param {unknown} value @param {string} code @param {number} maximum */
function requireBoundedString(value, code, maximum) { if (typeof value !== "string" || value.length === 0 || value.length > maximum) throw dataError(code, "Expected a bounded string"); return value; }
/** @param {unknown} value @param {number} fallback @param {string} code */
function positiveSafeInteger(value, fallback, code) { if (value === undefined) return fallback; if (!Number.isSafeInteger(value) || Number(value) <= 0) throw dataError(code, "Expected a positive safe integer"); return Number(value); }
/** @param {unknown} value */
function normalizePathList(value) { if (!Array.isArray(value) || value.length > 2048) throw dataError("persistence_paths_invalid", "Persistence asset paths must be a bounded array"); const paths = value.map((entry) => normalizeAssetPath(entry)); if (new Set(paths.map((entry) => entry.toLowerCase())).size !== paths.length) throw dataError("asset_duplicate", "Persistence asset paths must be unique"); return paths; }
/** @param {Promise<unknown>} promise @param {AbortSignal} signal */
async function raceAbort(promise, signal) { if (signal.aborted) throw dataError("operation_aborted", "Content load was cancelled"); return new Promise((resolve, reject) => { const aborted = () => { cleanup(); reject(dataError("operation_aborted", "Content load was cancelled")); }; const cleanup = () => signal.removeEventListener("abort", aborted); signal.addEventListener("abort", aborted, { once: true }); promise.then((value) => { cleanup(); resolve(value); }, (cause) => { cleanup(); reject(cause); }); }); }

/** @param {RuntimeVariant} variant */
function publicVariant(variant) { return Object.freeze({ variantId: variant.variantId, chartId: variant.chartId, mode: variant.mode, rulesetId: variant.rulesetId, recipeId: variant.recipeId, modifierIds: variant.modifierIds, ranked: variant.ranked, localOnly: variant.localOnly, mapHash: variant.mapHash, scoreIdentityHash: variant.scoreIdentityHash, provenance: variant.provenance }); }
/** @param {RuntimeVariant} variant @param {number} bpm @returns {readonly DataRecord[]} */
function timelineFor(variant, bpm) {
  const beats = Array.isArray(variant.chart.beats) ? variant.chart.beats : [];
  return Object.freeze(beats.map((beatValue, index) => {
    const beat = /** @type {DataRecord} */ (beatValue);
    for (const forbidden of ["centerTimestampMs", "intervalStartTimestampMs", "intervalEndTimestampMs", "endTimestampMs"]) if (Object.hasOwn(beat, forbidden)) throw dataError("resolved_event_shadow_invalid", `Authored beat cannot own resolved field ${forbidden}`);
    const eventId = typeof beat.eventId === "string" ? beat.eventId : `${variant.chartId}:event:${index}`;
    const centerTimestampMs = Number(beat.start) * 60_000 / bpm;
    const intervalEndTimestampMs = Object.hasOwn(beat, "end") ? Number(beat.end) * 60_000 / bpm : undefined;
    return Object.freeze({
      schema: "aerobeat/resolved_content_event", version: 3, eventId, variantId: variant.variantId, chartId: variant.chartId, centerTimestampMs,
      ...(intervalEndTimestampMs === undefined ? {} : { intervalStartTimestampMs: centerTimestampMs, intervalEndTimestampMs }),
      authoredBeat: beat
    });
  }).sort((left, right) => left.centerTimestampMs - right.centerTimestampMs || compareCodePoints(left.eventId, right.eventId)));
}
/** @param {DataRecord} event @returns {string[]} */
function eventTargetKeys(event) { const beat = isPlainDataRecord(event.authoredBeat) ? event.authoredBeat : null; const lineage = beat && Array.isArray(beat.sourceEventIds) ? beat.sourceEventIds.filter((entry) => typeof entry === "string").map((entry) => `source:${entry}`) : []; return lineage.length > 0 ? lineage : [`target:${String(event.centerTimestampMs)}:${String(beat?.type ?? "")}`]; }
/** @param {readonly string[]} values */
function stringSet(values) { if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) throw dataError("event_ids_invalid", "Event IDs must be strings"); return new Set(values); }
/** @param {unknown} value */
function extractExportBytes(value) { if (value instanceof Uint8Array) return Uint8Array.from(value); if (isPlainDataRecord(value) && value.bytes instanceof Uint8Array) return Uint8Array.from(value.bytes); throw dataError("aeropkg_export_invalid", "Persistence export did not provide AEROPKG1 bytes"); }
/** @param {unknown} packageValue */
function audioDeclaration(packageValue) { if (!isPlainDataRecord(packageValue) || !isPlainDataRecord(packageValue.song) || !isPlainDataRecord(packageValue.song.audio)) return null; const audio = packageValue.song.audio; return typeof audio.filePath === "string" && typeof audio.contentHash === "string" ? { path: audio.filePath, hash: audio.contentHash } : null; }
/** @param {unknown} entry @param {{path: string, hash: string} | null} audio */
function enrichAssetHash(entry, audio) { if (!isPlainDataRecord(entry)) return entry; if (audio && typeof entry.path === "string" && entry.path.toLowerCase() === audio.path.toLowerCase() && !entry.hash) return { ...entry, kind: "audio", hash: audio.hash }; return entry; }
/** @param {DataRecord} song @param {readonly LoadedAsset[]} loadedAssets */
function verifyPackageAudio(song, loadedAssets) { if (!isPlainDataRecord(song.audio) || typeof song.audio.filePath !== "string" || typeof song.audio.contentHash !== "string") throw dataError("audio_declaration_missing", "Song package must declare a hashed audio asset"); const path = normalizeAssetPath(song.audio.filePath); const expected = song.audio.contentHash; const asset = loadedAssets.find((entry) => entry.path.toLowerCase() === path.toLowerCase()); if (!asset || `sha256:${asset.hash}` !== expected || asset.status !== "ready") throw dataError("audio_declaration_mismatch", "Verified audio does not match the song declaration"); }
/** @param {unknown} packageValue */
function presentationSuggestion(packageValue) { if (!isPlainDataRecord(packageValue)) return null; return isPlainDataRecord(packageValue.presentationSuggestion) ? packageValue.presentationSuggestion : null; }
/** @param {DataRecord | null} suggestion */
function backgroundFromSuggestion(suggestion) { if (!suggestion) return null; if (isBackgroundSuggestion(suggestion.background)) return suggestion.background; if (isBackgroundSuggestion(suggestion)) return suggestion; return null; }
/** @param {DataRecord | null} suggestion @param {RuntimeLoadOptions} options */
function resolveTheme(suggestion, options) { const songTheme = suggestion && isThemeDescriptor(suggestion.theme) ? suggestion.theme : null; const candidates = [options.defaultTheme, options.playlistTheme, songTheme, options.athleteTheme, options.hostTheme]; let selected = null; for (const candidate of candidates) if (isThemeDescriptor(candidate)) selected = cloneFrozenData(candidate); return selected; }
/** @param {DataRecord | null} suggestion @param {RuntimeLoadOptions} options @param {readonly LoadedAsset[]} loadedAssets */
function resolveBackground(suggestion, options, loadedAssets) { const songBackground = backgroundFromSuggestion(suggestion); const candidates = [{ value: options.defaultBackground, packageOwned: false }, { value: options.playlistBackground, packageOwned: false }, { value: songBackground, packageOwned: true }, { value: options.athleteBackground, packageOwned: false }, { value: options.hostBackground, packageOwned: false }]; let selected = fallbackBackground(); let packageOwned = false; for (const candidate of candidates) if (isBackgroundSuggestion(candidate.value)) { selected = /** @type {DataRecord} */ (cloneFrozenData(candidate.value)); packageOwned = candidate.packageOwned; } if (packageOwned && (selected.kind === "image" || selected.kind === "video") && selected.url) { const matching = loadedAssets.find((entry) => entry.url === selected.url || entry.path === pathFromUrl(String(selected.url))); if (!matching || matching.status === "fallback") return Object.freeze({ ...fallbackBackground(), degradedFrom: selected, degradationReason: matching?.errorCode ?? "background_unreadable" }); } return selected; }
function fallbackBackground() { return Object.freeze({ schema: "aerobeat/background_suggestion", version: 1, source: backgroundSuggestionPrecedence[0], kind: "css", url: null, hash: null, themeId: null }); }
/** @param {string} value */
function normalizeExternalUrl(value) { if (typeof value !== "string") throw dataError("package_url_invalid", "Package URL must be a string"); let url; try { url = new URL(value); } catch { throw dataError("package_url_invalid", "Package URL is invalid"); } if (url.protocol !== "https:" && !(url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost"))) throw dataError("package_url_insecure", "External packages require HTTPS or localhost HTTP"); return url.href; }
/** @param {string} url */
function pathFromUrl(url) { try { const path = new URL(url, "https://aerobeat.invalid/").pathname.split("/").filter(Boolean).at(-1); return path || "background.asset"; } catch { return "background.asset"; } }
/** @param {unknown} cause */
function publicError(cause) { return Object.freeze({ code: diagnosticString(cause, "code") ?? "content_load_failed", message: diagnosticString(cause, "message") ?? "Content load failed" }); }
