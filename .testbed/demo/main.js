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
    const spawnTiming = { schema:"aerobeat/beatsaber_spawn_timing",version:1,algorithm:"beatsaber_core_hjd_v1",bpm:120,noteJumpMovementSpeed:10,noteJumpStartBeatOffset:1,maxHalfJumpDistance:17.999,startHalfJumpDurationBeats:4,minimumHalfJumpDurationBeats:.25,halfJumpDurationBeats:3,reactionTimeMs:1500,jumpDistanceMeters:30 };
    const converterProfile = { schema: "aerobeat/prototype_profile", version: 1, profileId: "aero.converter.canonical", profileVersion: "1.0.0", class: "converter_regeneration", label: "Canonical Converter (Experimental)", experimental: true, settings: { guardRelocationRadius: 1, reachAllowanceSubcells: 0 }, contentHash: "a43b53a39c13c9e9efe59854aee0fa16efdcd3c6a29bc09f678d94b3fd8f0202" };
    const paletteBase = { schema: "aerobeat/authored_note_palette", version: 1, left: "#FF0000", right: "#808080", colorSpace: "srgb", alpha: 1, provenance: { kind: "difficulty_custom_data", infoFormat: "v4", infoHash: `sha256:${"3".repeat(64)}`, difficultyHash: `sha256:${"4".repeat(64)}`, fieldSet: "v4_custom", schemeIndex: null } };
    const notePalette = { ...paletteBase, paletteHash: `sha256:${await sha256(new TextEncoder().encode(canonical(paletteBase)))}` };
    const charts = [],boxingPunchTypes=["straight_left","straight_right","hook_left","hook_right","uppercut_left","uppercut_right"];
    const boxingObstacle=(chartId,type,start,x)=>{const gridMask=[x,x+4,x+8],noseSafeCells=Array.from({length:12},(_,cell)=>cell).filter((cell)=>!gridMask.includes(cell));return {start,end:start+1,type,eventId:`${chartId}-${type}`,sourceEventIds:[`source-${type}`],sourceGeometry:{schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v3_obstacle_rect",kind:"v3_rect",x,y:0,width:1,height:3},gameplayGeometry:{schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x,y:0,width:1,height:3},gridMask,blockedCells:gridMask,checkpoint:{kind:"instantaneous",freshnessMs:150,timingWindowMs:180,noseSafeCells}};};
    for (const recipeId of ["row_family_balanced_height_v1", "cut_family_source_height_v1"]) {
      for (const rulesetId of ["boxing_semantic_track_v1", "boxing_spatial_grid_v1"]) {
        const chartId = `browser-${recipeId}-${rulesetId}`;
        const boxingBeats=[...boxingPunchTypes.map((type,index)=>({start:index+1,type,eventId:`${chartId}-${type}`,sourceEventIds:[`source-${type}`],spatialTarget:{targetCell:index%2===0?5:6,acceptedSubcells:index%2===0?[20,21]:[26,27],sourceCell:index%2===0?9:5,...(index%2===0?{qualificationMs:100}:{entryDirection:"left"})}})),{start:7,type:"guard",eventId:`${chartId}-guard`,sourceEventIds:["source-guard"],guardTarget:{leftCell:4,rightCell:7},checkpoint:{kind:"instantaneous"}},{start:8,end:9,type:"squat",eventId:`${chartId}-squat`,sourceEventIds:["source-squat"],sourceGeometry:{schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v3_obstacle_rect",kind:"v3_rect",x:0,y:2,width:4,height:1},gameplayGeometry:{schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:0,y:0,width:4,height:1},gridMask:[0,1,2,3],blockedCells:[0,1,2,3],checkpoint:{kind:"instantaneous",freshnessMs:150,timingWindowMs:180,noseSafeCells:[4,5,6,7,8,9,10,11]}},boxingObstacle(chartId,"weave_left",9,3),boxingObstacle(chartId,"weave_right",10,0)];
        const contentHash = await sha256(new TextEncoder().encode(canonical({ beats: boxingBeats, recipeId, rulesetId, sourceHash, converterProfile })));
        charts.push({ schemaId: "aerobeat.chart.boxing.v1", schemaVersion: 1, recordVersion: 1, chartId, chartName: chartId, mode: "boxing", difficulty: "Expert", prototype: { contractId: "aerobeat.boxing.prototype.v1", recipeId, recipeVersion: "1", rulesetId, rulesetVersion: "1", sourceHash, recipeHash: `sha256:${"1".repeat(64)}`, rulesetHash: `sha256:${"2".repeat(64)}`, contentHash: `sha256:${contentHash}`, modifiers: [], converterProfile, regenerationRequiredFor: [] }, beats: boxingBeats });
      }
    }
    const flowBeats = [{ start: 1, type: "note", hand: "left", placement: 4, requiresDirection: true, angleOffset: 0, direction: 1 }, { start: 2, end: 2.5, type: "obstacle", sourceGeometry:{schema:"aerobeat/obstacle_source_geometry",version:1,coordinateSpace:"beatsaber_v2_legacy_obstacle",kind:"v2_type_1",x:1,y:2,width:1,height:3},gameplayGeometry:{schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:1,y:0,width:1,height:3},gridMask:[1,5,9] }, { start: 3, type: "bomb", placement: 6 }];
    const flowPalette = { source: "package", paletteHash: notePalette.paletteHash };
    const rulesetVariants = ["flow_grid_v2", "flow_colliders_v1"];
    const flowContentHash = `sha256:${await sha256(new TextEncoder().encode(canonical({ beats: flowBeats, rulesetId: "flow_grid_v2", rulesetVariants, notePalette: flowPalette })))}`;
    charts.push({ schemaId: "aerobeat.chart.flow.v5", schemaVersion: 5, recordVersion: 2, rulesetId: "flow_grid_v2", rulesetVariants, chartId: "browser-flow", chartName: "Browser Flow", mode: "flow", difficulty: "Expert", notePalette: flowPalette, contentHash: flowContentHash, beats: flowBeats });
    const packageRecord = { schemaId: "aerobeat.song-package.v6", schemaVersion: 6, packageVersion: "6.0.0", packageId: "browser-package", songId: "browser-song", songName: "Browser Runtime", notePalette, source: { provider: "fixture", sourceId: "browser", sourceVersionHash: "version", difficulty: "Expert", sourceInfoFormat: "v4", sourceInfoVersion: "4.0.1", sourceInfoHash: `sha256:${"3".repeat(64)}`, sourceDifficultyPath: "Expert.dat", sourceBeatmapFormat: "v4", sourceBeatmapVersion: "4.1.0", sourceDifficultyHash: `sha256:${"4".repeat(64)}`, sourceHash, spawnTiming, obstacleContract: "normalized_obstacle_v2", converterProfile }, song: { schemaId: "aerobeat.song.v1", schemaVersion: 1, recordVersion: 1, songId: "browser-song", songName: "Browser Runtime", durationSec: 2, audio: { filePath: "song.ogg", contentHash: `sha256:${audioHash}` }, timing: { anchorMs: 100, tempoSegments: [{ startBeat: 0, bpm: 120 }, { startBeat: 2, bpm: 60 }], stopSegments: [{ startBeat: 1, durationMs: 100 }], timeSignatureSegments: [{ startBeat: 0, numerator: 4, denominator: 4 }] } }, charts, sets: charts.map((chart, index) => ({ schemaId: "aerobeat.set.v1", schemaVersion: 1, recordVersion: 1, setId: `browser-set-${index}`, setName: chart.chartName, songId: "browser-song", chartId: chart.chartId })), recipeDefinitions: [], rulesetDefinitions: [], conversionTrace: { notePalette: flowPalette, spawnTiming, converterProfile, boxing: charts.filter((chart) => chart.mode === "boxing").map((chart) => ({ chartId: chart.chartId, spawnTiming, converterProfile })), flow:[{ difficulty:"Expert", events:[], obstacleContract:"normalized_obstacle_v2", rulesetId:"flow_grid_v2", rulesetVariants, sourceHash, sourceInfoFormat:"v4", sourceInfoVersion:"4.0.1", sourceInfoHash:`sha256:${"3".repeat(64)}`, sourceDifficultyPath:"Expert.dat", sourceBeatmapFormat:"v4", sourceBeatmapVersion:"4.1.0", sourceDifficultyHash:`sha256:${"4".repeat(64)}`, spawnTiming, notePalette:flowPalette, contentHash:flowContentHash }] }, presentationSuggestion: null };
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
    const bomb = snapshot.resolvedEvents.find((event) => event.authoredBeat.type === "bomb");
    if (!note || !obstacle || !bomb) throw new Error("Browser interval fixture did not resolve");
    const projectionSymbol = Symbol.for("aerobeat.web-content.internal-render-projection");
    const projectedNote = second[projectionSymbol]().find((event) => event.authoredBeat.type === "note");
    const projectedObstacle = second[projectionSymbol]().find((event) => event.authoredBeat.type === "obstacle");
    const projectedBomb = second[projectionSymbol]().find((event) => event.authoredBeat.type === "bomb");
    this.dataset.ready = "true";
    this.dataset.noteCenterMs = String(note.centerTimestampMs);
    this.dataset.intervalStartMs = String(obstacle.centerTimestampMs);
    this.dataset.intervalEndMs = String(obstacle.intervalEndTimestampMs);
    this.dataset.instantKeys = Object.keys(note).join(",");
    this.dataset.intervalFrozen = String(Object.isFrozen(obstacle) && Object.isFrozen(obstacle.authoredBeat));
    this.textContent = `${aeroContentServiceId} · ${aeroContentRuntimeDescriptor.implementationState} · ${snapshot.variants.length} variants`;

    const packageFailure = await failureCode(createAeroContentRuntime().loadPackage({ package: packageRecord, packageHash: `sha256:${"0".repeat(64)}`, assets: [{ path: "song.ogg", bytes: audioView }] }));
    const staleV5 = structuredClone(packageRecord); staleV5.schemaId = "aerobeat.song-package.v5"; staleV5.schemaVersion = 5; staleV5.packageVersion = "5.0.0";
    const staleV5Failure = await failureCode(createAeroContentRuntime().loadPackage({ package: staleV5, assets: [{ path: "song.ogg", bytes: audioView }] }));
    const evidenceAttack = structuredClone(packageRecord);
    const evidenceFlow = evidenceAttack.charts.find((chart)=>chart.mode==="flow");
    evidenceFlow.beats[0].collisionSettings = { colliderRadius: 0.25 };
    evidenceFlow.beats[0].colliderRadius = 0.5;
    evidenceFlow.beats[0].wristEvidence = { x: 0.5, y: 0.5 };
    evidenceFlow.beats[0].frameId = "private-frame";
    evidenceFlow.contentHash = `sha256:${await sha256(new TextEncoder().encode(canonical({beats:evidenceFlow.beats,rulesetId:evidenceFlow.rulesetId,rulesetVariants:evidenceFlow.rulesetVariants,notePalette:evidenceFlow.notePalette})))}`;
    evidenceAttack.conversionTrace.flow[0].contentHash = evidenceFlow.contentHash;
    const evidenceAttackHash = await sha256(new TextEncoder().encode(canonical(evidenceAttack)));
    const evidenceAttackRuntime = createAeroContentRuntime();
    const evidenceAttackFailure = await failureCode(evidenceAttackRuntime.loadPackage({ package:evidenceAttack, packageHash:`sha256:${evidenceAttackHash}`, assets:[{path:"song.ogg",bytes:audioView}] }));
    const evidenceAttackPublished = JSON.stringify(evidenceAttackRuntime.getSnapshot()).includes("private-frame");
    let evidenceGetterCalls = 0;
    const accessorAttack = structuredClone(packageRecord); Object.defineProperty(accessorAttack.charts.find((chart)=>chart.mode==="flow").beats[0],"wristEvidence",{enumerable:true,get(){evidenceGetterCalls+=1;return{x:0.5};}});
    const accessorAttackFailure = await failureCode(createAeroContentRuntime().loadPackage({package:accessorAttack,assets:[{path:"song.ogg",bytes:audioView}]}));
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
    const flowVariants = snapshot.variants.filter((variant) => variant.mode === "flow");
    if (flowVariants.length !== 2 || flowVariants[0].rulesetId !== "flow_grid_v2" || flowVariants[1].rulesetId !== "flow_colliders_v1") throw new Error("Browser Flow successor variants are incomplete");
    const gridEvents = snapshot.resolvedEvents;
    await second.selectVariant(flowVariants[1].variantId);
    const colliderEvents = second.getSnapshot().resolvedEvents;
    const sharedFlowEventObjects = colliderEvents.every((event,index) => event.authoredBeat === gridEvents[index].authoredBeat);
    const distinctFlowScoreIdentities = flowVariants[0].scoreIdentityHash.value !== flowVariants[1].scoreIdentityHash.value;
    const collidersPolicy = [flowVariants[1].recipeId, flowVariants[1].ranked, flowVariants[1].localOnly];
    const successorPublicJson = JSON.stringify(second.getSnapshot());
    const publicHasCollisionLeak = ["colliderRadius","collisionSettings","wrist","nose","trajectory","segmentEndpoint","confidence","calibrationId","frameId","contactEpisode"].some((token)=>successorPublicJson.includes(token));
    await second.selectVariant(flowVariants[0].variantId);
    const boxingVariants = snapshot.variants.filter((variant) => variant.mode === "boxing");
    if (boxingVariants.length!==4) throw new Error("Browser Boxing variant matrix is incomplete");
    second.setPlaybackState({state:"paused",positionMs:0});await second.swapFutureVariant(boxingVariants[0].variantId,{modifierIds:["no_squats"]});const swappedCompositeKind=second.getSnapshot().selectedVariant.provenance.kind;
    const boxingVariantEvidence=[];
    for(const variant of boxingVariants){await second.selectVariant(variant.variantId);const projection=second[projectionSymbol](),publicEvents=second.getSnapshot().resolvedEvents;boxingVariantEvidence.push({rulesetId:variant.rulesetId,recipeId:variant.recipeId,punchColors:projection.filter((event)=>boxingPunchTypes.includes(event.authoredBeat.type)).map((event)=>[event.authoredBeat.type,event.appearanceColor]),fixed:projection.filter((event)=>["guard","squat","weave_left","weave_right"].includes(event.authoredBeat.type)).map((event)=>[event.authoredBeat.type,Object.hasOwn(event,"appearanceColor")]),publicHasAppearance:publicEvents.some((event)=>Object.hasOwn(event,"appearanceColor"))});}
    const boxingPublic=second.getSnapshot().resolvedEvents;
    globalThis.__contentHashEvidence = Object.freeze({
      isSecureContext,
      subtleType: typeof globalThis.crypto?.subtle,
      identities: Object.freeze({ packageHash, audioHash, largeHash }),
      packageFailure,
      staleV5Failure,
      evidenceAttackFailure,
      evidenceAttackPublished,
      accessorAttackFailure,
      evidenceGetterCalls,
      chartFailure,
      assetFailure,
      persistedState: persistence.getSnapshot().state,
      persistedAssetMatches: persistence.readAsset("song.ogg").every((byte, index) => byte === audio[index]),
      largeAssetBytes: second.readAsset("large.bin").byteLength,
      largeAssetMatches: second.readAsset("large.bin").every((byte, index) => byte === largeView[index]),
      compositeKind: swappedCompositeKind,
      projectedNoteColor: projectedNote?.appearanceColor ?? null,
      projectedObstacleHasColor: Object.hasOwn(projectedObstacle ?? {}, "appearanceColor"),
      projectedBombHasColor: Object.hasOwn(projectedBomb ?? {}, "appearanceColor"),
      flowRulesets: flowVariants.map((variant)=>variant.rulesetId),
      sharedFlowEventObjects,
      distinctFlowScoreIdentities,
      collidersPolicy,
      publicHasCollisionLeak,
      boxingVariantEvidence,
      publicHasPaletteLeak: JSON.stringify(snapshot).includes("#FF0000") || JSON.stringify(snapshot).includes(notePalette.paletteHash) || Object.hasOwn(note, "appearanceColor") || boxingPublic.some((event)=>Object.hasOwn(event,"appearanceColor")),
      projectionEnumerable: Object.getOwnPropertyDescriptor(second, projectionSymbol)?.enumerable ?? null,
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
