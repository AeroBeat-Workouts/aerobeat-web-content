// @ts-check

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
    charts.push({ schemaId: "aerobeat.chart.v1", schemaVersion: 1, recordVersion: 1, chartId: "browser-flow", chartName: "Browser Flow", mode: "flow", difficulty: "Expert", beats: [{ start: 1, type: "note", hand: "left", placement: 4, direction: 1 }, { start: 2, end: 2.5, type: "obstacle", cells: [1, 2] }] });
    const packageRecord = { schemaId: "aerobeat.song-package.v1", schemaVersion: 1, packageVersion: "1", packageId: "browser-package", songId: "browser-song", songName: "Browser Runtime", source: { provider: "fixture", sourceId: "browser", sourceVersionHash: "version", difficulty: "Expert", sourceDifficultyPath: "Expert.dat", sourceHash, converterProfile }, song: { schemaId: "aerobeat.song.v1", schemaVersion: 1, recordVersion: 1, songId: "browser-song", songName: "Browser Runtime", durationSec: 2, audio: { filePath: "song.ogg", contentHash: `sha256:${audioHash}` }, timing: { anchorMs: 0, tempoSegments: [{ startBeat: 0, bpm: 120 }], stopSegments: [], timeSignatureSegments: [] } }, charts, sets: charts.map((chart, index) => ({ schemaId: "aerobeat.set.v1", schemaVersion: 1, recordVersion: 1, setId: `browser-set-${index}`, setName: chart.chartName, songId: "browser-song", chartId: chart.chartId })), recipeDefinitions: [], rulesetDefinitions: [], conversionTrace: { converterProfile, boxing: charts.filter((chart) => chart.mode === "boxing").map((chart) => ({ chartId: chart.chartId, converterProfile })), flow: [{}] }, presentationSuggestion: null };
    const first = createAeroContentRuntime();
    const second = createAeroContentRuntime();
    await first.loadPackage({ package: packageRecord, assets: [{ path: "song.ogg", bytes: audio }] });
    await second.loadPackage({ package: packageRecord, assets: [{ path: "song.ogg", bytes: audio }] });
    first.destroy();
    const snapshot = second.getSnapshot();
    if (snapshot.state !== "ready") throw new Error("Runtime instances were not isolated");
    const note = snapshot.resolvedEvents.find((event) => event.authoredBeat.type === "note");
    const obstacle = snapshot.resolvedEvents.find((event) => event.authoredBeat.type === "obstacle");
    if (!note || !obstacle) throw new Error("Browser interval fixture did not resolve");
    this.dataset.ready = "true";
    this.dataset.intervalStartMs = String(obstacle.centerTimestampMs);
    this.dataset.intervalEndMs = String(obstacle.endTimestampMs);
    this.dataset.instantKeys = Object.keys(note).join(",");
    this.dataset.intervalFrozen = String(Object.isFrozen(obstacle) && Object.isFrozen(obstacle.authoredBeat));
    this.textContent = `${aeroContentServiceId} · ${aeroContentRuntimeDescriptor.implementationState} · ${snapshot.variants.length} variants`;
    second.destroy();
  }
}

if (!customElements.get("aero-content-runtime")) customElements.define("aero-content-runtime", AeroContentRuntimeElement);

/** @param {Uint8Array} bytes */
async function sha256(bytes) { const digest = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
/** @param {unknown} value */
function canonical(value) { return JSON.stringify(sort(value)); }
/** @param {unknown} value @returns {unknown} */
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value).sort()) result[key] = sort(value[key]); return result; } return value; }
