// @ts-check

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  aeroContentRuntimeCapabilities,
  aeroContentRuntimeDescriptor,
  aeroContentServiceId,
  createAeroContentRuntime,
  validateRuntimePackage
} from "../src/index.js";

const audioBytes = new TextEncoder().encode("deterministic-audio-fixture");
const audioHash = hashBytes(audioBytes);
const basePackage = await makePackage(audioHash);
const packageHash = hashJson(basePackage);

assert.equal(aeroContentServiceId, "aero.content.library");
assert.equal(aeroContentRuntimeDescriptor.implementationState, "implemented");
assert.equal(aeroContentRuntimeCapabilities.playlistAllowlistRequired, false);
assert.equal((await validateRuntimePackage(basePackage)).variants.length, 5);

const runtime = createAeroContentRuntime({ onListenerError() { throw new Error("listener error callback should be isolated too"); } });
let listenerCalls = 0;
runtime.subscribe(() => { listenerCalls += 1; throw new Error("expected isolated listener failure"); });
await runtime.loadPackage({ package: basePackage, packageHash: `sha256:${packageHash}`, assets: [{ path: "song.ogg", bytes: audioBytes }] });
let snapshot = runtime.getSnapshot();
assert.equal(snapshot.state, "ready");
assert.equal(snapshot.variants.length, 5);
assert.equal(snapshot.assets[0].readable, true);
assert.equal(snapshot.lineage.sourceId, "not-an-allowlist-id");
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.variants), true);
assert.equal(JSON.stringify(snapshot).includes("deterministic-audio-fixture"), false);
assert.deepEqual(runtime.readAsset("SONG.OGG"), audioBytes);
assert.ok(listenerCalls >= 2);

const boxing = snapshot.variants.find((variant) => variant.rulesetId === "boxing_semantic_track_v1" && variant.recipeId === "row_family_balanced_height_v1");
assert.ok(boxing);
await runtime.selectVariant(boxing.variantId, { modifierIds: ["no_squats", "crossed_guard", "cross_body"] });
snapshot = runtime.getSnapshot();
assert.equal(snapshot.selectedVariant.ranked, false);
assert.equal(snapshot.selectedVariant.provenance.kind, "runtime_composite");
assert.deepEqual(snapshot.selectedVariant.modifierIds, ["cross_body", "crossed_guard", "no_squats"]);
assert.equal(snapshot.resolvedEvents.some((event) => event.authoredBeat.type === "squat"), false);
const crossed = snapshot.resolvedEvents.find((event) => event.authoredBeat.type === "guard");
assert.equal(crossed.authoredBeat.guardTarget.crossed, true);
assert.deepEqual(crossed.authoredBeat.sourceEventIds, ["source-guard"]);
const emittedPackage = structuredClone(basePackage);
emittedPackage.charts[0].prototype.modifiers = ["crossed_guard"];
const emittedRuntime = createAeroContentRuntime();
await emittedRuntime.loadPackage({ package: emittedPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
await emittedRuntime.selectVariant(emittedPackage.charts[0].chartId, { modifierIds: ["no_squats"] });
assert.deepEqual(emittedRuntime.getSnapshot().selectedVariant.modifierIds, ["crossed_guard", "no_squats"]);

const oldEvents = snapshot.resolvedEvents;
runtime.setPlaybackState({ state: "paused", positionMs: 1250, judgedEventIds: [oldEvents[0].eventId], activeEventIds: [oldEvents[2].eventId] });
const cut = runtime.getSnapshot().variants.find((variant) => variant.rulesetId === "boxing_semantic_track_v1" && variant.recipeId === "cut_family_source_height_v1");
assert.ok(cut);
await runtime.swapFutureVariant(cut.variantId, { modifierIds: ["any_punch"] });
snapshot = runtime.getSnapshot();
assert.equal(snapshot.selectedVariant.recipeId, "cut_family_source_height_v1");
assert.equal(snapshot.selectedVariant.ranked, false);
assert.equal(snapshot.resolvedEvents.includes(oldEvents[0]), true);
assert.equal(snapshot.resolvedEvents.includes(oldEvents[1]), false);
assert.equal(snapshot.resolvedEvents.includes(oldEvents[2]), true);
assert.equal(snapshot.resolvedEvents.some((event) => event.variantId === snapshot.selectedVariant.variantId), true);
runtime.setPlaybackState({ state: "running", positionMs: 1250 });
await assert.rejects(() => runtime.swapFutureVariant(boxing.variantId), hasCode("variant_swap_not_paused"));
await assert.rejects(() => runtime.selectVariant(boxing.variantId), hasCode("variant_swap_running"));

const boundaryRuntime = createAeroContentRuntime();
await boundaryRuntime.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
await boundaryRuntime.selectVariant(boxing.variantId);
const boundaryOld = boundaryRuntime.getSnapshot().resolvedEvents;
boundaryRuntime.setPlaybackState({ state: "paused", positionMs: 1000 });
await boundaryRuntime.swapFutureVariant(cut.variantId);
const boundaryNew = boundaryRuntime.getSnapshot().resolvedEvents;
assert.equal(boundaryNew.includes(boundaryOld.find((event) => event.centerTimestampMs === 500)), true);
assert.equal(boundaryNew.includes(boundaryOld.find((event) => event.centerTimestampMs === 1000)), false);
await boundaryRuntime.swapFutureVariant(boxing.variantId);
assert.equal(boundaryRuntime.getSnapshot().resolvedEvents.includes(boundaryOld.find((event) => event.centerTimestampMs === 500)), true);

const cosmeticPackage = structuredClone(basePackage);
cosmeticPackage.presentationSuggestion = { background: { schema: "aerobeat/background_suggestion", version: 1, source: "song", kind: "image", url: "https://assets.example.invalid/background.webp", hash: null, themeId: null } };
const cosmeticRuntime = createAeroContentRuntime({ fetch: async () => { throw new TypeError("CORS denied"); } });
await cosmeticRuntime.loadPackage({ package: cosmeticPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
assert.equal(cosmeticRuntime.getSnapshot().state, "ready");
assert.equal(cosmeticRuntime.getSnapshot().background.kind, "css");
assert.equal(cosmeticRuntime.getSnapshot().background.degradationReason, "cors_unreadable");
const hostBackground = { schema: "aerobeat/background_suggestion", version: 1, source: "athlete", kind: "image", url: "https://host.example.invalid/owned.webp", hash: null, themeId: null };
const precedenceRuntime = createAeroContentRuntime({ fetch: async () => { throw new TypeError("package background denied"); } });
await precedenceRuntime.loadPackage({ package: cosmeticPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] }, { hostBackground });
assert.equal(precedenceRuntime.getSnapshot().background.url, hostBackground.url);

await assert.rejects(() => createAeroContentRuntime().loadPackage({ package: basePackage, packageHash: `sha256:${"0".repeat(64)}`, assets: [{ path: "song.ogg", bytes: audioBytes }] }), hasCode("package_hash_mismatch"));
await assert.rejects(() => createAeroContentRuntime().loadPackage({ package: basePackage, packageHash: "not-a-hash", assets: [{ path: "song.ogg", bytes: audioBytes }] }), hasCode("package_hash_invalid"));
const badAudioRuntime = createAeroContentRuntime();
await assert.rejects(() => badAudioRuntime.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: new Uint8Array([1, 2, 3]) }] }), hasCode("asset_hash_mismatch"));
assert.equal(badAudioRuntime.getSnapshot().state, "error");
const badChartPackage = structuredClone(basePackage);
badChartPackage.charts[0].beats[0].start = 99;
await assert.rejects(() => createAeroContentRuntime().loadPackage({ package: badChartPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] }), hasCode("chart_hash_mismatch"));

const externalUrl = "https://community.example/maps/arbitrary-compatible-map.json";
const externalAudioUrl = "https://community.example/maps/song.ogg";
const externalRuntime = createAeroContentRuntime({ fetch: async (url) => {
  if (String(url) === externalUrl) return new Response(JSON.stringify({ package: basePackage, packageHash: `sha256:${packageHash}`, assets: [{ path: "song.ogg", url: externalAudioUrl, hash: `sha256:${audioHash}` }] }), { status: 200, headers: { "content-type": "application/json" } });
  if (String(url) === externalAudioUrl) return new Response(audioBytes, { status: 200 });
  throw new TypeError("unexpected URL");
} });
await externalRuntime.loadExternalPackage(externalUrl);
assert.equal(externalRuntime.getSnapshot().source.id, externalUrl);
const corsRuntime = createAeroContentRuntime({ fetch: async (url) => {
  if (String(url).endsWith("package.json")) return new Response(JSON.stringify({ package: basePackage, assets: [{ path: "song.ogg", url: externalAudioUrl, hash: audioHash }] }), { status: 200 });
  throw new TypeError("CORS denied");
} });
await assert.rejects(() => corsRuntime.loadExternalPackage("https://another-community.example/package.json"), hasCode("cors_unreadable"));
assert.equal(corsRuntime.getSnapshot().state, "error");

const exportBytes = makeAeroPackage(basePackage, packageHash, [{ path: "song.ogg", bytes: audioBytes, hash: audioHash }]);
let persistenceExists = true;
const handle = Object.freeze({ schema: "aerobeat/persistence_handle", version: 1, storage: "memory", namespace: "test.authored", key: "arbitrary-key", packageId: basePackage.packageId, packageHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: packageHash } });
const persistenceRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { if (!persistenceExists) throw Object.assign(new Error("deleted"), { code: "package_not_found" }); return { bytes: exportBytes }; } } });
await persistenceRuntime.loadPersistenceHandle(handle);
assert.equal(persistenceRuntime.getSnapshot().source.kind, "persistence_handle");
persistenceExists = false;
await assert.rejects(() => persistenceRuntime.reload(), hasCode("package_not_found"));
assert.equal(persistenceRuntime.getSnapshot().state, "error");
assert.equal(persistenceRuntime.getSnapshot().packageId, null);

let releaseResolver;
const delayedResolver = new Promise((resolve) => { releaseResolver = resolve; });
const resolverRace = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { await delayedResolver; return exportBytes; } } });
const staleResolverLoad = resolverRace.loadPersistenceHandle(handle);
const staleResolverRejected = assert.rejects(() => staleResolverLoad, hasCode("operation_aborted"));
await resolverRace.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
await staleResolverRejected;
releaseResolver();
assert.equal(resolverRace.getSnapshot().state, "ready");

const isolatedA = createAeroContentRuntime();
const isolatedB = createAeroContentRuntime();
await Promise.all([
  isolatedA.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] }),
  isolatedB.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] })
]);
await isolatedA.selectVariant(boxing.variantId, { modifierIds: ["no_weaves"] });
assert.notEqual(isolatedA.getSnapshot().selectedVariant.variantId, isolatedB.getSnapshot().selectedVariant.variantId);
isolatedA.destroy();
assert.equal(isolatedA.getSnapshot().state, "destroyed");
assert.equal(isolatedA.getSnapshot().packageId, null);
assert.equal(isolatedB.getSnapshot().state, "ready");

let releaseFirst;
const delayed = new Promise((resolve) => { releaseFirst = resolve; });
const replacing = createAeroContentRuntime({ fetch: async (url) => {
  if (String(url).includes("first")) { await delayed; return new Response(JSON.stringify({ package: basePackage, assets: [{ path: "song.ogg", url: "https://example.invalid/song.ogg", hash: audioHash }] }), { status: 200 }); }
  if (String(url).endsWith("song.ogg")) return new Response(audioBytes, { status: 200 });
  return new Response(JSON.stringify({ package: basePackage, assets: [{ path: "song.ogg", url: "https://example.invalid/song.ogg", hash: audioHash }] }), { status: 200 });
} });
const first = replacing.loadExternalPackage("https://example.invalid/first.json");
const second = replacing.loadExternalPackage("https://example.invalid/second.json");
releaseFirst();
await assert.rejects(() => first, hasCode("operation_aborted"));
await second;
assert.equal(replacing.getSnapshot().source.id, "https://example.invalid/second.json");

// Adversarial public-boundary narrowing must not execute getters or coercion hooks.
let executed = false;
const accessorOptions = {};
Object.defineProperty(accessorOptions, "fetch", { enumerable: true, get() { executed = true; throw new Error("getter executed"); } });
assert.throws(() => createAeroContentRuntime(accessorOptions), hasCode("runtime_options_invalid"));
assert.equal(executed, false);
const hostileModifier = { toString() { executed = true; return "no_squats"; } };
await assert.rejects(() => isolatedB.selectVariant(boxing.variantId, { modifierIds: [hostileModifier] }), hasCode("modifiers_invalid"));
assert.equal(executed, false);
const hostilePlayback = {};
Object.defineProperty(hostilePlayback, "state", { enumerable: true, get() { executed = true; return "paused"; } });
assert.throws(() => isolatedB.setPlaybackState(hostilePlayback), hasCode("playback_state_invalid"));
assert.equal(executed, false);

// Persisted path lists are strict and bounded; entries cannot coerce arbitrary objects.
const fallbackResolver = createAeroContentRuntime({ persistenceResolver: {
  async loadPackage() { return { package: basePackage, assetPaths: [{ toString() { executed = true; return "song.ogg"; } }] }; },
  async readAsset() { return audioBytes; }
} });
await assert.rejects(() => fallbackResolver.loadPersistenceHandle(handle, { assetHashes: { "song.ogg": audioHash } }), hasCode("asset_path_invalid"));
assert.equal(executed, false);

// Package-owned abort and timeout races settle even when injected fetch ignores signals.
const ignoredFetch = createAeroContentRuntime({ timeoutMs: 10, fetch: async () => new Promise(() => {}) });
await assert.rejects(() => ignoredFetch.loadExternalPackage("https://ignored.example/package.json"), hasCode("fetch_timeout"));
const replacedIgnored = createAeroContentRuntime({ timeoutMs: 1_000, fetch: async (url) => {
  if (String(url).includes("never")) return new Promise(() => {});
  if (String(url).endsWith("song.ogg")) return new Response(audioBytes, { status: 200 });
  return new Response(JSON.stringify({ package: basePackage, assets: [{ path: "song.ogg", url: "https://replace.example/song.ogg", hash: audioHash }] }), { status: 200 });
} });
const never = replacedIgnored.loadExternalPackage("https://replace.example/never.json");
const neverRejected = assert.rejects(() => never, hasCode("operation_aborted"));
await replacedIgnored.loadExternalPackage("https://replace.example/current.json");
await neverRejected;

// Declared package lengths and exact AEROPKG metadata fail closed.
const oversizedResponse = createAeroContentRuntime({ maximumPackageBytes: 64, fetch: async () => new Response("{}", { status: 200, headers: { "content-length": "65" } }) });
await assert.rejects(() => oversizedResponse.loadExternalPackage("https://length.example/package.json"), hasCode("package_too_large"));
const extraMetadataExport = rewriteAeroMetadata(exportBytes, (metadata) => ({ ...metadata, unexpected: true }));
const archiveRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return { bytes: extraMetadataExport }; } } });
await assert.rejects(() => archiveRuntime.loadPersistenceHandle(handle), hasCode("aeropkg_schema_invalid"));
const overflowExport = rewriteAeroMetadata(exportBytes, (metadata) => ({ ...metadata, assets: [{ ...metadata.assets[0], byteLength: Number.MAX_SAFE_INTEGER }] }));
const overflowRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return overflowExport; } } });
await assert.rejects(() => overflowRuntime.loadPersistenceHandle(handle), hasCode("aeropkg_asset_range_invalid"));
const noncanonicalExport = rewriteAeroMetadata(exportBytes, (metadata) => ({ ...metadata, assets: [{ ...metadata.assets[0], path: "SONG\\song.ogg" }] }));
const noncanonicalRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return noncanonicalExport; } } });
await assert.rejects(() => noncanonicalRuntime.loadPersistenceHandle(handle), hasCode("aeropkg_asset_path_noncanonical"));

// Emitted modifiers are part of chart identity, not hidden per-event state.
const hiddenModifier = structuredClone(basePackage);
hiddenModifier.charts[0].beats[0].modifier = "crossed_guard";
hiddenModifier.charts[0].prototype.contentHash = `sha256:${hashJson({ beats: hiddenModifier.charts[0].beats, recipeId: hiddenModifier.charts[0].prototype.recipeId, rulesetId: hiddenModifier.charts[0].prototype.rulesetId, sourceHash: hiddenModifier.charts[0].prototype.sourceHash })}`;
await assert.rejects(() => createAeroContentRuntime().loadPackage({ package: hiddenModifier, assets: [{ path: "song.ogg", bytes: audioBytes }] }), hasCode("event_modifier_not_in_identity"));

console.log("Content runtime unit checks passed.");

/** @param {string} expected */
function hasCode(expected) { return (error) => Boolean(error && typeof error === "object" && "code" in error && error.code === expected); }
/** @param {Uint8Array} bytes */
function hashBytes(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
/** @param {unknown} value */
function hashJson(value) { return hashBytes(new TextEncoder().encode(canonical(value))); }
/** @param {unknown} value */
function canonical(value) { return JSON.stringify(sort(value)); }
/** @param {unknown} value @returns {unknown} */
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value).sort()) result[key] = sort(value[key]); return result; } return value; }
/** @param {string} declaredAudioHash */
async function makePackage(declaredAudioHash) {
  const sourceHash = `sha256:${hashBytes(new TextEncoder().encode("arbitrary-source"))}`;
  const recipes = ["row_family_balanced_height_v1", "cut_family_source_height_v1"];
  const rulesets = ["boxing_semantic_track_v1", "boxing_spatial_grid_v1"];
  const charts = [];
  for (const recipeId of recipes) for (const rulesetId of rulesets) {
    const token = `${recipeId.startsWith("row") ? "row" : "cut"}-${rulesetId.includes("semantic") ? "semantic" : "spatial"}`;
    const beats = [
      { start: 1, type: "squat", eventId: `${token}-squat`, sourceEventIds: ["source-squat"], blockedCells: [8, 9, 10, 11], checkpoint: { kind: "interval", noseSafeCells: [0, 1, 2, 3] } },
      { start: 2, type: "guard", eventId: `${token}-guard`, sourceEventIds: ["source-guard"], guardTarget: { leftCell: 4, rightCell: 7 }, checkpoint: { kind: "instantaneous" } },
      { start: 3, type: "straight_left", eventId: `${token}-punch-a`, sourceEventIds: ["source-punch-a"], spatialTarget: { targetCell: 5, acceptedSubcells: [20, 21], sourceCell: 9, qualificationMs: 100 } },
      { start: 4, type: "hook_right", eventId: `${token}-punch-b`, sourceEventIds: ["source-punch-b"], spatialTarget: { targetCell: 6, acceptedSubcells: [26, 27], sourceCell: 5, entryDirection: "left" } }
    ];
    const contentHash = hashJson({ beats, recipeId, rulesetId, sourceHash });
    charts.push({ schemaId: "aerobeat.chart.boxing.v1", schemaVersion: 1, recordVersion: 1, chartId: `chart-${token}`, chartName: token, mode: "boxing", difficulty: "Expert", prototype: { contractId: "aerobeat.boxing.prototype.v1", recipeId, recipeVersion: "1.0.0", rulesetId, rulesetVersion: "1.0.0", sourceHash, recipeHash: `sha256:${"1".repeat(64)}`, rulesetHash: `sha256:${"2".repeat(64)}`, contentHash: `sha256:${contentHash}`, modifiers: [], regenerationRequiredFor: [] }, beats });
  }
  charts.push({ schemaId: "aerobeat.chart.v1", schemaVersion: 1, recordVersion: 1, chartId: "chart-flow", chartName: "Flow", mode: "flow", difficulty: "Expert", beats: [{ start: 1, type: "note", hand: "left", placement: 4, direction: 1 }] });
  return {
    schemaId: "aerobeat.song-package.v1", schemaVersion: 1, packageVersion: "1.0.0", packageId: "package-arbitrary-compatible", songId: "song-arbitrary", songName: "Arbitrary Compatible Map",
    source: { provider: "community", sourceId: "not-an-allowlist-id", sourceVersionHash: "source-version", difficulty: "Expert", sourceDifficultyPath: "Expert.dat", sourceHash },
    song: { schemaId: "aerobeat.song.v1", schemaVersion: 1, recordVersion: 1, songId: "song-arbitrary", songName: "Arbitrary Compatible Map", durationSec: 10, audio: { filePath: "song.ogg", contentHash: `sha256:${declaredAudioHash}` }, timing: { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] } },
    charts,
    sets: charts.map((chart, index) => ({ schemaId: "aerobeat.set.v1", schemaVersion: 1, recordVersion: 1, setId: `set-${index}`, setName: chart.chartName, songId: "song-arbitrary", chartId: chart.chartId })),
    recipeDefinitions: [], rulesetDefinitions: [], conversionTrace: {}, presentationSuggestion: null
  };
}
/** @param {Uint8Array} bytes @param {(metadata: Record<string, unknown>) => Record<string, unknown>} transform */
function rewriteAeroMetadata(bytes, transform) { const originalLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true); const original = /** @type {Record<string, unknown>} */ (JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + originalLength)))); const metadata = new TextEncoder().encode(canonical(transform(original))); const payload = bytes.slice(12 + originalLength); const output = new Uint8Array(12 + metadata.byteLength + payload.byteLength); output.set(new TextEncoder().encode("AEROPKG1")); new DataView(output.buffer).setUint32(8, metadata.byteLength, true); output.set(metadata, 12); output.set(payload, 12 + metadata.byteLength); return output; }
/** @param {Record<string, unknown>} packageRecord @param {string} declaredPackageHash @param {readonly {path: string, bytes: Uint8Array, hash: string}[]} entries */
function makeAeroPackage(packageRecord, declaredPackageHash, entries) { let offset = 0; const table = entries.map((entry) => { const row = { path: entry.path, offset, byteLength: entry.bytes.byteLength, sha256: entry.hash }; offset += entry.bytes.byteLength; return row; }); const metadata = new TextEncoder().encode(canonical({ schema: "aerobeat/authored_package_export", version: 1, packageHash: `sha256:${declaredPackageHash}`, package: packageRecord, assets: table })); const bytes = new Uint8Array(12 + metadata.byteLength + offset); bytes.set(new TextEncoder().encode("AEROPKG1")); new DataView(bytes.buffer).setUint32(8, metadata.byteLength, true); bytes.set(metadata, 12); let cursor = 12 + metadata.byteLength; for (const entry of entries) { bytes.set(entry.bytes, cursor); cursor += entry.bytes.byteLength; } return bytes; }
