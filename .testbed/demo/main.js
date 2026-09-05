// @ts-check

import { sha256Hex } from "@aerobeat/web-hash";
import {
  aeroContentRuntimeDescriptor,
  aeroContentServiceId,
  createAeroContentRuntime
} from "@aerobeat/web-this-repo";

class AeroContentRuntimeElement extends HTMLElement {
  async connectedCallback() {
    const audio = new TextEncoder().encode("browser-runtime-audio");
    const audioHash = await sha256(audio);
    const sourceHash = `sha256:${await sha256(new TextEncoder().encode("browser-source"))}`;
    const converterProfile = { schema: "aerobeat/prototype_profile", version: 1, profileId: "aero.converter.canonical", profileVersion: "1.0.0", class: "converter_regeneration", label: "Canonical Converter (Experimental)", experimental: true, settings: { guardRelocationRadius: 1, reachAllowanceSubcells: 0 }, contentHash: "a43b53a39c13c9e9efe59854aee0fa16efdcd3c6a29bc09f678d94b3fd8f0202" };
    const charts = [];
    for (const recipeId of ["row_family_balanced_height_v1", "cut_family_source_height_v1"]) {
      for (const rulesetId of ["boxing_semantic_track_v1", "boxing_spatial_grid_v1"]) {
        const chartId = `browser-${recipeId}-${rulesetId}`;
        const contentHash = await sha256(new TextEncoder().encode(canonical({ beats: [], recipeId, rulesetId, sourceHash, converterProfile })));
        charts.push({ schemaId: "aerobeat.chart.boxing.v1", schemaVersion: 1, recordVersion: 1, chartId, chartName: chartId, mode: "boxing", difficulty: "Expert", prototype: { contractId: "aerobeat.boxing.prototype.v1", recipeId, recipeVersion: "1", rulesetId, rulesetVersion: "1", sourceHash, recipeHash: `sha256:${"1".repeat(64)}`, rulesetHash: `sha256:${"2".repeat(64)}`, contentHash: `sha256:${contentHash}`, modifiers: [], converterProfile, regenerationRequiredFor: [] }, beats: [] });
      }
    }
    charts.push({ schemaId: "aerobeat.chart.flow.v3", schemaVersion: 3, recordVersion: 2, rulesetId: "flow_grid_v2", chartId: "browser-flow", chartName: "Browser Flow", mode: "flow", difficulty: "Expert", beats: [{ start: 1, type: "note", hand: "left", placement: 4, direction: 1 }, { start: 2, end: 2.5, type: "obstacle", sourceGeometry:{schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v2_legacy_obstacle",kind:"v2_type_1",x:1,y:2,width:1,height:3},gameplayGeometry:{schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:1,y:0,width:1,height:3},gridMask:[1,5,9] }] });
    const packageRecord = { schemaId: "aerobeat.song-package.v3", schemaVersion: 3, packageVersion: "3.0.0", packageId: "browser-package", songId: "browser-song", songName: "Browser Runtime", source: { provider: "fixture", sourceId: "browser", sourceVersionHash: "version", difficulty: "Expert", sourceDifficultyPath: "Expert.dat", sourceHash, obstacleContract: "normalized_obstacle_v2", converterProfile }, song: { schemaId: "aerobeat.song.v1", schemaVersion: 1, recordVersion: 1, songId: "browser-song", songName: "Browser Runtime", durationSec: 2, audio: { filePath: "song.ogg", contentHash: `sha256:${audioHash}` }, timing: { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [], timeSignatureSegments: [] } }, charts, sets: charts.map((chart, index) => ({ schemaId: "aerobeat.set.v1", schemaVersion: 1, recordVersion: 1, setId: `browser-set-${index}`, setName: chart.chartName, songId: "browser-song", chartId: chart.chartId })), recipeDefinitions: [], rulesetDefinitions: [], conversionTrace: { converterProfile, boxing: charts.filter((chart) => chart.mode === "boxing").map((chart) => ({ chartId: chart.chartId, converterProfile })), flow:[{obstacleContract:"normalized_obstacle_v2",sourceHash,sourceDifficultyPath:"Expert.dat"}] }, presentationSuggestion: null };
    const packageHash = await sha256(new TextEncoder().encode(canonical(packageRecord)));
    const paddedAudio = new Uint8Array(audio.byteLength + 11);
    paddedAudio.set(audio, 7);
    const audioView = paddedAudio.subarray(7, 7 + audio.byteLength);
    const largeBacking = new Uint8Array(4 * 1024 * 1024 + 13);
    for (let index = 5; index < largeBacking.byteLength - 8; index += 4096) largeBacking[index] = index & 255;
    const largeView = largeBacking.subarray(5, largeBacking.byteLength - 8);
    const largeHash = await sha256(largeView);
    const assets = [{ path: "song.ogg", bytes: audioView }, { path: "large.bin", bytes: largeView, hash: `sha256:${largeHash}` }];
    const first = createAeroContentRuntime();
    const second = createAeroContentRuntime();
    await first.loadPackage({ package: packageRecord, packageHash: `sha256:${packageHash}`, assets });
    await second.loadPackage({ package: packageRecord, packageHash: `sha256:${packageHash}`, assets });
    first.destroy();
    const snapshot = second.getSnapshot();
    if (snapshot.state !== "ready") throw new Error("Runtime instances were not isolated");
    const note = snapshot.resolvedEvents.find((event) => event.authoredBeat.type === "note");
    const obstacle = snapshot.resolvedEvents.find((event) => event.authoredBeat.type === "obstacle");
    if (!note || !obstacle) throw new Error("Browser interval fixture did not resolve");
    this.dataset.ready = "true";
    this.dataset.intervalStartMs = String(obstacle.centerTimestampMs);
    this.dataset.intervalEndMs = String(obstacle.intervalEndTimestampMs);
    this.dataset.instantKeys = Object.keys(note).join(",");
    this.dataset.intervalFrozen = String(Object.isFrozen(obstacle) && Object.isFrozen(obstacle.authoredBeat));
    this.textContent = `${aeroContentServiceId} · ${aeroContentRuntimeDescriptor.implementationState} · ${snapshot.variants.length} variants`;

    const packageFailure = await failureCode(createAeroContentRuntime().loadPackage({ package: packageRecord, packageHash: `sha256:${"0".repeat(64)}`, assets: [{ path: "song.ogg", bytes: audioView }] }));
    const chartTamper = structuredClone(packageRecord);
    chartTamper.charts[0].prototype.contentHash = `sha256:${"0".repeat(64)}`;
    const chartFailure = await failureCode(createAeroContentRuntime().loadPackage({ package: chartTamper, assets: [{ path: "song.ogg", bytes: audioView }] }));
    const tamperedAudio = audioView.slice();
    tamperedAudio[0] ^= 1;
    const assetFailure = await failureCode(createAeroContentRuntime().loadPackage({ package: packageRecord, assets: [{ path: "song.ogg", bytes: tamperedAudio }] }));
    const persistence = createAeroContentRuntime({ persistenceResolver: {
      async loadPackage() { return { package: packageRecord, assetPaths: ["song.ogg"] }; },
      async readAsset() { return audioView; }
    } });
    const handle = { schema: "aerobeat/persistence_handle", version: 1, storage: "memory", namespace: "browser.authored", key: "browser-package", packageId: packageRecord.packageId, packageHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: packageHash } };
    await persistence.loadPersistenceHandle(handle, { assetHashes: { "song.ogg": audioHash } });
    const boxing = snapshot.variants.find((variant) => variant.mode === "boxing");
    if (!boxing) throw new Error("Browser composite fixture is missing");
    await second.selectVariant(boxing.variantId, { modifierIds: ["no_squats"] });
    globalThis.__contentHashEvidence = Object.freeze({
      isSecureContext,
      subtleType: typeof globalThis.crypto?.subtle,
      identities: Object.freeze({ packageHash, audioHash, largeHash }),
      packageFailure,
      chartFailure,
      assetFailure,
      persistedState: persistence.getSnapshot().state,
      persistedAssetMatches: persistence.readAsset("song.ogg").every((byte, index) => byte === audio[index]),
      largeAssetBytes: second.readAsset("large.bin").byteLength,
      largeAssetMatches: second.readAsset("large.bin").every((byte, index) => byte === largeView[index]),
      compositeKind: second.getSnapshot().selectedVariant.provenance.kind,
      destroyedState: (second.destroy(), second.getSnapshot().state)
    });
    persistence.destroy();
  }
}

if (!customElements.get("aero-content-runtime")) customElements.define("aero-content-runtime", AeroContentRuntimeElement);

/** @param {Promise<unknown>} operation */
async function failureCode(operation) {
  try { await operation; return "missing_failure"; }
  catch (error) { return error && typeof error === "object" && "code" in error ? String(error.code) : "unknown_failure"; }
}

/** @param {Uint8Array} bytes */
async function sha256(bytes) { return sha256Hex(bytes); }
/** @param {unknown} value */
function canonical(value) { return JSON.stringify(sort(value)); }
/** @param {unknown} value @returns {unknown} */
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value).sort()) result[key] = sort(value[key]); return result; } return value; }
