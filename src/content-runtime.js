// @ts-check

import {
  backgroundSuggestionPrecedence,
  isBackgroundSuggestion,
  isPersistenceHandle,
  isThemeDescriptor,
  serviceIds
} from "@aerobeat/web-contracts";
import { loadPackageAssets, parseAeroPackage, publicAssetSnapshots } from "./assets.js";
import { composeRuntimeVariant, validateRuntimePackage } from "./package-content.js";
import { cloneFrozenData, dataError, isPlainDataRecord } from "./runtime-data.js";

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
      const wrapper = isPlainDataRecord(input) && Object.hasOwn(input, "package") ? input : { package: input, assets: loadOptions.assets ?? [] };
      const loader = async () => ({ package: wrapper.package, packageHash: wrapper.packageHash ?? loadOptions.packageHash ?? null, assets: wrapper.assets ?? loadOptions.assets ?? [], baseUrl: loadOptions.baseUrl });
      return startLoad(loader, Object.freeze({ kind: "direct", id: "direct-package" }), loadOptions);
    },
    /**
     * Load a CORS-readable external package JSON URL.
     *
     * @param {string} url
     * @param {RuntimeLoadOptions} [loadOptions]
     */
    loadExternalPackage(url, loadOptions = {}) {
      assertOpen();
      const normalizedUrl = normalizeExternalUrl(url);
      const loader = async () => {
        const response = await fetchResponse(normalizedUrl, activeAbort.signal);
        let value;
        try { value = await response.json(); } catch { throw dataError("package_json_invalid", "External package response is not valid JSON"); }
        const wrapper = isPlainDataRecord(value) && Object.hasOwn(value, "package") ? value : { package: value, assets: loadOptions.assets ?? [] };
        return { package: wrapper.package, packageHash: wrapper.packageHash ?? loadOptions.packageHash ?? null, assets: wrapper.assets ?? loadOptions.assets ?? [], baseUrl: normalizedUrl };
      };
      return startLoad(loader, Object.freeze({ kind: "external_url", id: normalizedUrl }), loadOptions);
    },
    /**
     * Resolve an authored persistence handle through the injected public resolver.
     *
     * @param {unknown} handleValue
     * @param {RuntimeLoadOptions} [loadOptions]
     */
    loadPersistenceHandle(handleValue, loadOptions = {}) {
      assertOpen();
      if (!isPersistenceHandle(handleValue)) throw dataError("persistence_handle_invalid", "Persistence handle does not satisfy the public contract");
      const handle = /** @type {DataRecord} */ (cloneFrozenData(handleValue));
      const resolver = options.persistenceResolver;
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
        const paths = Array.isArray(loaded.assetPaths) ? loaded.assetPaths : [];
        const declarations = loadOptions.assetHashes ?? {};
        const loadedAssets = [];
        for (const pathValue of paths) {
          const path = String(pathValue);
          loadedAssets.push({ path, hash: isPlainDataRecord(declarations) ? declarations[path] : undefined, bytes: await resolver.readAsset(handle, path) });
        }
        return { package: loaded.package, packageHash: handle.packageHash, assets: loadedAssets, baseUrl: undefined };
      };
      return startLoad(loader, Object.freeze({ kind: "persistence_handle", id: `${handle.namespace}:${handle.key}`, handle }), loadOptions);
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
      const target = await resolveVariant(variantId, selection.modifierIds ?? []);
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
      const target = await resolveVariant(variantId, selection.modifierIds ?? []);
      const future = timelineFor(target, loadedBpm);
      const preserved = resolvedEvents.filter((event) => Number(event.centerTimestampMs) < playbackPositionMs || judgedEventIds.has(String(event.eventId)) || activeEventIds.has(String(event.eventId)));
      const preservedIds = new Set(preserved.map((event) => String(event.eventId)));
      const preservedTargets = new Set(preserved.flatMap(eventTargetKeys));
      const replacement = future.filter((event) => Number(event.centerTimestampMs) >= playbackPositionMs && !preservedIds.has(String(event.eventId)) && eventTargetKeys(event).every((key) => !preservedTargets.has(key)));
      resolvedEvents = Object.freeze([...preserved, ...replacement].sort((left, right) => Number(left.centerTimestampMs) - Number(right.centerTimestampMs) || String(left.eventId).localeCompare(String(right.eventId))));
      selectedVariant = target;
      publish();
      return target;
    },
    /** @param {{state: "idle" | "running" | "paused" | "stopped", positionMs: number, judgedEventIds?: readonly string[], activeEventIds?: readonly string[]}} state */
    setPlaybackState(state) {
      assertReady();
      if (!["idle", "running", "paused", "stopped"].includes(state.state) || !Number.isFinite(state.positionMs) || state.positionMs < 0) throw dataError("playback_state_invalid", "Playback state is invalid");
      playbackState = state.state; playbackPositionMs = state.positionMs;
      judgedEventIds = stringSet(state.judgedEventIds ?? []); activeEventIds = stringSet(state.activeEventIds ?? []);
      publish();
    },
    /** @param {string} path */
    readAsset(path) {
      assertReady();
      const normalized = path.replaceAll("\\", "/");
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
      const raw = await loader(); checkCurrent(localGeneration, localAbort.signal);
      if (!isPlainDataRecord(raw)) throw dataError("content_source_invalid", "Content source loader returned an invalid record");
      const packageValue = raw.package;
      const packageAudio = audioDeclaration(packageValue);
      let declarations = Array.isArray(raw.assets) ? raw.assets.map((entry) => enrichAssetHash(entry, packageAudio)) : [];
      const songSuggestion = presentationSuggestion(packageValue);
      const suggestedBackground = backgroundFromSuggestion(songSuggestion);
      if (suggestedBackground?.url && !declarations.some((entry) => isPlainDataRecord(entry) && entry.url === suggestedBackground.url)) declarations.push({ path: pathFromUrl(suggestedBackground.url), kind: "background", url: suggestedBackground.url, hash: suggestedBackground.hash, critical: false });
      const packageResult = await validateRuntimePackage(packageValue, { declaredPackageHash: raw.packageHash ?? null, supportedRulesetIds: options.supportedRulesetIds, supportedRecipeIds: options.supportedRecipeIds });
      checkCurrent(localGeneration, localAbort.signal);
      const loadedAssets = await loadPackageAssets(declarations, { fetch: options.fetch, baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : loadOptions.baseUrl, signal: localAbort.signal });
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
  function notify(listener) { try { listener(snapshot); } catch (error) { try { options.onListenerError?.(error); } catch { /* listener diagnostics cannot break content */ } } }
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

  /** @param {string} url */
  async function fetchResponse(url, signal) { const fetchFunction = options.fetch ?? globalThis.fetch; if (!fetchFunction) throw dataError("fetch_unavailable", "Fetch is unavailable"); try { const response = await fetchFunction(url, { mode: "cors", credentials: "omit", signal }); if (!response.ok) throw dataError("package_http_failed", `External package returned HTTP ${response.status}`); if (response.url) normalizeExternalUrl(response.url); return response; } catch (cause) { if (signal.aborted) throw dataError("operation_aborted", "Content load was cancelled"); if (cause && typeof cause === "object" && "code" in cause) throw cause; throw dataError("cors_unreadable", cause instanceof Error ? cause.message : "External package was not CORS-readable"); } }
}

/** @typedef {{signal?: AbortSignal, assets?: readonly unknown[], assetHashes?: Readonly<Record<string, unknown>>, packageHash?: unknown, baseUrl?: string, defaultTheme?: unknown, playlistTheme?: unknown, athleteTheme?: unknown, hostTheme?: unknown, defaultBackground?: unknown, playlistBackground?: unknown, athleteBackground?: unknown, hostBackground?: unknown}} RuntimeLoadOptions */

/** @param {RuntimeVariant} variant */
function publicVariant(variant) { return Object.freeze({ variantId: variant.variantId, chartId: variant.chartId, mode: variant.mode, rulesetId: variant.rulesetId, recipeId: variant.recipeId, modifierIds: variant.modifierIds, ranked: variant.ranked, mapHash: variant.mapHash, scoreIdentityHash: variant.scoreIdentityHash, provenance: variant.provenance }); }
/** @param {RuntimeVariant} variant @param {number} bpm @returns {readonly DataRecord[]} */
function timelineFor(variant, bpm) { const beats = Array.isArray(variant.chart.beats) ? variant.chart.beats : []; return Object.freeze(beats.map((beatValue, index) => { const beat = /** @type {DataRecord} */ (beatValue); const eventId = typeof beat.eventId === "string" ? beat.eventId : `${variant.chartId}:event:${index}`; return Object.freeze({ schema: "aerobeat/resolved_content_event", version: 1, eventId, variantId: variant.variantId, chartId: variant.chartId, centerTimestampMs: Number(beat.start) * 60_000 / bpm, authoredBeat: beat }); }).sort((left, right) => left.centerTimestampMs - right.centerTimestampMs || left.eventId.localeCompare(right.eventId))); }
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
function verifyPackageAudio(song, loadedAssets) { if (!isPlainDataRecord(song.audio)) throw dataError("audio_declaration_missing", "Song package must declare a hashed audio asset"); const path = String(song.audio.filePath ?? ""); const expected = String(song.audio.contentHash ?? ""); const asset = loadedAssets.find((entry) => entry.path.toLowerCase() === path.toLowerCase()); if (!asset || `sha256:${asset.hash}` !== expected || asset.status !== "ready") throw dataError("audio_declaration_mismatch", "Verified audio does not match the song declaration"); }
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
function publicError(cause) { const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : "content_load_failed"; return Object.freeze({ code, message: cause instanceof Error ? cause.message : "Content load failed" }); }
