// @ts-check

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  aeroContentRuntimeCapabilities,
  aeroContentRuntimeDescriptor,
  aeroContentServiceId,
  authoredBeatToTimelineMs,
  composeRuntimeVariant,
  createAeroContentRuntime,
  createAuthoredBeatToTimelineMs,
  maximumAuthoredTimelineMs,
  validateRuntimePackage
} from "../src/index.js";
import { parseAeroPackage } from "../src/assets.js";
import { cloneFrozenData } from "../src/runtime-data.js";

const BOXING_PUNCH_CASES=Object.freeze([Object.freeze({type:"straight_left",hand:"left"}),Object.freeze({type:"straight_right",hand:"right"}),Object.freeze({type:"hook_left",hand:"left"}),Object.freeze({type:"hook_right",hand:"right"}),Object.freeze({type:"uppercut_left",hand:"left"}),Object.freeze({type:"uppercut_right",hand:"right"})]);
const BOXING_FIXED_TYPES=Object.freeze(["squat","guard","weave_left","weave_right"]);
const BOXING_VARIANT_MATRIX=Object.freeze([["row_family_balanced_height_v1","boxing_semantic_track_v1","boxing_lanes"],["row_family_balanced_height_v1","boxing_spatial_grid_v1","boxing_spatial_grid"],["cut_family_source_height_v1","boxing_semantic_track_v1","boxing_lanes"],["cut_family_source_height_v1","boxing_spatial_grid_v1","boxing_spatial_grid"]].map((entry)=>Object.freeze(entry)));
const BOXING_MODE_COLOR_ROWS=Object.freeze([
  ["boxing_lanes","straight_left","#FF0000"],["boxing_lanes","straight_right","#808080"],["boxing_lanes","hook_left","#FF0000"],["boxing_lanes","hook_right","#808080"],["boxing_lanes","uppercut_left","#FF0000"],["boxing_lanes","uppercut_right","#808080"],
  ["boxing_spatial_grid","straight_left","#FF0000"],["boxing_spatial_grid","straight_right","#808080"],["boxing_spatial_grid","hook_left","#FF0000"],["boxing_spatial_grid","hook_right","#808080"],["boxing_spatial_grid","uppercut_left","#FF0000"],["boxing_spatial_grid","uppercut_right","#808080"]
].map((row)=>Object.freeze(row)));
const BOXING_MODE_FIXED_ROWS=Object.freeze([["boxing_lanes","guard",false],["boxing_lanes","squat",false],["boxing_lanes","weave_left",false],["boxing_lanes","weave_right",false],["boxing_spatial_grid","guard",false],["boxing_spatial_grid","squat",false],["boxing_spatial_grid","weave_left",false],["boxing_spatial_grid","weave_right",false]].map((row)=>Object.freeze(row)));
const spawnTiming = Object.freeze({ schema:"aerobeat/beatsaber_spawn_timing",version:1,algorithm:"beatsaber_core_hjd_v1",bpm:120,noteJumpMovementSpeed:10,noteJumpStartBeatOffset:1,maxHalfJumpDistance:17.999,startHalfJumpDurationBeats:4,minimumHalfJumpDurationBeats:.25,halfJumpDurationBeats:3,reactionTimeMs:1500,jumpDistanceMeters:30 });
const audioBytes = new TextEncoder().encode("deterministic-audio-fixture");
const audioHash = hashBytes(audioBytes);
const basePackage = await makePackage(audioHash);
const packageHash = hashJson(basePackage);
const canonicalConverterProfile = Object.freeze({ schema: "aerobeat/prototype_profile", version: 1, profileId: "aero.converter.canonical", profileVersion: "1.0.0", class: "converter_regeneration", label: "Canonical Converter (Experimental)", experimental: true, settings: Object.freeze({ guardRelocationRadius: 1, reachAllowanceSubcells: 0 }), contentHash: "a43b53a39c13c9e9efe59854aee0fa16efdcd3c6a29bc09f678d94b3fd8f0202" });
const sourceGeometry = Object.freeze({ schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v2_legacy_obstacle",kind:"v2_type_1",x:1,y:2,width:1,height:3 });
const gameplayGeometry = Object.freeze({ schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:1,y:0,width:1,height:3 });
const reachConverterProfile = Object.freeze({ schema: "aerobeat/prototype_profile", version: 1, profileId: "aero.converter.prototype-reach", profileVersion: "1.0.0", class: "converter_regeneration", label: "Prototype Reach Converter (Experimental)", experimental: true, settings: Object.freeze({ guardRelocationRadius: 2, reachAllowanceSubcells: 1 }), contentHash: "e37f8b527ed5ce86738ce22007fc963f83bccd737893fb4728d3b83eaa044eea" });

await verifyFlowAdmissionSecurity(basePackage, audioBytes, audioHash);

assert.equal(aeroContentServiceId, "aero.content.library");
assert.equal(aeroContentRuntimeDescriptor.implementationState, "implemented");
assert.equal(aeroContentRuntimeCapabilities.playlistAllowlistRequired, false);
assert.equal(maximumAuthoredTimelineMs, 86_400_000);
const successorFixture = JSON.parse(await readFile(new URL("../fixtures/flow-colliders-3c9d-successor-v1.json", import.meta.url), "utf8"));
assert.deepEqual(successorFixture.expected, {
  packageHash: "sha256:60e850b3a822b22f34ff1050e0f8531b5d34ce8e3bb3a01bd3208ae27a074b92",
  flowContentHash: "sha256:329bf3af3435f309670a307748f70585cf4be15372d4a7b54a658fa28cfd6145",
  semanticParityHash: "sha256:978c9d7d1415e5597e1e2560b88090a05236088d117f422dae0222f21182cc99"
});
const successorEnvelope = makeAeroPackage(successorFixture.package, successorFixture.expected.packageHash.slice(7), []);
const parsedSuccessorEnvelope = await parseAeroPackage(successorEnvelope);
assert.equal(parsedSuccessorEnvelope.packageHash, successorFixture.expected.packageHash, "AEROPKG1 envelope must retain the exact declared package hash");
const successorValidation = await validateRuntimePackage(parsedSuccessorEnvelope.package, { declaredPackageHash: parsedSuccessorEnvelope.packageHash });
const successorFlowChart = successorValidation.package.charts.find((chart) => chart.mode === "flow");
const successorFlowVariants = successorValidation.variants.filter((variant) => variant.mode === "flow");
assert.equal(successorFlowChart.contentHash, successorFixture.expected.flowContentHash);
assert.equal(successorValidation.packageHash.value, successorFixture.expected.packageHash.slice(7));
assert.equal(successorValidation.semanticParityHash.value, successorFixture.expected.semanticParityHash.slice(7));
assert.deepEqual(successorFlowVariants.map((variant) => [variant.variantId, variant.rulesetId, variant.recipeId, variant.ranked, variant.localOnly]), [
  [successorFlowChart.chartId, "flow_grid_v2", null, true, false],
  [`${successorFlowChart.chartId}~ruleset-flow_colliders_v1`, "flow_colliders_v1", null, false, true]
]);
assert.notDeepEqual(successorFlowVariants[0].scoreIdentityHash, successorFlowVariants[1].scoreIdentityHash, "Flow rulesets require distinct score partitions");
const predecessorScoringChart = structuredClone(successorFlowChart); predecessorScoringChart.schemaId = "aerobeat.chart.flow.v4"; predecessorScoringChart.schemaVersion = 4; delete predecessorScoringChart.rulesetVariants; delete predecessorScoringChart.notePalette; delete predecessorScoringChart.contentHash;
const predecessorScoringMapHash = hashJson(predecessorScoringChart);
const predecessorScoreIdentity = hashJson({ packageId: successorValidation.packageId, chartId: successorFlowChart.chartId, rulesetId: "flow_grid_v2", recipeId: null, modifierIds: [], mapHash: predecessorScoringMapHash, ranked: true });
assert.equal(successorFlowVariants[0].scoreIdentityHash.value, predecessorScoreIdentity, "successor Flow Grid retains the historical score partition identity");
assert.equal(successorFlowVariants[0].chart, successorFlowVariants[1].chart, "both Flow rulesets share one exact frozen chart object");
assert.equal(successorFlowVariants[0].chart.beats, successorFlowVariants[1].chart.beats, "both Flow rulesets share one exact authored beats array");
assert.equal(canonical(successorFlowVariants[0].chart.beats), canonical(successorFlowVariants[1].chart.beats), "both Flow rulesets resolve identical authored beat bytes");
for (const rulesetVariants of [undefined, ["flow_grid_v2"], ["flow_colliders_v1"], ["flow_colliders_v1", "flow_grid_v2"], ["flow_grid_v2", "flow_colliders_v1", "flow_colliders_v1"]]) {
  const tampered = structuredClone(successorFixture.package);
  const chart = tampered.charts.find((entry) => entry.mode === "flow");
  const trace = tampered.conversionTrace.flow[0];
  if (rulesetVariants === undefined) { delete chart.rulesetVariants; delete trace.rulesetVariants; }
  else { chart.rulesetVariants = rulesetVariants; trace.rulesetVariants = rulesetVariants; }
  chart.contentHash = `sha256:${hashJson({ beats: chart.beats, rulesetId: chart.rulesetId, ...(rulesetVariants === undefined ? {} : { rulesetVariants }), notePalette: chart.notePalette })}`;
  trace.contentHash = chart.contentHash;
  await assert.rejects(() => validateRuntimePackage(tampered), hasCode("flow_chart_schema_invalid"), "missing, partial, reordered, or duplicate successor identities fail closed after attacker rehash");
}
const traceRulesetMismatch = structuredClone(successorFixture.package); traceRulesetMismatch.conversionTrace.flow[0].rulesetVariants = ["flow_colliders_v1", "flow_grid_v2"];
await assert.rejects(() => validateRuntimePackage(traceRulesetMismatch), hasCode("flow_trace_invalid"), "Flow trace ordered rulesets must agree with the exact chart identity");
const perVariantBeats = structuredClone(successorFixture.package); perVariantBeats.charts.find((chart) => chart.mode === "flow").beatsByRuleset = { flow_grid_v2: [], flow_colliders_v1: [] };
await assert.rejects(() => validateRuntimePackage(perVariantBeats), hasCode("flow_chart_shape_invalid"), "per-ruleset beat authority is forbidden");
const canonicalTiming = { anchorMs: 250, tempoSegments: [{ startBeat: 0, bpm: 120 }, { startBeat: 4, bpm: 60 }, { startBeat: 8, bpm: 240 }], stopSegments: [{ startBeat: 2, durationMs: 125 }, { startBeat: 6, durationMs: 375 }], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] };
const canonicalMapper = createAuthoredBeatToTimelineMs(canonicalTiming);
assert.equal(authoredBeatToTimelineMs({ anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] }, 3), 1500, "constant timing uses the contract authority");
assert.equal(canonicalMapper(2), 1375, "a stop contributes inclusively at S <= b");
assert.equal(canonicalMapper(6), 4750, "anchor, cross-segment tempo, and ordered stops compose exactly");
assert.equal(canonicalMapper(9), 7000, "the final tempo segment extends to the target");
canonicalTiming.tempoSegments[0].bpm = 1;
canonicalTiming.stopSegments[0].durationMs = 999;
assert.equal(canonicalMapper(6), 4750, "the mapper snapshots timing before caller mutation");
for (const malformed of [
  { anchorMs: 0, tempoSegments: [{ startBeat: 1, bpm: 120 }], stopSegments: [], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] },
  { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }, { startBeat: 0, bpm: 90 }], stopSegments: [], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] },
  { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [{ startBeat: 2, durationMs: 1 }, { startBeat: 2, durationMs: 1 }], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] },
  { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [{ startBeat: 1, durationMs: 0 }], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] }
]) assert.throws(() => createAuthoredBeatToTimelineMs(malformed), TypeError);
const legacyValidation = await validateRuntimePackage(basePackage);
assert.equal(legacyValidation.variants.length, 6);
assert.throws(() => cloneFrozenData(Array(100_000).fill(null)), hasCode("data_too_large"), "generic data cloning must retain its 100,000-item default");
const largeCanonicalPackage = packageWithFlowEvents(basePackage, 20_000);
assert.equal((await validateRuntimePackage(largeCanonicalPackage)).variants.length, 6, "package validation must admit a valid canonical package above the generic item bound");
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
assert.equal(profileValidation.variants.length, 6);
assert.deepEqual(profileValidation.variants.filter((entry) => entry.mode === "boxing").map((entry) => entry.chart.prototype.converterProfile.contentHash), Array(4).fill(canonicalConverterProfile.contentHash));
const reachPackage = await makePackage(audioHash, reachConverterProfile);
assert.equal((await validateRuntimePackage(reachPackage)).variants.length, 6);
const profileBase = profileValidation.variants.find((entry) => entry.mode === "boxing");
assert.ok(profileBase);
const profileComposite = await composeRuntimeVariant(profileBase, ["no_squats"], profilePackage.packageId);
assert.equal(canonical(profileComposite.chart.prototype.converterProfile), canonical(canonicalConverterProfile));
assert.equal(profileComposite.chart.prototype.contentHash, `sha256:${hashJson({ beats: profileComposite.chart.beats, recipeId: profileComposite.recipeId, rulesetId: profileComposite.rulesetId, sourceHash: profileComposite.chart.prototype.sourceHash, converterProfile: canonicalConverterProfile })}`);
await verifyProfileRejections(profilePackage);

const runtime = createAeroContentRuntime({ onListenerError() { throw new Error("listener error callback should be isolated too"); } });
const timingMapperSymbol = Symbol.for("aerobeat.web-content.internal-timing-mapper");
const effectivePaletteSymbol = Symbol.for("aerobeat.web-content.internal-effective-palette");
const spawnTimingSymbol = Symbol.for("aerobeat.web-content.internal-spawn-timing");
const timingMapperDescriptor = Object.getOwnPropertyDescriptor(runtime, timingMapperSymbol);
const effectivePaletteDescriptor = Object.getOwnPropertyDescriptor(runtime, effectivePaletteSymbol);
const spawnTimingDescriptor = Object.getOwnPropertyDescriptor(runtime, spawnTimingSymbol);
assert.deepEqual({ enumerable: timingMapperDescriptor?.enumerable, writable: timingMapperDescriptor?.writable, configurable: timingMapperDescriptor?.configurable }, { enumerable: false, writable: false, configurable: false });
assert.deepEqual({ enumerable: effectivePaletteDescriptor?.enumerable, writable: effectivePaletteDescriptor?.writable, configurable: effectivePaletteDescriptor?.configurable }, { enumerable: false, writable: false, configurable: false });
assert.deepEqual({ enumerable: spawnTimingDescriptor?.enumerable, writable: spawnTimingDescriptor?.writable, configurable: spawnTimingDescriptor?.configurable }, { enumerable: false, writable: false, configurable: false });
assert.equal(runtime[spawnTimingSymbol](runtime.getSnapshot().generation), null, "private spawn timing is unavailable before readiness");
assert.equal(runtime[timingMapperSymbol](runtime.getSnapshot().generation), null, "private timing mapper is unavailable before readiness");
assert.equal(runtime[effectivePaletteSymbol](runtime.getSnapshot().generation), null, "private effective palette is unavailable before readiness");
let listenerCalls = 0;
runtime.subscribe(() => { listenerCalls += 1; throw new Error("expected isolated listener failure"); });
await runtime.loadPackage({ package: basePackage, packageHash: `sha256:${packageHash}`, assets: [{ path: "song.ogg", bytes: audioBytes }] });
let snapshot = runtime.getSnapshot();
assert.equal(snapshot.state, "ready");
assert.equal(snapshot.variants.length, 6);
const runtimeFlowVariants = snapshot.variants.filter((variant) => variant.mode === "flow");
assert.deepEqual(runtimeFlowVariants.map((variant) => variant.rulesetId), ["flow_grid_v2", "flow_colliders_v1"]);
assert.equal(snapshot.selectedVariant.rulesetId, "flow_grid_v2", "Flow Grid remains the exact default");
const gridResolvedEvents = snapshot.resolvedEvents;
await runtime.selectVariant(runtimeFlowVariants[1].variantId);
const colliderResolvedEvents = runtime.getSnapshot().resolvedEvents;
assert.deepEqual(colliderResolvedEvents.map((event) => event.authoredBeat), gridResolvedEvents.map((event) => event.authoredBeat), "both Flow variants resolve the same exact authored event objects");
assert.equal(colliderResolvedEvents.every((event, index) => event.authoredBeat === gridResolvedEvents[index].authoredBeat), true, "shared Flow bytes retain object identity across ruleset resolution");
assert.equal(colliderResolvedEvents.every((event) => event.variantId === runtimeFlowVariants[1].variantId && event.chartId === runtimeFlowVariants[1].chartId), true);
await runtime.selectVariant(runtimeFlowVariants[0].variantId);
snapshot = runtime.getSnapshot();
const publicSuccessorJson = JSON.stringify(snapshot);
for (const forbidden of ["colliderRadius", "colliderCenter", "collisionSettings", "wrist", "nose", "trajectory", "segmentEndpoint", "confidence", "calibrationId", "frameId", "contactEpisode"]) assert.equal(publicSuccessorJson.includes(forbidden), false, `public content snapshot omits private ${forbidden} evidence`);
assert.equal(snapshot.assets[0].readable, true);
assert.equal(snapshot.lineage.sourceId, "not-an-allowlist-id");
assert.equal(Object.isFrozen(snapshot), true);
assert.equal(Object.isFrozen(snapshot.variants), true);
assert.equal(JSON.stringify(snapshot).includes("deterministic-audio-fixture"), false);
assert.deepEqual(runtime.readAsset("SONG.OGG"), audioBytes);
assert.ok(listenerCalls >= 2);
assert.equal(Object.getPrototypeOf(snapshot.song.timing), null, "canonical runtime timing remains an immutable null-prototype record");
assert.equal(Object.getPrototypeOf(snapshot.song.timing.tempoSegments[0]), null, "canonical tempo segments remain null-prototype records");
assert.throws(() => createAuthoredBeatToTimelineMs(snapshot.song.timing), /Invalid authored song timing/u, "red-before path: the public canonical null-prototype timing cannot be revalidated as caller-authored timing");
const readyTimingMapper = runtime[timingMapperSymbol](snapshot.generation);
assert.equal(typeof readyTimingMapper, "function", "green-after path: the ready generation exposes its already-validated private mapper");
assert.equal(runtime[timingMapperSymbol](snapshot.generation), readyTimingMapper, "the current ready generation retains exact mapper identity");
assert.equal(runtime[timingMapperSymbol](snapshot.generation - 1), null, "a mismatched generation cannot obtain the mapper");
const readyEffectivePalette = runtime[effectivePaletteSymbol](snapshot.generation);
assert.deepEqual({ left:readyEffectivePalette?.left, right:readyEffectivePalette?.right }, { left: "#2693FF", right: "#39C96B" }, "the ready generation exposes the validated effective left/right colors");
assert.equal(Object.isFrozen(readyEffectivePalette), true, "the private effective palette is immutable");
assert.equal(runtime[effectivePaletteSymbol](snapshot.generation), readyEffectivePalette, "the current ready generation retains exact palette identity");
assert.equal(runtime[effectivePaletteSymbol](snapshot.generation - 1), null, "a mismatched generation cannot obtain the palette");
const readySpawnTiming=runtime[spawnTimingSymbol](snapshot.generation);
assert.deepEqual(Object.fromEntries(Object.entries(readySpawnTiming)),spawnTiming,"the ready generation exposes exact immutable spawn timing");
assert.equal(Object.isFrozen(readySpawnTiming),true);
assert.equal(runtime[spawnTimingSymbol](snapshot.generation-1),null);
assert.equal(JSON.stringify(snapshot).includes("beatsaber_spawn_timing"),false,"spawn timing stays out of public snapshots");
const firstResolvedEvent = snapshot.resolvedEvents[0];
assert.equal(readyTimingMapper(firstResolvedEvent.authoredBeat.start), firstResolvedEvent.centerTimestampMs, "private mapper reproduces resolved event timing exactly");
assert.equal(Object.keys(runtime).some((key) => key.includes("timing") || key.includes("mapper")), false, "the timing mapper seam is not a public string-keyed API");
assert.equal(JSON.stringify(runtime).includes("internal-timing-mapper"), false, "the private mapper cannot serialize");
assert.equal(Object.keys(runtime).some((key) => key.includes("palette")), false, "the effective palette seam is not a public string-keyed API");
assert.equal(JSON.stringify(runtime).includes("internal-effective-palette"), false, "the private effective palette cannot serialize");
const projectionSymbol = Symbol.for("aerobeat.web-content.internal-render-projection");
const projectionDescriptor = Object.getOwnPropertyDescriptor(runtime, projectionSymbol);
assert.deepEqual({ enumerable: projectionDescriptor?.enumerable, writable: projectionDescriptor?.writable, configurable: projectionDescriptor?.configurable }, { enumerable: false, writable: false, configurable: false });
assert.equal(Object.keys(runtime).some((key) => key.includes("render")), false, "the internal renderer seam is not a public string-keyed API");
const defaultRenderEvents = runtime[projectionSymbol]();
assert.equal(defaultRenderEvents.some((event) => Object.hasOwn(event, "appearanceColor")), true);
assert.equal(defaultRenderEvents.find((event) => event.authoredBeat.type === "note")?.appearanceColor, "#2693FF");
assert.equal(Object.hasOwn(runtime.getSnapshot().resolvedEvents.find((event) => event.authoredBeat.type === "note"), "appearanceColor"), false);

const palettePackage = withPalette(basePackage, "#FF0000", "#808080");
const baseFlowIdentity = (await validateRuntimePackage(basePackage)).variants.find((variant) => variant.mode === "flow");
const paletteFlowIdentity = (await validateRuntimePackage(palettePackage)).variants.find((variant) => variant.mode === "flow");
assert.ok(baseFlowIdentity && paletteFlowIdentity);
assert.notDeepEqual(paletteFlowIdentity.mapHash, baseFlowIdentity.mapHash, "Flow visual hash may bind palette changes");
assert.deepEqual(paletteFlowIdentity.scoreIdentityHash, baseFlowIdentity.scoreIdentityHash, "Flow palette must not change scoring identity");
const [baseFlowCompositeIdentity, paletteFlowCompositeIdentity] = await Promise.all([composeRuntimeVariant(baseFlowIdentity, ["no_obstacles"], basePackage.packageId), composeRuntimeVariant(paletteFlowIdentity, ["no_obstacles"], palettePackage.packageId)]);
assert.deepEqual(paletteFlowCompositeIdentity.scoreIdentityHash, baseFlowCompositeIdentity.scoreIdentityHash, "runtime-composite Flow palette must not change scoring identity");
assert.notDeepEqual(paletteFlowCompositeIdentity.mapHash, baseFlowCompositeIdentity.mapHash, "runtime-composite visual hash may bind palette changes");
const paletteFlow = palettePackage.charts.find((chart) => chart.mode === "flow");
paletteFlow.beats = [
  { start: 1, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 },
  { start: 2, type: "note", hand: "right", placement: 7, requiresDirection: false, angleOffset: 0 },
  { start: 5, type: "bomb", placement: 6 },
  { start: 6, end: 7, type: "arc", hand: "left", startPlacement: 4, endPlacement: 5, startDirection: 1, endDirection: 1, headCurveMultiplier: 1, tailCurveMultiplier: 1, midAnchorMode: 0 },
  { start: 8, end: 9, type: "burst", hand: "right", placement: 7, direction: 0, tailPlacement: 6, checkpointCount: 3 },
  { start: 10, end: 11, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1,5,9] }
];
rehashFlow(palettePackage);
const paletteRuntime = createAeroContentRuntime();
await paletteRuntime.loadPackage({ package: palettePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
const paletteGeneration = paletteRuntime.getSnapshot().generation;
assert.deepEqual({ left:paletteRuntime[effectivePaletteSymbol](paletteGeneration)?.left, right:paletteRuntime[effectivePaletteSymbol](paletteGeneration)?.right }, { left: "#FF0000", right: "#808080" }, "the private palette seam exposes the exact validated song colors");
const paletteRenderEvents = paletteRuntime[projectionSymbol]();
assert.deepEqual(paletteRenderEvents.filter((event) => Object.hasOwn(event, "appearanceColor")).map((event) => event.appearanceColor), ["#FF0000", "#808080"]);
const privateLeft = paletteRenderEvents.find((event) => event.appearanceColor === "#FF0000");
const publicLeft = paletteRuntime.getSnapshot().resolvedEvents.find((event) => event.eventId === privateLeft?.eventId);
assert.deepEqual(Object.keys(privateLeft).filter((key) => !Object.keys(publicLeft).includes(key)), ["appearanceColor"], "private eligible events add exactly one appearance field");
const privateBomb = paletteRenderEvents.find((event) => event.authoredBeat.type === "bomb");
const publicBomb = paletteRuntime.getSnapshot().resolvedEvents.find((event) => event.eventId === privateBomb?.eventId);
assert.equal(privateBomb, publicBomb, "ineligible private events retain the exact public frozen event without added fields");
assert.equal(paletteRenderEvents.filter((event) => ["bomb", "arc", "burst", "obstacle"].includes(event.authoredBeat.type)).every((event) => !Object.hasOwn(event, "appearanceColor")), true);
const publicPaletteJson = JSON.stringify(paletteRuntime.getSnapshot());
for (const privateToken of ["#FF0000", "#808080", palettePackage.notePalette.paletteHash, "aerobeat/authored_note_palette", "difficulty_custom_data", "v2_custom"]) assert.equal(publicPaletteJson.includes(privateToken), false, `public snapshot must not leak ${privateToken}`);
const paletteFlowId = paletteRuntime.getSnapshot().selectedVariant.variantId;
paletteRuntime.setPlaybackState({ state: "paused", positionMs: 1_250 });
const preservedPaletteNote = paletteRuntime[projectionSymbol]().find((event) => event.centerTimestampMs < 1_250 && event.appearanceColor === "#FF0000");
await paletteRuntime.swapFutureVariant(paletteFlowId, { modifierIds: ["no_obstacles"] });
assert.equal(paletteRuntime[projectionSymbol]().some((event) => event.authoredBeat.type === "obstacle"), false);
assert.equal(paletteRuntime[projectionSymbol]().find((event) => event.eventId === preservedPaletteNote?.eventId)?.appearanceColor, "#FF0000", "future swaps retain the generation-effective palette without public leakage");
const paletteBoxingVariants = paletteRuntime.getSnapshot().variants.filter((variant) => variant.mode === "boxing");
assert.deepEqual(paletteBoxingVariants.map((variant)=>[variant.recipeId,variant.rulesetId,variant.rulesetId==="boxing_semantic_track_v1"?"boxing_lanes":"boxing_spatial_grid"]),BOXING_VARIANT_MATRIX,"exact positive matrix covers both Boxing Lanes and Grid in both recipe families");
await paletteRuntime.swapFutureVariant(paletteBoxingVariants[0].variantId);
assert.equal(paletteRuntime[projectionSymbol]().find((event) => event.eventId === preservedPaletteNote?.eventId)?.appearanceColor, "#FF0000", "cross-mode swaps retain appearance for preserved Flow notes");
for(const variant of paletteBoxingVariants){await paletteRuntime.selectVariant(variant.variantId);const events=paletteRuntime[projectionSymbol]().filter((event)=>event.variantId===variant.variantId);assert.deepEqual(events.filter((event)=>Object.hasOwn(event,"appearanceColor")).map((event)=>[event.authoredBeat.type,event.appearanceColor]),boxingColorExpectation("#FF0000","#808080"),`all six canonical punches use deterministic custom hand colors for ${variant.variantId}`);assert.deepEqual(events.filter((event)=>BOXING_FIXED_TYPES.includes(event.authoredBeat.type)).map((event)=>[event.authoredBeat.type,Object.hasOwn(event,"appearanceColor")]),BOXING_FIXED_TYPES.map((type)=>[type,false]),`guard and three Boxing obstacle types remain fixed-color for ${variant.variantId}`);}
const exactModeColorRows=[],exactModeFixedRows=[];for(const [mode,rulesetId] of [["boxing_lanes","boxing_semantic_track_v1"],["boxing_spatial_grid","boxing_spatial_grid_v1"]]){const variant=paletteBoxingVariants.find((entry)=>entry.rulesetId===rulesetId);assert.ok(variant,`${mode} acceptance variant exists`);await paletteRuntime.selectVariant(variant.variantId);const privateEvents=paletteRuntime[projectionSymbol](),publicSnapshot=paletteRuntime.getSnapshot();for(const {type} of BOXING_PUNCH_CASES){const event=privateEvents.find((entry)=>entry.authoredBeat.type===type);exactModeColorRows.push([mode,type,event?.appearanceColor??null]);}for(const type of ["guard","squat","weave_left","weave_right"]){const event=privateEvents.find((entry)=>entry.authoredBeat.type===type);exactModeFixedRows.push([mode,type,Object.hasOwn(event??{},"appearanceColor")]);}assert.equal(publicSnapshot.resolvedEvents.some((event)=>Object.hasOwn(event,"appearanceColor")),false,`${mode} public events omit private appearance`);assert.equal(JSON.stringify(publicSnapshot).includes(palettePackage.notePalette.paletteHash)||JSON.stringify(publicSnapshot).includes("#FF0000")||JSON.stringify(publicSnapshot).includes("#808080"),false,`${mode} public snapshot omits palette provenance and colors`);}assert.deepEqual(exactModeColorRows,BOXING_MODE_COLOR_ROWS,"explicit six punch types map exact left/right colors in Boxing Lanes and Grid");assert.deepEqual(exactModeFixedRows,BOXING_MODE_FIXED_ROWS,"explicit guard/squat/weave rows remain fixed in Boxing Lanes and Grid");
const stalePaletteEvents = paletteRuntime[projectionSymbol]();
await paletteRuntime.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
assert.equal(paletteRuntime[effectivePaletteSymbol](paletteGeneration), null, "a replaced generation cannot retain the prior song palette");
assert.notEqual(paletteRuntime[projectionSymbol](), stalePaletteEvents);
assert.equal(paletteRuntime[projectionSymbol]().some((event) => event.appearanceColor === "#FF0000" || event.appearanceColor === "#808080"), false, "successful package replacement resolves a fresh effective palette");
const destroyedPaletteGeneration = paletteRuntime.getSnapshot().generation;
paletteRuntime.destroy();
assert.deepEqual(paletteRuntime[projectionSymbol](), [], "destroy clears private render projection state");
assert.equal(paletteRuntime[effectivePaletteSymbol](destroyedPaletteGeneration), null, "destroy clears and invalidates the private effective palette");

const stalePaletteHash = structuredClone(withPalette(basePackage, "#00FF00", "#0000FF"));
stalePaletteHash.notePalette.left = "#FFFFFF";
await assert.rejects(() => validateRuntimePackage(stalePaletteHash), hasCode("note_palette_hash_mismatch"));
const mismatchedPaletteReference = structuredClone(withPalette(basePackage, "#00FF00", "#0000FF"));
mismatchedPaletteReference.charts.find((chart) => chart.mode === "flow").notePalette.paletteHash = `sha256:${"0".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(mismatchedPaletteReference), hasCode("flow_note_palette_mismatch"));
const mismatchedFlowHash = structuredClone(withPalette(basePackage, "#00FF00", "#0000FF"));
mismatchedFlowHash.charts.find((chart) => chart.mode === "flow").contentHash = `sha256:${"0".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(mismatchedFlowHash), hasCode("flow_content_hash_mismatch"));
const compatibleV2Beatmap = structuredClone(basePackage);
compatibleV2Beatmap.source.sourceBeatmapFormat = "v2";
compatibleV2Beatmap.source.sourceBeatmapVersion = "2.6.0";
compatibleV2Beatmap.conversionTrace.flow[0].sourceBeatmapFormat = "v2";
compatibleV2Beatmap.conversionTrace.flow[0].sourceBeatmapVersion = "2.6.0";
await validateRuntimePackage(compatibleV2Beatmap);
const compatibleV4NullVersions = structuredClone(basePackage);
compatibleV4NullVersions.source.sourceInfoFormat = "v4";
compatibleV4NullVersions.source.sourceInfoVersion = null;
compatibleV4NullVersions.source.sourceBeatmapFormat = "v4";
compatibleV4NullVersions.source.sourceBeatmapVersion = null;
compatibleV4NullVersions.conversionTrace.flow[0].sourceInfoFormat = "v4";
compatibleV4NullVersions.conversionTrace.flow[0].sourceInfoVersion = null;
compatibleV4NullVersions.conversionTrace.flow[0].sourceBeatmapFormat = "v4";
compatibleV4NullVersions.conversionTrace.flow[0].sourceBeatmapVersion = null;
await validateRuntimePackage(compatibleV4NullVersions);
const mismatchedFlowSourceTrace = structuredClone(basePackage); mismatchedFlowSourceTrace.conversionTrace.flow[0].sourceDifficultyHash = `sha256:${"9".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(mismatchedFlowSourceTrace), hasCode("flow_trace_invalid"), "Flow trace must agree with exact package source provenance");
for (const [infoFormat, beatmapFormat] of [["v2", "v4"], ["v4", "v2"], ["v4", "v3"]]) {
  const incompatibleFormats = structuredClone(basePackage);
  incompatibleFormats.source.sourceInfoFormat = infoFormat;
  incompatibleFormats.source.sourceBeatmapFormat = beatmapFormat;
  await assert.rejects(() => validateRuntimePackage(incompatibleFormats), hasCode("source_format_provenance_invalid"), `${infoFormat} Info cannot pair with ${beatmapFormat} beatmap format`);
}
for (const [field, value] of [["sourceInfoVersion", "2.1"], ["sourceInfoVersion", 2.1], ["sourceBeatmapVersion", "3"], ["sourceBeatmapVersion", false]]) {
  const invalidVersion = structuredClone(basePackage);
  invalidVersion.source[field] = value;
  await assert.rejects(() => validateRuntimePackage(invalidVersion), hasCode("source_format_provenance_invalid"), `${field} must be null or an exact semantic version`);
}
const mismatchedPaletteSource = structuredClone(withPalette(basePackage, "#00FF00", "#0000FF"));
mismatchedPaletteSource.source.sourceInfoHash = `sha256:${"9".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(mismatchedPaletteSource), hasCode("note_palette_provenance_mismatch"));
const mismatchedPaletteDifficulty = structuredClone(withPalette(basePackage, "#00FF00", "#0000FF"));
mismatchedPaletteDifficulty.source.sourceDifficultyHash = `sha256:${"8".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(mismatchedPaletteDifficulty), hasCode("note_palette_provenance_mismatch"));
const mismatchedPaletteTrace = structuredClone(withPalette(basePackage, "#00FF00", "#0000FF"));
mismatchedPaletteTrace.conversionTrace.notePalette = null;
await assert.rejects(() => validateRuntimePackage(mismatchedPaletteTrace), hasCode("note_palette_trace_mismatch"));
const mismatchedFlowTraceHash = structuredClone(basePackage);
mismatchedFlowTraceHash.conversionTrace.flow[0].contentHash = `sha256:${"0".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(mismatchedFlowTraceHash), hasCode("flow_trace_content_hash_mismatch"));
const boxingPalette = structuredClone(basePackage); boxingPalette.charts.find((chart) => chart.mode === "boxing").notePalette = null;
await assert.rejects(() => validateRuntimePackage(boxingPalette), hasCode("boxing_palette_forbidden"));
const authoredAppearance = structuredClone(basePackage); authoredAppearance.charts.find((chart) => chart.mode === "flow").beats[0].appearanceColor = "#FFFFFF";
await assert.rejects(() => validateRuntimePackage(authoredAppearance), hasCode("authored_appearance_forbidden"));
const boxingBeatPalette = structuredClone(basePackage); boxingBeatPalette.charts.find((chart) => chart.mode === "boxing").beats[0].paletteHash = `sha256:${"0".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(boxingBeatPalette), hasCode("boxing_palette_forbidden"));
const songPaletteLeak = structuredClone(basePackage); songPaletteLeak.song.paletteHash = `sha256:${"0".repeat(64)}`;
await assert.rejects(() => validateRuntimePackage(songPaletteLeak), hasCode("song_palette_forbidden"));
let paletteAccessorCalls = 0;
const accessorPalettePackage = withPalette(basePackage, "#00FF00", "#0000FF");
Object.defineProperty(accessorPalettePackage.notePalette, "left", { enumerable: true, get() { paletteAccessorCalls += 1; return "#00FF00"; } });
await assert.rejects(() => validateRuntimePackage(accessorPalettePackage), hasCode("data_record_invalid"));
assert.equal(paletteAccessorCalls, 0, "palette accessors must never execute");

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
replaceSpawnTiming(intervalPackage,{...spawnTiming,bpm:150,halfJumpDurationBeats:5,reactionTimeMs:2000,jumpDistanceMeters:40});
const intervalFlowChart = intervalPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(intervalFlowChart);
intervalFlowChart.beats = [
  { start: 1, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 },
  { start: 2, end: 3, type: "arc", hand: "left", startPlacement: 4, endPlacement: 5, startDirection: 1, endDirection: 1, headCurveMultiplier: 1, tailCurveMultiplier: 1, midAnchorMode: 0 },
  { start: 4, end: 4.5, type: "burst", hand: "right", placement: 7, direction: 0, tailPlacement: 6, checkpointCount: 3 },
  { start: 74.5999984741211, end: 74.6624984741211, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1,5,9] }
];
rehashFlow(intervalPackage);
const intervalRuntime = createAeroContentRuntime();
await intervalRuntime.loadPackage({ package: intervalPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
const intervalSnapshot = intervalRuntime.getSnapshot();
const noteEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "note");
const arcEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "arc");
const burstEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "burst");
const obstacleEvent = intervalSnapshot.resolvedEvents.find((event) => event.authoredBeat.type === "obstacle");
assert.ok(noteEvent && arcEvent && burstEvent && obstacleEvent);
assert.equal(noteEvent.version, 3);
assert.deepEqual(Object.keys(noteEvent), ["schema", "version", "eventId", "variantId", "chartId", "centerTimestampMs", "authoredBeat"], "instant event envelope remains byte-shape compatible");
assert.equal(Object.hasOwn(noteEvent, "intervalEndTimestampMs"), false);
assert.equal(arcEvent.intervalEndTimestampMs, 1200);
assert.equal(burstEvent.intervalEndTimestampMs, 1800);
assert.equal(obstacleEvent.centerTimestampMs, 29839.999389648438);
assert.equal(obstacleEvent.intervalStartTimestampMs, obstacleEvent.centerTimestampMs);
assert.equal(obstacleEvent.intervalEndTimestampMs, 29864.999389648438);
assert.equal(Object.isFrozen(obstacleEvent), true);
assert.equal(Object.isFrozen(obstacleEvent.authoredBeat), true);
assert.deepEqual(JSON.parse(JSON.stringify(obstacleEvent)).authoredBeat.gridMask, [1,5,9]);
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
const segmentedPackage = structuredClone(basePackage);
segmentedPackage.song.timing = { anchorMs: 250, tempoSegments: [{ startBeat: 0, bpm: 120 }, { startBeat: 4, bpm: 60 }, { startBeat: 8, bpm: 240 }], stopSegments: [{ startBeat: 2, durationMs: 125 }, { startBeat: 6, durationMs: 375 }], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] };
const segmentedFlow = segmentedPackage.charts.find((chart) => chart.mode === "flow");
segmentedFlow.beats = [{ start: 2, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 }, { start: 3, end: 9, type: "arc", hand: "left", startPlacement: 4, endPlacement: 5, startDirection: 1, endDirection: 1, headCurveMultiplier: 1, tailCurveMultiplier: 1, midAnchorMode: 0 }];
rehashFlow(segmentedPackage);
const segmentedRuntime = createAeroContentRuntime();
await segmentedRuntime.loadPackage({ package: segmentedPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
assert.deepEqual(segmentedRuntime.getSnapshot().resolvedEvents.map((event) => [event.centerTimestampMs, event.intervalEndTimestampMs ?? null]), [[1375, null], [1875, 7000]], "resolved center/end use one snapshotted anchor/tempo/stop mapper");
for (const mutateTiming of [
  (timing) => { timing.tempoSegments = [{ startBeat: 0, bpm: 120 }, { startBeat: 0, bpm: 90 }]; },
  (timing) => { timing.stopSegments = [{ startBeat: 3, durationMs: 10 }, { startBeat: 2, durationMs: 20 }]; }
]) {
  const malformedTimingPackage = structuredClone(basePackage); mutateTiming(malformedTimingPackage.song.timing);
  await assert.rejects(() => validateRuntimePackage(malformedTimingPackage), hasCode("song_timing_invalid"));
}
const nonFiniteTimingPackage = structuredClone(basePackage); nonFiniteTimingPackage.song.timing.anchorMs = Number.NaN;
await assert.rejects(() => validateRuntimePackage(nonFiniteTimingPackage), hasCode("number_invalid"));
const exactStopCapacityPackage = structuredClone(basePackage);
exactStopCapacityPackage.song.timing.stopSegments = Array.from({ length: 4_096 }, (_, index) => ({ startBeat: index / 2, durationMs: 1 }));
await validateRuntimePackage(exactStopCapacityPackage);
const excessiveStopCapacityPackage = structuredClone(exactStopCapacityPackage);
excessiveStopCapacityPackage.song.timing.stopSegments.push({ startBeat: 2_048, durationMs: 1 });
await assert.rejects(() => validateRuntimePackage(excessiveStopCapacityPackage), hasCode("song_timing_invalid"), "timing segment capacity must fail closed above the contract limit");
const exactAnchorBoundaryPackage = structuredClone(basePackage);
exactAnchorBoundaryPackage.song.timing.anchorMs = 100;
exactAnchorBoundaryPackage.charts.find((chart) => chart.mode === "flow").beats = [{ start: 172799.8, type: "note", hand: "right", placement: 4, requiresDirection: false, angleOffset: 0 }];
rehashFlow(exactAnchorBoundaryPackage);
const exactAnchorBoundaryRuntime = createAeroContentRuntime();
await exactAnchorBoundaryRuntime.loadPackage({ package: exactAnchorBoundaryPackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
assert.equal(exactAnchorBoundaryRuntime.getSnapshot().resolvedEvents[0].centerTimestampMs, maximumAuthoredTimelineMs, "inclusive 24-hour anchor boundary is accepted");
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
backwardsFlow.beats = [{ start: 2, end: 1, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1,5,9] }];
await assert.rejects(() => validateRuntimePackage(backwardsIntervalPackage), hasCode("event_interval_invalid"));
const maskMismatchPackage = structuredClone(basePackage);
maskMismatchPackage.charts.find((chart) => chart.mode === "flow").beats = [{ start: 1, end: 2, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1] }];
await assert.rejects(() => validateRuntimePackage(maskMismatchPackage), hasCode("flow_obstacle_invalid"));
for(const mutate of [(beat)=>{beat.sourceGeometry.x=4;},(beat)=>{beat.gridMask=[0];},(beat)=>{beat.blockedCells=[0];},(beat)=>{beat.checkpoint.noseSafeCells=[0];},(beat)=>{beat.type="weave_left";}]){const mismatch=structuredClone(basePackage),boxingChart=mismatch.charts.find((chart)=>chart.mode==="boxing"),boxingObstacle=boxingChart.beats.find((beat)=>beat.type==="squat");mutate(boxingObstacle);await assert.rejects(()=>validateRuntimePackage(mismatch),hasCode("boxing_obstacle_invalid"),"Boxing interval, geometry, action, mask, blocked cells, and checkpoint must fail atomically on disagreement");}
const tooManyObstacles = structuredClone(basePackage);
tooManyObstacles.charts.find((chart) => chart.mode === "flow").beats = Array.from({ length: 129 }, (_, index) => ({ start: index, end: index + 0.5, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1,5,9] }));
await assert.rejects(() => validateRuntimePackage(tooManyObstacles), hasCode("flow_obstacle_limit_exceeded"));
const exactObstacleLimit = structuredClone(tooManyObstacles);
exactObstacleLimit.charts.find((chart) => chart.mode === "flow").beats.pop();
rehashFlow(exactObstacleLimit);
await validateRuntimePackage(exactObstacleLimit);
const legacyPackage = structuredClone(basePackage); legacyPackage.schemaId = "aerobeat.song-package.v1"; legacyPackage.schemaVersion = 1; legacyPackage.packageVersion = "1.0.0";
await assert.rejects(() => validateRuntimePackage(legacyPackage), hasCode("spawn_timing_reimport_required"));
const versionTwoPackage = structuredClone(basePackage); versionTwoPackage.schemaId = "aerobeat.song-package.v2"; versionTwoPackage.schemaVersion = 2; versionTwoPackage.packageVersion = "2.0.0";
await assert.rejects(() => validateRuntimePackage(versionTwoPackage), hasCode("spawn_timing_reimport_required"));
const versionThreePackage = structuredClone(basePackage); versionThreePackage.schemaId = "aerobeat.song-package.v3"; versionThreePackage.schemaVersion = 3; versionThreePackage.packageVersion = "3.0.0";
await assert.rejects(() => validateRuntimePackage(versionThreePackage), hasCode("spawn_timing_reimport_required"));
const versionFourPackage = structuredClone(basePackage); versionFourPackage.schemaId = "aerobeat.song-package.v4"; versionFourPackage.schemaVersion = 4; versionFourPackage.packageVersion = "4.0.0";
await assert.rejects(() => validateRuntimePackage(versionFourPackage), hasCode("spawn_timing_reimport_required"));
const versionFivePackage = structuredClone(basePackage); versionFivePackage.schemaId = "aerobeat.song-package.v5"; versionFivePackage.schemaVersion = 5; versionFivePackage.packageVersion = "5.0.0";
await assert.rejects(() => validateRuntimePackage(versionFivePackage), hasCode("flow_colliders_reimport_required"), "the successor runtime never promotes historical v5 bytes");
for(const [mutate,code] of [[(value)=>{delete value.source.spawnTiming.noteJumpStartBeatOffset;},"spawn_timing_invalid"],[(value)=>{value.source.spawnTiming.extra=true;},"spawn_timing_invalid"],[(value)=>{value.source.spawnTiming.reactionTimeMs+=1;},"spawn_timing_mismatch"],[(value)=>{value.source.spawnTiming.noteJumpMovementSpeed=0;},"spawn_timing_njs_invalid"],[(value)=>{value.source.spawnTiming.bpm=0;},"spawn_timing_bpm_invalid"]]){const invalid=structuredClone(basePackage);mutate(invalid);await assert.rejects(()=>validateRuntimePackage(invalid),hasCode(code));}
const traceTimingMismatch=structuredClone(basePackage);traceTimingMismatch.conversionTrace.boxing[0].spawnTiming.reactionTimeMs+=1;await assert.rejects(()=>validateRuntimePackage(traceTimingMismatch),hasCode("spawn_timing_trace_mismatch"));
const shadowedResolvedField = structuredClone(basePackage);
shadowedResolvedField.charts.find((chart) => chart.mode === "flow").beats[0].centerTimestampMs = 500;
rehashFlow(shadowedResolvedField);
const shadowRuntime = createAeroContentRuntime();
await assert.rejects(() => shadowRuntime.loadPackage({ package: shadowedResolvedField, assets: [{ path: "song.ogg", bytes: audioBytes }] }), hasCode("flow_event_shape_invalid"));
assert.equal(shadowRuntime.getSnapshot().state, "error");
const startOverflowPackage = structuredClone(basePackage);
const startOverflowFlow = startOverflowPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(startOverflowFlow);
startOverflowFlow.beats = [{ start: 1e308, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 }];
await assert.rejects(() => validateRuntimePackage(startOverflowPackage), hasCode("event_timeline_invalid"), "finite authored start that derives Infinity must reject before publication");
const endOverflowPackage = structuredClone(basePackage);
const endOverflowFlow = endOverflowPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(endOverflowFlow);
endOverflowFlow.beats = [{ start: 0, end: 1e308, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1,5,9] }];
await assert.rejects(() => validateRuntimePackage(endOverflowPackage), hasCode("event_timeline_invalid"), "finite authored end that derives Infinity must reject before publication");
const boundaryPackage = structuredClone(basePackage);
boundaryPackage.song.durationSec = 86_400;
const boundaryFlow = boundaryPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(boundaryFlow);
boundaryFlow.beats = [{ start: 172_800, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 }, { start: 172_799, end: 172_800, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1,5,9] }];
rehashFlow(boundaryPackage);
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
centerPastBoundaryFlow.beats = [{ start: 172_800.000001, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 }];
await assert.rejects(() => validateRuntimePackage(centerPastBoundaryPackage), hasCode("event_timeline_invalid"), "center immediately after 24 hours rejects");
const endPastBoundaryPackage = structuredClone(basePackage);
const endPastBoundaryFlow = endPastBoundaryPackage.charts.find((chart) => chart.mode === "flow");
assert.ok(endPastBoundaryFlow);
endPastBoundaryFlow.beats = [{ start: 172_799, end: 172_800.000001, type: "obstacle", sourceGeometry, gameplayGeometry, gridMask: [1,5,9] }];
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
const boxingRenderEvents=runtime[projectionSymbol]();assert.deepEqual(boxingRenderEvents.filter((event)=>Object.hasOwn(event,"appearanceColor")).map((event)=>[event.authoredBeat.type,event.appearanceColor]),boxingColorExpectation("#2693FF","#39C96B"),"all six canonical Boxing punches receive deterministic fallback colors");assert.deepEqual(boxingRenderEvents.filter((event)=>BOXING_FIXED_TYPES.includes(event.authoredBeat.type)).map((event)=>[event.authoredBeat.type,Object.hasOwn(event,"appearanceColor")]),[["guard",false],["weave_left",false],["weave_right",false]],"Boxing guard and retained body obstacles remain fixed-color under modifiers");assert.equal(snapshot.resolvedEvents.every((event)=>!Object.hasOwn(event,"appearanceColor")),true,"Boxing appearance remains private to the renderer projection");
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
badChartPackage.charts[0].beats[2].spatialTarget.targetCell = 6;
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
const paletteExternalHash = hashJson(palettePackage);
const paletteExternalUrl = "https://community.example/maps/palette-package.json";
const paletteExternalRuntime = createAeroContentRuntime({ fetch: async (url) => String(url) === paletteExternalUrl
  ? new Response(JSON.stringify({ package: palettePackage, packageHash: `sha256:${paletteExternalHash}`, assets: [{ path: "song.ogg", url: externalAudioUrl, hash: `sha256:${audioHash}` }] }), { status: 200 })
  : new Response(audioBytes, { status: 200 }) });
await paletteExternalRuntime.loadExternalPackage(paletteExternalUrl);
assert.deepEqual(paletteExternalRuntime[projectionSymbol]().filter((event) => Object.hasOwn(event, "appearanceColor")).map((event) => event.appearanceColor), ["#FF0000", "#808080"], "external URL loading resolves the same private palette projection");
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
const paletteExportBytes = makeAeroPackage(palettePackage, paletteExternalHash, [{ path: "song.ogg", bytes: audioBytes, hash: audioHash }]);
const paletteHandle = Object.freeze({ ...handle, key: "palette-package", packageId: palettePackage.packageId, packageHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: paletteExternalHash } });
const palettePersistenceRuntime = createAeroContentRuntime({ persistenceResolver: { async exportPackage() { return paletteExportBytes; } } });
await palettePersistenceRuntime.loadPersistenceHandle(paletteHandle);
assert.deepEqual(palettePersistenceRuntime[projectionSymbol]().filter((event) => Object.hasOwn(event, "appearanceColor")).map((event) => event.appearanceColor), ["#FF0000", "#808080"], "AEROPKG persistence loading resolves the same private palette projection");
const paletteFallbackRuntime = createAeroContentRuntime({ persistenceResolver: { async loadPackage() { return { package: palettePackage, assetPaths: ["song.ogg"] }; }, async readAsset() { return audioBytes; } } });
await paletteFallbackRuntime.loadPersistenceHandle(paletteHandle, { assetHashes: { "song.ogg": audioHash } });
assert.deepEqual(paletteFallbackRuntime[projectionSymbol]().filter((event) => Object.hasOwn(event, "appearanceColor")).map((event) => event.appearanceColor), ["#FF0000", "#808080"], "fallback persistence loading resolves the same private palette projection");
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

let releaseTimingReload;
const delayedTimingReload = new Promise((resolve) => { releaseTimingReload = resolve; });
const timingLifecycle = createAeroContentRuntime({ fetch: async (url) => {
  if (String(url).endsWith("package.json")) { await delayedTimingReload; return new Response(JSON.stringify({ package: basePackage, assets: [{ path: "song.ogg", url: "https://timing.example/song.ogg", hash: audioHash }] }), { status: 200 }); }
  return new Response(audioBytes, { status: 200 });
} });
await timingLifecycle.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
const priorTimingGeneration = timingLifecycle.getSnapshot().generation;
const priorTimingMapper = timingLifecycle[timingMapperSymbol](priorTimingGeneration);
const timingReload = timingLifecycle.loadExternalPackage("https://timing.example/package.json");
assert.equal(timingLifecycle.getSnapshot().state, "loading");
assert.equal(timingLifecycle[timingMapperSymbol](priorTimingGeneration), null, "starting a new generation immediately invalidates its prior mapper");
releaseTimingReload();
await timingReload;
const replacementTimingGeneration = timingLifecycle.getSnapshot().generation;
assert.notEqual(timingLifecycle[timingMapperSymbol](replacementTimingGeneration), priorTimingMapper, "a replacement generation owns a freshly snapshotted mapper");
timingLifecycle.destroy();
assert.equal(timingLifecycle[timingMapperSymbol](replacementTimingGeneration), null, "destroy invalidates the current mapper");

let releaseFirst;
const delayed = new Promise((resolve) => { releaseFirst = resolve; });
const replacing = createAeroContentRuntime({ fetch: async (url) => {
  if (String(url).includes("first")) { await delayed; return new Response(JSON.stringify({ package: palettePackage, assets: [{ path: "song.ogg", url: "https://example.invalid/song.ogg", hash: audioHash }] }), { status: 200 }); }
  if (String(url).endsWith("song.ogg")) return new Response(audioBytes, { status: 200 });
  return new Response(JSON.stringify({ package: basePackage, assets: [{ path: "song.ogg", url: "https://example.invalid/song.ogg", hash: audioHash }] }), { status: 200 });
} });
const first = replacing.loadExternalPackage("https://example.invalid/first.json");
const second = replacing.loadExternalPackage("https://example.invalid/second.json");
releaseFirst();
await assert.rejects(() => first, hasCode("operation_aborted"));
await second;
assert.equal(replacing.getSnapshot().source.id, "https://example.invalid/second.json");
assert.equal(replacing[projectionSymbol]().some((event) => event.appearanceColor === "#FF0000" || event.appearanceColor === "#808080"), false, "a stale palette-bearing load cannot overwrite the current generation");
const selectionRace = createAeroContentRuntime();
await selectionRace.loadPackage({ package: palettePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
const staleSelection = selectionRace.selectVariant(selectionRace.getSnapshot().selectedVariant.variantId, { modifierIds: ["no_obstacles"] });
const staleSelectionRejected = assert.rejects(() => staleSelection, hasCode("operation_aborted"));
await selectionRace.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
await staleSelectionRejected;
assert.equal(selectionRace[projectionSymbol]().some((event) => event.appearanceColor === "#FF0000" || event.appearanceColor === "#808080"), false, "stale async variant composition cannot republish a prior generation palette");
const swapRace = createAeroContentRuntime();
await swapRace.loadPackage({ package: palettePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
swapRace.setPlaybackState({ state: "paused", positionMs: 0 });
const staleSwap = swapRace.swapFutureVariant(swapRace.getSnapshot().selectedVariant.variantId, { modifierIds: ["no_obstacles"] });
const staleSwapRejected = assert.rejects(() => staleSwap, hasCode("operation_aborted"));
await swapRace.loadPackage({ package: basePackage, assets: [{ path: "song.ogg", bytes: audioBytes }] });
await staleSwapRejected;
assert.equal(swapRace[projectionSymbol]().some((event) => event.appearanceColor === "#FF0000" || event.appearanceColor === "#808080"), false, "stale future swaps cannot republish a prior generation palette");

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
function boxingColorExpectation(left,right){return BOXING_PUNCH_CASES.map(({type,hand})=>[type,hand==="left"?left:right]);}
function hashBytes(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
/** @param {unknown} value */
function hashJson(value) { return hashBytes(new TextEncoder().encode(canonical(value))); }
/** @param {unknown} value */
function canonical(value) { return JSON.stringify(sort(value)); }
/** @param {unknown} value @returns {unknown} */
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value).sort()) result[key] = sort(value[key]); return result; } return value; }
/** @param {Record<string, unknown>} packageRecord @param {string} left @param {string} right */
function withPalette(packageRecord, left, right) {
  const result = structuredClone(packageRecord);
  const base = { schema: "aerobeat/authored_note_palette", version: 1, left, right, colorSpace: "srgb", alpha: 1, provenance: { kind: "difficulty_custom_data", infoFormat: "v2", infoHash: `sha256:${"1".repeat(64)}`, difficultyHash: `sha256:${"2".repeat(64)}`, fieldSet: "v2_custom", schemeIndex: null } };
  result.notePalette = { ...base, paletteHash: `sha256:${hashJson(base)}` };
  result.charts.find((chart) => chart.mode === "flow").notePalette = { source: "package", paletteHash: result.notePalette.paletteHash };
  rehashFlow(result);
  return result;
}
/** @param {Record<string, unknown>} packageRecord */
function rehashFlow(packageRecord) {
  const flow = packageRecord.charts.find((chart) => chart.mode === "flow");
  flow.contentHash = `sha256:${hashJson({ beats: flow.beats, rulesetId: flow.rulesetId, rulesetVariants: flow.rulesetVariants, notePalette: flow.notePalette })}`;
  if (packageRecord.conversionTrace) {
    packageRecord.conversionTrace.notePalette = flow.notePalette;
    if (Array.isArray(packageRecord.conversionTrace.flow) && packageRecord.conversionTrace.flow[0]) {
      packageRecord.conversionTrace.flow[0].notePalette = flow.notePalette;
      packageRecord.conversionTrace.flow[0].contentHash = flow.contentHash;
    }
  }
}
/** @param {Record<string, unknown>} packageRecord @param {number} eventCount */
function packageWithFlowEvents(packageRecord, eventCount) {
  const result = structuredClone(packageRecord);
  const charts = /** @type {Record<string, unknown>[]} */ (result.charts);
  const flow = charts.find((chart) => chart.mode === "flow");
  if (!flow) throw new Error("flow fixture missing");
  flow.beats = Array.from({ length: eventCount }, (_, index) => ({ start: index / 4, type: "note", hand: index % 2 === 0 ? "left" : "right", placement: index % 12, requiresDirection: index % 9 !== 8, angleOffset: 0, ...(index % 9 === 8 ? {} : { direction: index % 9 }) }));
  rehashFlow(result);
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
      { start: 1, end: 2, type: "squat", eventId: `${token}-squat`, sourceEventIds: ["source-squat"], sourceGeometry: { schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v3_obstacle_rect",kind:"v3_rect",x:0,y:2,width:4,height:1 }, gameplayGeometry: { schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:0,y:0,width:4,height:1 }, gridMask: [0, 1, 2, 3], blockedCells: [0, 1, 2, 3], checkpoint: { kind: "instantaneous", freshnessMs: 150, timingWindowMs: 180, noseSafeCells: [4, 5, 6, 7, 8, 9, 10, 11] } },
      { start: 2, type: "guard", eventId: `${token}-guard`, sourceEventIds: ["source-guard"], guardTarget: { leftCell: 4, rightCell: 7 }, checkpoint: { kind: "instantaneous" } },
      ...BOXING_PUNCH_CASES.map(({type,hand},index)=>({ start:3+index,type,eventId:`${token}-${type}`,sourceEventIds:[`source-${type}`],spatialTarget:{targetCell:hand==="left"?5:6,acceptedSubcells:hand==="left"?[20,21]:[26,27],sourceCell:hand==="left"?9:5,...(hand==="left"?{qualificationMs:100}:{entryDirection:"left"})} })),
      { start: 9, end: 10, type: "weave_left", eventId: `${token}-weave-left`, sourceEventIds: ["source-weave-left"], sourceGeometry: { schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v3_obstacle_rect",kind:"v3_rect",x:3,y:0,width:1,height:3 }, gameplayGeometry: { schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:3,y:0,width:1,height:3 }, gridMask: [3,7,11], blockedCells: [3,7,11], checkpoint: { kind: "instantaneous", freshnessMs: 150, timingWindowMs: 180, noseSafeCells: [0,1,2,4,5,6,8,9,10] } },
      { start: 10, end: 11, type: "weave_right", eventId: `${token}-weave-right`, sourceEventIds: ["source-weave-right"], sourceGeometry: { schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v3_obstacle_rect",kind:"v3_rect",x:0,y:0,width:1,height:3 }, gameplayGeometry: { schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:0,y:0,width:1,height:3 }, gridMask: [0,4,8], blockedCells: [0,4,8], checkpoint: { kind: "instantaneous", freshnessMs: 150, timingWindowMs: 180, noseSafeCells: [1,2,3,5,6,7,9,10,11] } }
    ];
    const contentHash = hashJson({ beats, recipeId, rulesetId, sourceHash, ...(converterProfile ? { converterProfile } : {}) });
    charts.push({ schemaId: "aerobeat.chart.boxing.v1", schemaVersion: 1, recordVersion: 1, chartId: `chart-${token}`, chartName: token, mode: "boxing", difficulty: "Expert", prototype: { contractId: "aerobeat.boxing.prototype.v1", recipeId, recipeVersion: "1.0.0", rulesetId, rulesetVersion: "1.0.0", sourceHash, recipeHash: `sha256:${"1".repeat(64)}`, rulesetHash: `sha256:${"2".repeat(64)}`, contentHash: `sha256:${contentHash}`, modifiers: [], ...(converterProfile ? { converterProfile: structuredClone(converterProfile) } : {}), regenerationRequiredFor: [] }, beats });
  }
  const flowBeats = [{ start: 1, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 }];
  const flowChart = { schemaId: "aerobeat.chart.flow.v5", schemaVersion: 5, recordVersion: 2, rulesetId: "flow_grid_v2", rulesetVariants: ["flow_grid_v2", "flow_colliders_v1"], chartId: "chart-flow", chartName: "Flow", mode: "flow", difficulty: "Expert", notePalette: null, contentHash: `sha256:${hashJson({ beats: flowBeats, rulesetId: "flow_grid_v2", rulesetVariants: ["flow_grid_v2", "flow_colliders_v1"], notePalette: null })}`, beats: flowBeats };
  charts.push(flowChart);
  return {
    schemaId: "aerobeat.song-package.v6", schemaVersion: 6, packageVersion: "6.0.0", packageId: "package-arbitrary-compatible", songId: "song-arbitrary", songName: "Arbitrary Compatible Map", notePalette: null,
    source: { provider: "community", sourceId: "not-an-allowlist-id", sourceVersionHash: "source-version", difficulty: "Expert", sourceInfoFormat: "v2", sourceInfoVersion: "2.1.0", sourceInfoHash: `sha256:${"1".repeat(64)}`, sourceDifficultyPath: "Expert.dat", sourceBeatmapFormat: "v3", sourceBeatmapVersion: "3.3.0", sourceDifficultyHash: `sha256:${"2".repeat(64)}`, sourceHash, spawnTiming: structuredClone(spawnTiming), obstacleContract: "normalized_obstacle_v2", ...(converterProfile ? { converterProfile: structuredClone(converterProfile) } : {}) },
    song: { schemaId: "aerobeat.song.v1", schemaVersion: 1, recordVersion: 1, songId: "song-arbitrary", songName: "Arbitrary Compatible Map", durationSec: 10, audio: { filePath: "song.ogg", contentHash: `sha256:${declaredAudioHash}` }, timing: { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] } },
    charts,
    sets: charts.map((chart, index) => ({ schemaId: "aerobeat.set.v1", schemaVersion: 1, recordVersion: 1, setId: `set-${index}`, setName: chart.chartName, songId: "song-arbitrary", chartId: chart.chartId })),
    recipeDefinitions: [], rulesetDefinitions: [], conversionTrace: { notePalette: null, spawnTiming: structuredClone(spawnTiming), boxing: charts.filter((chart) => chart.mode === "boxing").map((chart) => ({ chartId: chart.chartId, spawnTiming: structuredClone(spawnTiming), ...(converterProfile ? { converterProfile: structuredClone(converterProfile) } : {}) })), flow: [{ difficulty: "Expert", events: [], obstacleContract: "normalized_obstacle_v2", rulesetId: "flow_grid_v2", rulesetVariants: ["flow_grid_v2", "flow_colliders_v1"], sourceHash, sourceInfoFormat: "v2", sourceInfoVersion: "2.1.0", sourceInfoHash: `sha256:${"1".repeat(64)}`, sourceDifficultyPath: "Expert.dat", sourceBeatmapFormat: "v3", sourceBeatmapVersion: "3.3.0", sourceDifficultyHash: `sha256:${"2".repeat(64)}`, spawnTiming: structuredClone(spawnTiming), notePalette: null, contentHash: flowChart.contentHash }], ...(converterProfile ? { converterProfile: structuredClone(converterProfile) } : {}) }, presentationSuggestion: null
  };
}
/** @param {Uint8Array} bytes @param {(metadata: Record<string, unknown>) => Record<string, unknown>} transform */
function rewriteAeroMetadata(bytes, transform) { const originalLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8, true); const original = /** @type {Record<string, unknown>} */ (JSON.parse(new TextDecoder().decode(bytes.slice(12, 12 + originalLength)))); const metadata = new TextEncoder().encode(canonical(transform(original))); const payload = bytes.slice(12 + originalLength); const output = new Uint8Array(12 + metadata.byteLength + payload.byteLength); output.set(new TextEncoder().encode("AEROPKG1")); new DataView(output.buffer).setUint32(8, metadata.byteLength, true); output.set(metadata, 12); output.set(payload, 12 + metadata.byteLength); return output; }
/** @param {Record<string, unknown>} packageValue @param {Record<string, unknown>} value */
function replaceSpawnTiming(packageValue,value){packageValue.source.spawnTiming=structuredClone(value);packageValue.conversionTrace.spawnTiming=structuredClone(value);for(const trace of [...packageValue.conversionTrace.boxing,...packageValue.conversionTrace.flow])trace.spawnTiming=structuredClone(value);}
/** @param {Record<string, unknown>} packageRecord @param {Uint8Array} audio @param {string} declaredAudioHash */
async function verifyFlowAdmissionSecurity(packageRecord, audio, declaredAudioHash) {
  const eventPackage = structuredClone(packageRecord);
  const flow = eventPackage.charts.find((chart) => chart.mode === "flow");
  flow.beats = [
    { start: 1, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 },
    { start: 2, type: "bomb", placement: 7 },
    { start: 3, end: 4, type: "arc", hand: "right", startPlacement: 7, endPlacement: 6, startDirection: 1, endDirection: 0, headCurveMultiplier: 1, tailCurveMultiplier: 0.75, midAnchorMode: 1, startNoteRef: "flow-note-start", endNoteRef: "flow-note-end" },
    { start: 5, end: 6, type: "burst", hand: "left", placement: 4, direction: 1, tailPlacement: 5, checkpointCount: 3, spacingBias: 0.5 },
    { start: 7, end: 8, type: "obstacle", sourceGeometry: structuredClone(sourceGeometry), gameplayGeometry: structuredClone(gameplayGeometry), gridMask: [1,5,9] }
  ];
  rehashFlow(eventPackage);
  const validRuntime = createAeroContentRuntime();
  await validRuntime.loadPackage({ package: eventPackage, packageHash: `sha256:${hashJson(eventPackage)}`, assets: [{ path: "song.ogg", bytes: audio }] });
  assert.equal(validRuntime.getSnapshot().variants.length, 6);
  const validFlowVariants = validRuntime.getSnapshot().variants.filter((variant) => variant.mode === "flow");
  const gridEvents = validRuntime.getSnapshot().resolvedEvents;
  await validRuntime.selectVariant(validFlowVariants[1].variantId);
  const colliderEvents = validRuntime.getSnapshot().resolvedEvents;
  assert.equal(colliderEvents.every((event, index) => event.authoredBeat === gridEvents[index].authoredBeat), true, "strict Flow admission preserves shared immutable authored event identity");
  for (const snapshot of [validRuntime.getSnapshot(), { resolvedEvents: gridEvents }]) deepScan(snapshot, (key) => assert.equal(["collisionSettings", "colliderRadius", "wristEvidence", "noseEvidence", "trajectory", "segmentEndpoint", "confidence", "calibrationId", "frameId", "sourceContact", "contactEpisode"].includes(key), false, `public snapshot must omit ${key}`));

  const exactAttack = rehashedFlowAttack(eventPackage, (beats) => {
    beats[0].collisionSettings = { colliderRadius: 0.25 };
    beats[0].colliderRadius = 0.5;
    beats[0].wristEvidence = { x: 0.5, y: 0.5 };
    beats[0].frameId = "private-frame";
  });
  const exactAttackEnvelope = makeAeroPackage(exactAttack.package, exactAttack.packageHash, [{ path: "song.ogg", bytes: audio, hash: declaredAudioHash }]);
  const parsedAttack = await parseAeroPackage(exactAttackEnvelope);
  const attackRuntime = createAeroContentRuntime();
  await assert.rejects(() => attackRuntime.loadPackage(parsedAttack), hasCode("flow_event_shape_invalid"), "exact rehashed package/envelope/audio attack must fail at Flow admission");
  assert.equal(attackRuntime.getSnapshot().state, "error");
  assert.equal(JSON.stringify(attackRuntime.getSnapshot()).includes("private-frame"), false);

  const eventAttacks = [
    [0, "collision_settings", { radius: 0.25 }],
    [1, "collider_radius", 0.25],
    [2, "noseEvidence", { frame_id: "arc-private" }],
    [3, "wrist_trajectory", [[0,0],[1,1]]],
    [4, "contactEpisode", "wall-private"]
  ];
  for (const [index, key, value] of eventAttacks) {
    const attack = rehashedFlowAttack(eventPackage, (beats) => { beats[index][key] = value; });
    await assert.rejects(() => validateRuntimePackage(attack.package, { declaredPackageHash: `sha256:${attack.packageHash}` }), hasCode("flow_event_shape_invalid"), `${String(key)} must fail exact ${String(flow.beats[index].type)} admission after attacker rehash`);
  }
  for (const mutate of [
    (value) => { value.charts.find((chart) => chart.mode === "flow").sourceGeometry = { colliderRadius: 1 }; },
    (value) => { value.source.frame_id = "source-private"; },
    (value) => { value.song.noseEvidence = { x: 0.5 }; },
    (value) => { value.conversionTrace.flow[0].contact_episode = "trace-private"; },
    (value) => { value.conversionTrace.flow[0].events = [{ sourceFamily: "note", note: { wristEvidence: { x: 0.5 }, distance: 0.1 } }]; },
    (value) => { value.collisionSettings = { colliderRadius: 1 }; }
  ]) {
    const attack = structuredClone(eventPackage); mutate(attack); rehashFlow(attack);
    const packageHash = hashJson(attack);
    await assert.rejects(() => validateRuntimePackage(attack, { declaredPackageHash: `sha256:${packageHash}` }), (error) => Boolean(error && typeof error === "object" && "code" in error && ["flow_chart_shape_invalid", "source_provenance_invalid", "song_invalid", "flow_trace_invalid", "private_evidence_forbidden", "package_shape_invalid"].includes(String(error.code))), "privacy aliases outside authored beats fail exact admission after rehash");
  }

  let getterCalls = 0;
  const accessorAttack = structuredClone(eventPackage);
  Object.defineProperty(accessorAttack.charts.find((chart) => chart.mode === "flow").beats[0], "wristEvidence", { enumerable: true, get() { getterCalls += 1; return { x: 0.5 }; } });
  await assert.rejects(() => validateRuntimePackage(accessorAttack), hasCode("data_record_invalid"));
  assert.equal(getterCalls, 0, "Flow beat accessors reject without getter invocation");
  const arrayAccessorAttack = structuredClone(eventPackage);
  const arrayBeats = arrayAccessorAttack.charts.find((chart) => chart.mode === "flow").beats;
  const firstBeat = arrayBeats[0];
  Object.defineProperty(arrayBeats, "0", { enumerable: true, get() { getterCalls += 1; return firstBeat; } });
  await assert.rejects(() => validateRuntimePackage(arrayAccessorAttack), hasCode("data_array_invalid"));
  assert.equal(getterCalls, 0, "Flow beats-array accessors reject without getter invocation");
  for (const hostile of [
    (() => { const value = structuredClone(eventPackage); Object.defineProperty(value.charts.find((chart) => chart.mode === "flow").beats[0], "frameId", { enumerable: false, value: "hidden" }); return value; })(),
    (() => { const value = structuredClone(eventPackage); value.charts.find((chart) => chart.mode === "flow").beats[0][Symbol("wristEvidence")] = true; return value; })(),
    (() => { const value = structuredClone(eventPackage); class WristEvidence { constructor() { this.x = 0.5; } } value.charts.find((chart) => chart.mode === "flow").beats[0].wristEvidence = new WristEvidence(); return value; })(),
    (() => { const value = structuredClone(eventPackage); Object.setPrototypeOf(value.charts.find((chart) => chart.mode === "flow").beats[0], { frameId: "prototype-private" }); return value; })(),
    (() => { const value = structuredClone(eventPackage); const shared = { x: 0.5 }; const beat = value.charts.find((chart) => chart.mode === "flow").beats[0]; beat.wristEvidence = shared; beat.noseEvidence = shared; return value; })()
  ]) await assert.rejects(() => validateRuntimePackage(hostile), (error) => Boolean(error && typeof error === "object" && "code" in error && ["data_record_invalid", "flow_event_shape_invalid"].includes(String(error.code))), "hidden, symbol, class, prototype, and aliased evidence must fail before publication");

  const nestedAttacks = [
    (beat) => { beat.sourceGeometry.frameId = "nested-source"; },
    (beat) => { beat.gameplayGeometry.wristEvidence = { x: 0.5 }; },
    (beat) => { beat.gridMask.colliderRadius = 0.25; }
  ];
  for (const mutate of nestedAttacks) {
    const attack = structuredClone(eventPackage); const obstacle = attack.charts.find((chart) => chart.mode === "flow").beats.find((beat) => beat.type === "obstacle"); mutate(obstacle); rehashFlow(attack);
    await assert.rejects(() => validateRuntimePackage(attack, { declaredPackageHash: `sha256:${hashJson(attack)}` }), (error) => Boolean(error && typeof error === "object" && "code" in error && ["data_array_invalid", "flow_obstacle_invalid"].includes(String(error.code))), "nested obstacle evidence smuggling must fail admission");
  }
}
/** @param {Record<string, unknown>} packageRecord @param {(beats:Record<string,unknown>[])=>void} mutate */
function rehashedFlowAttack(packageRecord, mutate) { const packageValue = structuredClone(packageRecord); const flow = packageValue.charts.find((chart) => chart.mode === "flow"); mutate(flow.beats); rehashFlow(packageValue); return { package: packageValue, packageHash: hashJson(packageValue) }; }
/** @param {unknown} value @param {(key:string)=>void} visit */
function deepScan(value, visit) { if (!value || typeof value !== "object") return; for (const key of Reflect.ownKeys(value)) { if (typeof key !== "string") continue; visit(key); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (descriptor && "value" in descriptor) deepScan(descriptor.value, visit); } }

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
