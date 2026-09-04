// @ts-check

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  aeroContentRuntimeCapabilities,
  aeroContentRuntimeDescriptor,
  aeroContentServiceId,
  composeRuntimeVariant,
  createAeroContentRuntime,
  validateRuntimePackage
} from "../src/index.js";
import { cloneFrozenData } from "../src/runtime-data.js";

const audioBytes = new TextEncoder().encode("deterministic-audio-fixture");
const audioHash = hashBytes(audioBytes);
const basePackage = await makePackage(audioHash);
const packageHash = hashJson(basePackage);
const canonicalConverterProfile = Object.freeze({ schema: "aerobeat/prototype_profile", version: 1, profileId: "aero.converter.canonical", profileVersion: "1.0.0", class: "converter_regeneration", label: "Canonical Converter (Experimental)", experimental: true, settings: Object.freeze({ guardRelocationRadius: 1, reachAllowanceSubcells: 0 }), contentHash: "a43b53a39c13c9e9efe59854aee0fa16efdcd3c6a29bc09f678d94b3fd8f0202" });
const flowGeometry = Object.freeze({ schema: "aerobeat/flow_obstacle_geometry", version: 1, coordinateSpace: "beatsaber_lane_layer", x: 1, y: 2, width: 1, height: 3 });
const reachConverterProfile = Object.freeze({ schema: "aerobeat/prototype_profile", version: 1, profileId: "aero.converter.prototype-reach", profileVersion: "1.0.0", class: "converter_regeneration", label: "Prototype Reach Converter (Experimental)", experimental: true, settings: Object.freeze({ guardRelocationRadius: 2, reachAllowanceSubcells: 1 }), contentHash: "e37f8b527ed5ce86738ce22007fc963f83bccd737893fb4728d3b83eaa044eea" });

assert.equal(aeroContentServiceId, "aero.content.library");
assert.equal(aeroContentRuntimeDescriptor.implementationState, "implemented");
assert.equal(aeroContentRuntimeCapabilities.playlistAllowlistRequired, false);
const legacyValidation = await validateRuntimePackage(basePackage);
assert.equal(legacyValidation.variants.length, 5);
assert.throws(() => cloneFrozenData(Array(100_000).fill(null)), hasCode("data_too_large"), "generic data cloning must retain its 100,000-item default");
const largeCanonicalPackage = packageWithFlowEvents(basePackage, 20_000);
assert.equal((await validateRuntimePackage(largeCanonicalPackage)).variants.length, 5, "package validation must admit a valid canonical package above the generic item bound");
const excessiveCanonicalPackage = packageWithFlowEvents(basePackage, 84_000);
await assert.rejects(() => validateRuntimePackage(excessiveCanonicalPackage), hasCode("data_too_large"), "package validation must remain bounded at 500,000 items");
const cyclicPackage = structuredClone(basePackage); cyclicPackage.loop = cyclicPackage;
await assert.rejects(() => validateRuntimePackage(cyclicPackage), hasCode("data_cycle"));
const deepPackage = structuredClone(basePackage); let deepCursor = deepPackage; for (let index = 0; index < 50; index += 1) { deepCursor.deep = {}; deepCursor = deepCursor.deep; }
await assert.rejects(() => validateRuntimePackage(deepPackage), hasCode("data_too_deep"));
const longStringPackage = structuredClone(basePackage); longStringPackage.long = "x".repeat(1_000_001);
await assert.rejects(() => validateRuntimePackage(longStringPackage), hasCode("string_too_large"));
const legacyBase = legacyValidation.variants.find((entry) => entry.mode === "boxing");
assert.ok(legacyBase);
const legacyComposite = await composeRuntimeVariant(legacyBase, ["no_squats"], basePackage.packageId);
assert.equal(Object.hasOwn(legacyComposite.chart.prototype, "converterProfile"), false);
assert.equal(legacyComposite.chart.prototype.contentHash, `sha256:${hashJson({ beats: legacyComposite.chart.beats, recipeId: legacyComposite.recipeId, rulesetId: legacyComposite.rulesetId, sourceHash: legacyComposite.chart.prototype.sourceHash })}`);
const profilePackage = await makePackage(audioHash, canonicalConverterProfile);
const profileValidation = await validateRuntimePackage(profilePackage);
assert.equal(profileValidation.variants.length, 5);
assert.deepEqual(profileValidation.variants.filter((entry) => entry.mode === "boxing").map((entry) => entry.chart.prototype.converterProfile.contentHash), Array(4).fill(canonicalConverterProfile.contentHash));
const reachPackage = await makePackage(audioHash, reachConverterProfile);
assert.equal((await validateRuntimePackage(reachPackage)).variants.length, 5);
const profileBase = profileValidation.variants.find((entry) => entry.mode === "boxing");
assert.ok(profileBase);
const profileComposite = await composeRuntimeVariant(profileBase, ["no_squats"], profilePackage.packageId);
assert.equal(canonical(profileComposite.chart.prototype.converterProfile), canonical(canonicalConverterProfile));
assert.equal(profileComposite.chart.prototype.contentHash, `sha256:${hashJson({ beats: profileComposite.chart.beats, recipeId: profileComposite.recipeId, rulesetId: profileComposite.rulesetId, sourceHash: profileComposite.chart.prototype.sourceHash, converterProfile: canonicalConverterProfile })}`);
await verifyProfileRejections(profilePackage);

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
const idlePlaybackSnapshot = runtime.getSnapshot(); const idlePlaybackListenerCalls = listenerCalls;
runtime.setPlaybackState({ state: "idle", positionMs: 0, judgedEventIds: [], activeEventIds: [] });
assert.equal(runtime.getSnapshot(), idlePlaybackSnapshot, "equivalent playback truth must retain the exact public snapshot");
assert.equal(listenerCalls, idlePlaybackListenerCalls, "equivalent playback truth must not publish");
runtime.setPlaybackState({ state: "paused", positionMs: 125, judgedEventIds: ["judged-a", "judged-b"], activeEventIds: ["active-a"] });
const changedPlaybackSnapshot = runtime.getSnapshot(); const changedPlaybackListenerCalls = listenerCalls;
assert.notEqual(changedPlaybackSnapshot, idlePlaybackSnapshot, "truthful playback changes must publish a fresh snapshot");
runtime.setPlaybackState({ state: "paused", positionMs: 125, judgedEventIds: ["judged-b", "judged-a", "judged-a"], activeEventIds: ["active-a", "active-a"] });
assert.equal(runtime.getSnapshot(), changedPlaybackSnapshot, "equivalent playback ID sets must be order/duplicate independent");
assert.equal(listenerCalls, changedPlaybackListenerCalls, "equivalent playback ID sets must not publish");

const intervalPackage = structuredClone(basePackage);
intervalPackage.song.durationSec = 90;
intervalPackage.song.timing.tempoSegments[0].bpm = 150;
const intervalFlowChart = intervalPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(intervalFlowChart);
intervalFlowChart.beats = [
  { start: 1, type: "note", hand: "left", placement: 4, direction: 1 },
  { start: 2, end: 3, type: "arc", hand: "left", placement: 4, tailPlacement: 5, direction: 1 },
  { start: 4, end: 4.5, type: "burst", hand: "right", placement: 7, tailPlacement: 6, direction: 0 },
  { start: 74.5999984741211, end: 74.6624984741211, type: "obstacle", geometry: flowGeometry, gridMask: [1] }
];
const intervalRuntime = createAeroContentRuntime();
await intervalRuntime.loadPackage({ package: intervalPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
const intervalSnapshot = intervalRuntime.getSnapshot();
const noteEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "note");
const arcEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "arc");
const burstEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "burst");
const obstacleEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "obstacle");
assert.ok(noteEvent && arcEvent && burstEvent && obstacleEvent);
assert.equal(noteEvent.version, 2);
assert.deepEqual(Object.keys(noteEvent), ["schema", "version", "eventId", "variantId", "chartId", "centerTimestampMs", "authoredBeat"], "instant event envelope remains byte-shape compatible");
assert.equal(Object.hasOwn(noteEvent, "intervalEndTimestampMs"), false);
assert.equal(arcEvent.intervalEndTimestampMs, 1200);
assert.equal(burstEvent.intervalEndTimestampMs, 1800);
assert.equal(obstacleEvent.centerTimestampMs, 29839.999389648438);
assert.equal(obstacleEvent.intervalStartTimestampMs, obstacleEvent.centerTimestampMs);
assert.equal(obstacleEvent.intervalEndTimestampMs, 29864.999389648438);
assert.equal(Object.isFrozen(obstacleEvent), true);
assert.equal(Object.isFrozen(obstacleEvent.authoredBeat), true);
assert.deepEqual(JSON.parse(JSON.stringify(obstacleEvent)).authoredBeat.gridMask, [1]);
const beforeIntervalSwap = intervalSnapshot.resolvedEvents;
intervalRuntime.setPlaybackState({ state: "paused", positionMs: 500 });
await intervalRuntime.swapFutureVariant(intervalSnapshot.selectedVariant.variantId);
const afterIntervalSwap = intervalRuntime.getSnapshot().resolvedEvents;
assert.equal(afterIntervalSwap.includes(noteEvent), true, "paused swap preserves exact past instant event identity");
const replacedObstacle = afterIntervalSwap.find((event) => event.authoredBeat.type === "obstacle");
assert.ok(replacedObstacle);
assert.notEqual(replacedObstacle, obstacleEvent, "future interval receives a new immutable timeline envelope");
assert.equal(replacedObstacle.intervalEndTimestampMs, 29864.999389648438);
intervalRuntime.setPlaybackState({ state: "paused", positionMs: 29850, activeEventIds: [replacedObstacle.eventId] });
await intervalRuntime.swapFutureVariant(intervalSnapshot.selectedVariant.variantId);
assert.equal(intervalRuntime.getSnapshot().resolvedEvents.includes(replacedObstacle), true, "active interval identity and end timestamp survive paused swaps");
assert.equal(beforeIntervalSwap.some((event) => event.intervalEndTimestampMs !== undefined), true);
const accessibilityRuntime = createAeroContentRuntime();
await accessibilityRuntime.loadPackage({ package: intervalPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
const accessibilityFlowId = accessibilityRuntime.getSnapshot().selectedVariant.variantId;
await accessibilityRuntime.selectVariant(accessibilityFlowId, { modifierIds: ["no_obstacles"] });
assert.equal(accessibilityRuntime.getSnapshot().resolvedEvents.some((event) => event.authoredBeat.type === "obstacle"), false);
assert.deepEqual({ ranked: accessibilityRuntime.getSnapshot().selectedVariant.ranked, localOnly: accessibilityRuntime.getSnapshot().selectedVariant.localOnly }, { ranked: false, localOnly: true });
await accessibilityRuntime.selectVariant(accessibilityFlowId, { modifierIds: ["obstacle_visual_only"] });
assert.equal(accessibilityRuntime.getSnapshot().resolvedEvents.some((event) => event.authoredBeat.type === "obstacle"), true);
await assert.rejects(() => accessibilityRuntime.selectVariant(accessibilityFlowId, { modifierIds: ["no_obstacles", "obstacle_visual_only"] }), hasCode("modifier_conflict"));
const backwardsIntervalPackage = structuredClone(basePackage);
const backwardsFlow = backwardsIntervalPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(backwardsFlow);
backwardsFlow.beats = [{ start: 2, end: 1, type: "obstacle", geometry: flowGeometry, gridMask: [1] }];
await assert.rejects(() => validateRuntimePackage(backwardsIntervalPackage), hasCode("event_interval_invalid"));
const maskMismatchPackage = structuredClone(basePackage);
maskMismatchPackage.charts.find((chart) => chart.mode === "flow").beats = [{ start: 1, end: 2, type: "obstacle", geometry: flowGeometry, gridMask: [1, 5, 9] }];
await assert.rejects(() => validateRuntimePackage(maskMismatchPackage), hasCode("flow_obstacle_invalid"));
const tooManyObstacles = structuredClone(basePackage);
tooManyObstacles.charts.find((chart) => chart.mode === "flow").beats = Array.from({ length: 129 }, (_, index) => ({ start: index, end: index + 0.5, type: "obstacle", geometry: flowGeometry, gridMask: [1] }));
await assert.rejects(() => validateRuntimePackage(tooManyObstacles), hasCode("flow_obstacle_limit_exceeded"));
const exactObstacleLimit = structuredClone(tooManyObstacles);
exactObstacleLimit.charts.find((chart) => chart.mode === "flow").beats.pop();
await validateRuntimePackage(exactObstacleLimit);
const legacyPackage = structuredClone(basePackage); legacyPackage.schemaId = "aerobeat.song-package.v1"; legacyPackage.schemaVersion = 1; legacyPackage.packageVersion = "1.0.0";
await assert.rejects(() => validateRuntimePackage(legacyPackage), hasCode("flow_obstacle_reimport_required"));
const shadowedResolvedField = structuredClone(basePackage);
shadowedResolvedField.charts.find((chart) => chart.mode === "flow").beats[0].centerTimestampMs = 500;
const shadowRuntime = createAeroContentRuntime();
await assert.rejects(() => shadowRuntime.loadPackage({ package: shadowedResolvedField, assets: [{ path: "song.ogg", bytes: audioBytes }] }), hasCode("resolved_event_shadow_invalid"));
assert.equal(shadowRuntime.getSnapshot().state, "error");
const startOverflowPackage = structuredClone(basePackage);
const startOverflowFlow = startOverflowPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(startOverflowFlow);
startOverflowFlow.beats = [{ start: 1e308, type: "note", hand: "left", placement: 4, direction: 1 }];
await assert.rejects(() => validateRuntimePackage(startOverflowPackage), hasCode("event_timeline_invalid"), "finite authored start that derives Infinity must reject before publication");
const endOverflowPackage = structuredClone(basePackage);
const endOverflowFlow = endOverflowPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(endOverflowFlow);
endOverflowFlow.beats = [{ start: 0, end: 1e308, type: "obstacle", geometry: flowGeometry, gridMask: [1] }];
await assert.rejects(() => validateRuntimePackage(endOverflowPackage), hasCode("event_timeline_invalid"), "finite authored end that derives Infinity must reject before publication");
const boundaryPackage = structuredClone(basePackage);
boundaryPackage.song.durationSec = 86_400;
const boundaryFlow = boundaryPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(boundaryFlow);
boundaryFlow.beats = [{ start: 172_800, type: "note", hand: "left", placement: 4, direction: 1 }, { start: 172_799, end: 172_800, type: "obstacle", geometry: flowGeometry, gridMask: [1] }];
await validateRuntimePackage(boundaryPackage);
const timelineBoundaryRuntime = createAeroContentRuntime();
await timelineBoundaryRuntime.loadPackage({ package: boundaryPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
const boundaryEvents = timelineBoundaryRuntime.getSnapshot().resolvedEvents;
assert.equal(boundaryEvents.find((event) => event.authoredBeat.type === "note")?.centerTimestampMs, 86_400_000, "exact 24-hour center boundary is accepted");
assert.equal(boundaryEvents.find((event) => event.authoredBeat.type === "obstacle")?.intervalEndTimestampMs, 86_400_000, "exact 24-hour interval boundary is accepted");
assert.equal(boundaryEvents.every((event) => Number.isFinite(event.centerTimestampMs) && event.centerTimestampMs <= 86_400_000 && (!Object.hasOwn(event, "intervalEndTimestampMs") || Number.isFinite(event.intervalEndTimestampMs) && event.intervalEndTimestampMs <= 86_400_000)), true);
assert.equal(JSON.stringify(boundaryEvents).includes('"intervalEndTimestampMs":null'), false, "public interval JSON never degrades Infinity to null");
const centerPastBoundaryPackage = structuredClone(basePackage);
const centerPastBoundaryFlow = centerPastBoundaryPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(centerPastBoundaryFlow);
centerPastBoundaryFlow.beats = [{ start: 172_800.000001, type: "note", hand: "left", placement: 4, direction: 1 }];
await assert.rejects(() => validateRuntimePackage(centerPastBoundaryPackage), hasCode("event_timeline_invalid"), "center immediately after 24 hours rejects");
const endPastBoundaryPackage = structuredClone(basePackage);
const endPastBoundaryFlow = endPastBoundaryPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(endPastBoundaryFlow);
endPastBoundaryFlow.beats = [{ start: 172_799, end: 172_800.000001, type: "obstacle", geometry: flowGeometry, gridMask: [1] }];
await assert.rejects(() => validateRuntimePackage(endPastBoundaryPackage), hasCode("event_timeline_invalid"), "interval end immediately after 24 hours rejects");

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
const tamperedExportBytes = exportBytes.slice();
tamperedExportBytes[tamperedExportBytes.byteLength - 1] ^= 1;
const tamperedExportRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return { bytes: tamperedExportBytes }; } } });
const tamperedExportHandle = Object.freeze({ schema: "aerobeat/persistence_handle", version: 1, storage: "memory", namespace: "test.authored", key: "tampered-export", packageId: basePackage.packageId, packageHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: packageHash } });
await assert.rejects(() => tamperedExportRuntime.loadPersistenceHandle(tamperedExportHandle), hasCode("asset_hash_mismatch"), "one-byte AEROPKG asset tampering must fail closed");
assert.equal(tamperedExportRuntime.getSnapshot().state, "error");
assert.equal(tamperedExportRuntime.getSnapshot().packageId, null);
let persistenceExists = true;
const handle = Object.freeze({ schema: "aerobeat/persistence_handle", version: 1, storage: "memory", namespace: "test.authored", key: "arbitrary-key", packageId: basePackage.packageId, packageHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: packageHash } });
const persistenceRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { if (!persistenceExists) throw Object.assign(new Error("deleted"), { code: "package_not_found" }); return { bytes: exportBytes }; } } });
await persistenceRuntime.loadPersistenceHandle(handle);
assert.equal(persistenceRuntime.getSnapshot().source.kind, "persistence_handle");
const largePackageHash = hashJson(largeCanonicalPackage);
const largeExportBytes = makeAeroPackage(largeCanonicalPackage, largePackageHash, [{ path: "song.ogg", bytes: audioBytes, hash: audioHash }]);
const largeHandle = Object.freeze({ ...handle, key: "large-canonical", packageId: largeCanonicalPackage.packageId, packageHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: largePackageHash } });
const largePersistenceRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return { bytes: largeExportBytes }; } } });
await largePersistenceRuntime.loadPersistenceHandle(largeHandle);
assert.equal(largePersistenceRuntime.getSnapshot().state, "ready", "AEROPKG persistence must admit a valid canonical package above 100,000 items");
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
const excessivePackageHash = hashJson(excessiveCanonicalPackage);
const excessiveExport = makeAeroPackage(excessiveCanonicalPackage, excessivePackageHash, [{ path: "song.ogg", bytes: audioBytes, hash: audioHash }]);
const excessiveHandle = Object.freeze({ ...handle, key: "excessive-canonical", packageId: excessiveCanonicalPackage.packageId, packageHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: excessivePackageHash } });
const excessiveArchiveRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return { bytes: excessiveExport }; } } });
await assert.rejects(() => excessiveArchiveRuntime.loadPersistenceHandle(excessiveHandle), hasCode("data_too_large"));
const hostileTableExport = rewriteAeroMetadata(exportBytes, (metadata) => ({ ...metadata, assets: [{ ...metadata.assets[0], unexpected: true }] }));
const hostileTableRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return hostileTableExport; } } });
await assert.rejects(() => hostileTableRuntime.loadPersistenceHandle(handle), hasCode("aeropkg_asset_invalid"));
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
/** @param {Record<string, unknown>} packageRecord @param {number} eventCount */
function packageWithFlowEvents(packageRecord, eventCount) {
  const result = structuredClone(packageRecord);
  const charts = /** @type {Record<string, unknown>[]} */ (result.charts);
  const flow = charts.find((chart) => chart.mode === "flow");
  if (!flow) throw new Error("flow fixture missing");
  flow.beats = Array.from({ length: eventCount }, (_, index) => ({ start: index / 4, type: "note", hand: index % 2 === 0 ? "left" : "right", placement: index % 12, direction: index % 9 }));
  return result;
}
/** @param {string} declaredAudioHash @param {Readonly<Record<string, unknown>> | null} [converterProfile] */
async function makePackage(declaredAudioHash, converterProfile = null) {
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
    const contentHash = hashJson({ beats, recipeId, rulesetId, sourceHash, ...(converterProfile ? { converterProfile } : {}) });
    charts.push({ schemaId: "aerobeat.chart.boxing.v1", schemaVersion: 1, recordVersion: 1, chartId: `chart-${token}`, chartName: token, mode: "boxing", difficulty: "Expert", prototype: { contractId: "aerobeat.boxing.prototype.v1", recipeId, recipeVersion: "1.0.0", rulesetId, rulesetVersion: "1.0.0", sourceHash, recipeHash: `sha256:${"1".repeat(64)}`, rulesetHash: `sha256:${"2".repeat(64)}`, contentHash: `sha256:${contentHash}`, modifiers: [], ...(converterProfile ? { converterProfile: structuredClone(converterProfile) } : {}), regenerationRequiredFor: [] }, beats });
  }
  charts.push({ schemaId: "aerobeat.chart.flow.v2", schemaVersion: 2, recordVersion: 1, rulesetId: "flow_grid_v2", chartId: "chart-flow", chartName: "Flow", mode: "flow", difficulty: "Expert", beats: [{ start: 1, type: "note", hand: "left", placement: 4, direction: 1 }] });
  return {
    schemaId: "aerobeat.song-package.v2", schemaVersion: 2, packageVersion: "2.0.0", packageId: "package-arbitrary-compatible", songId: "song-arbitrary", songName: "Arbitrary Compatible Map",
    source: { provider: "community", sourceId: "not-an-allowlist-id", sourceVersionHash: "source-version", difficulty: "Expert", sourceDifficultyPath: "Expert.dat", sourceHash, flowObstacleContract: "source_geometry_v1", ...(converterProfile ? { converterProfile: structuredClone(converterProfile) } : {}) },
    song: { schemaId: "aerobeat.song.v1", schemaVersion: 1, recordVersion: 1, songId: "song-arbitrary", songName: "Arbitrary Compatible Map", durationSec: 10, audio: { filePath: "song.ogg", contentHash: `sha256:${declaredAudioHash}` }, timing: { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] } },
    charts,
    sets: charts.map((chart, index) => ({ schemaId: "aerobeat.set.v1", schemaVersion: 1, recordVersion: 1, setId: `set-${index}`, setName: chart.chartName, songId: "song-arbitrary", chartId: chart.chartId })),
    recipeDefinitions: [], rulesetDefinitions: [], conversionTrace: converterProfile ? { converterProfile: structuredClone(converterProfile), boxing: charts.filter((chart) => chart.mode === "boxing").map((chart) => ({ chartId: chart.chartId, converterProfile: structuredClone(converterProfile) })), flow: [{}] } : {}, presentationSuggestion: null
  };
}
/** @param {Uint8Array} bytes @param {(metadata: Record<string, unknown>) => Record<string, unknown>} transform */
function rewriteAeroMetadata(bytes, transform) { const originalLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true); const original = /** @type {Record<string, unknown>} */ (JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + originalLength)))); const metadata = new TextEncoder().encode(canonical(transform(original))); const payload = bytes.slice(12 + originalLength); const output = new Uint8Array(12 + metadata.byteLength + payload.byteLength); output.set(new TextEncoder().encode("AEROPKG1")); new DataView(output.buffer).setUint32(8, metadata.byteLength, true); output.set(metadata, 12); output.set(payload, 12 + metadata.byteLength); return output; }
/** @param {Record<string, unknown>} profilePackage */
async function verifyProfileRejections(profilePackage) {
  const mutations = [];
  mutations.push((value) => { delete value.source.converterProfile; });
  mutations.push((value) => { delete value.charts[0].prototype.converterProfile; });
  mutations.push((value) => { value.charts[0].prototype.converterProfile.extra = true; });
  mutations.push((value) => { value.charts[0].prototype.converterProfile = structuredClone(reachConverterProfile); });
  mutations.push((value) => { value.source.converterProfile.settings.guardRelocationRadius = 3; });
  mutations.push((value) => { value.conversionTrace.boxing[2].converterProfile = structuredClone(reachConverterProfile); });
  mutations.push((value) => { value.conversionTrace.flow[0].converterProfile = structuredClone(canonicalConverterProfile); });
  for (const mutate of mutations) {
    const candidate = structuredClone(profilePackage);
    mutate(candidate);
    await assert.rejects(() => validateRuntimePackage(candidate), (error) => Boolean(error && typeof error === "object" && "code" in error && String(error.code).startsWith("converter_profile")));
  }
  let getterCalls = 0;
  const accessor = structuredClone(profilePackage);
  Object.defineProperty(accessor.source.converterProfile, "profileId", { enumerable: true, get() { getterCalls += 1; return "aero.converter.canonical"; } });
  await assert.rejects(() => validateRuntimePackage(accessor), hasCode("data_record_invalid"));
  assert.equal(getterCalls, 0);
  const hidden = structuredClone(profilePackage);
  Object.defineProperty(hidden.source.converterProfile, "hidden", { enumerable: false, value: true });
  await assert.rejects(() => validateRuntimePackage(hidden), hasCode("data_record_invalid"));
  const symbol = structuredClone(profilePackage);
  symbol.source.converterProfile[Symbol("profile")] = true;
  await assert.rejects(() => validateRuntimePackage(symbol), hasCode("data_record_invalid"));
  const classValue = structuredClone(profilePackage);
  class ProfileSettings { constructor() { this.guardRelocationRadius = 1; this.reachAllowanceSubcells = 0; } }
  classValue.source.converterProfile.settings = new ProfileSettings();
  await assert.rejects(() => validateRuntimePackage(classValue), hasCode("data_record_invalid"));
  const typed = structuredClone(profilePackage);
  typed.source.converterProfile.settings = new Uint8Array([1, 0]);
  await assert.rejects(() => validateRuntimePackage(typed), hasCode("data_record_invalid"));
  const rehashedProfile = structuredClone(canonicalConverterProfile);
  rehashedProfile.settings.guardRelocationRadius = 3;
  rehashedProfile.contentHash = hashJson({ schema: "aerobeat/prototype_profile", version: 1, profileId: rehashedProfile.profileId, profileVersion: rehashedProfile.profileVersion, class: rehashedProfile.class, settings: rehashedProfile.settings });
  const stalePackage = structuredClone(profilePackage);
  stalePackage.source.converterProfile = rehashedProfile;
  stalePackage.conversionTrace.converterProfile = structuredClone(rehashedProfile);
  for (const trace of stalePackage.conversionTrace.boxing) trace.converterProfile = structuredClone(rehashedProfile);
  for (const chart of stalePackage.charts.filter((entry) => entry.mode === "boxing")) chart.prototype.converterProfile = structuredClone(rehashedProfile);
  await assert.rejects(() => validateRuntimePackage(stalePackage), hasCode("chart_hash_mismatch"));
  const atomicRuntime = createAeroContentRuntime();
  await atomicRuntime.loadPackage({ package: profilePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
  await assert.rejects(() => atomicRuntime.loadPackage({ package: stalePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] }), hasCode("chart_hash_mismatch"));
  assert.equal(atomicRuntime.getSnapshot().state, "error");
  assert.equal(atomicRuntime.getSnapshot().selectedVariant, null);
  assert.equal(JSON.stringify(atomicRuntime.getSnapshot()).includes(rehashedProfile.contentHash), false);
}

/** @param {Record<string, unknown>} packageRecord @param {string} declaredPackageHash @param {readonly {path: string, bytes: Uint8Array, hash: string}[]} entries */
function makeAeroPackage(packageRecord, declaredPackageHash, entries) { let offset = 0; const table = entries.map((entry) => { const row = { path: entry.path, offset, byteLength: entry.bytes.byteLength, sha256: entry.hash }; offset += entry.bytes.byteLength; return row; }); const metadata = new TextEncoder().encode(canonical({ schema: "aerobeat/authored_package_export", version: 1, packageHash: `sha256:${declaredPackageHash}`, package: packageRecord, assets: table })); const bytes = new Uint8Array(12 + metadata.byteLength + offset); bytes.set(new TextEncoder().encode("AEROPKG1")); new DataView(bytes.buffer).setUint32(8, metadata.byteLength, true); bytes.set(metadata, 12); let cursor = 12 + metadata.byteLength; for (const entry of entries) { bytes.set(entry.bytes, cursor); cursor += entry.bytes.byteLength; } return bytes; }
