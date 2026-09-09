// @ts-check

import { isObstacleGameplayGeometry, isObstacleGridMask, isObstacleSourceGeometry, maximumObstaclesPerChart } from "@aerobeat/web-contracts/obstacle-contracts";
import {
  conversionRecipeIds,
  createAuthoredBeatToTimelineMs,
  defaultNotePalette,
  isAuthoredNotePalette,
  isEffectiveNotePalette,
  mapModifierIds,
  rulesetIds
} from "@aerobeat/web-contracts";
import { canonicalJson, cloneFrozenData, dataError, hasExactDataKeys, isPlainDataRecord, runtimePackageDataLimits, sha256Hex } from "./runtime-data.js";
import { validateSpawnTiming } from "./spawn-timing.js";

const FLOW_GRID_RULESET_ID = "flow_grid_v2";
const FLOW_COLLIDERS_RULESET_ID = "flow_colliders_v1";
const FLOW_RULESET_VARIANTS = Object.freeze([FLOW_GRID_RULESET_ID, FLOW_COLLIDERS_RULESET_ID]);

/** @typedef {Readonly<Record<string, unknown>>} DataRecord */
/** @typedef {import("@aerobeat/web-contracts").AeroEffectiveNotePalette} AeroEffectiveNotePalette */
/** @typedef {Readonly<{variantId: string, chartId: string, mode: "flow" | "boxing", rulesetId: string, recipeId: string | null, modifierIds: readonly string[], ranked: boolean, localOnly: boolean, mapHash: Readonly<Record<string, unknown>>, scoreIdentityHash: Readonly<Record<string, unknown>>, provenance: Readonly<Record<string, unknown>>, chart: DataRecord}>} RuntimeVariant */

/**
 * Narrow and verify one canonical package and return its immutable variant catalog.
 *
 * @param {unknown} packageValue
 * @param {{declaredPackageHash?: string | Readonly<Record<string, unknown>> | null, supportedRulesetIds?: readonly string[], supportedRecipeIds?: readonly string[]}} [options]
 */
export async function validateRuntimePackage(packageValue, options = {}) {
  const packageRecord = /** @type {DataRecord} */ (cloneFrozenData(packageValue, runtimePackageDataLimits));
  requireString(packageRecord.schemaId, "package_schema_invalid");
  if ([1,2,3,4].some((version)=>packageRecord.schemaId===`aerobeat.song-package.v${version}`&&packageRecord.schemaVersion===version)) throw dataError("spawn_timing_reimport_required", "Prior package versions require reimport for hash-bound source spawn timing");
  if (packageRecord.schemaId === "aerobeat.song-package.v5" && packageRecord.schemaVersion === 5 && packageRecord.packageVersion === "5.0.0") throw dataError("flow_colliders_reimport_required", "Package predates explicit flow_colliders_v1 authoring and must be reimported");
  if (packageRecord.schemaId !== "aerobeat.song-package.v6" || packageRecord.schemaVersion !== 6 || packageRecord.packageVersion !== "6.0.0") throw dataError("package_schema_invalid", "Song package schema/version is unsupported");
  if (!hasExactDataKeys(packageRecord, ["schemaId", "schemaVersion", "packageVersion", "packageId", "songId", "songName", "source", "notePalette", "song", "charts", "sets", "recipeDefinitions", "rulesetDefinitions", "conversionTrace", "presentationSuggestion"])) throw dataError("package_shape_invalid", "Successor package must contain only exact authored fields");
  const packageId = requireString(packageRecord.packageId, "package_identity_invalid");
  const songId = requireString(packageRecord.songId, "package_identity_invalid");
  const song = requireRecord(packageRecord.song, "song_invalid");
  if (["notePalette", "paletteHash", "appearanceColor", "provenance"].some((key) => Object.hasOwn(song, key))) throw dataError("song_palette_forbidden", "Public song metadata cannot carry private palette fields");
  if (!hasExactOptionalDataKeys(song, ["schemaId", "schemaVersion", "recordVersion", "songId", "songName", "durationSec", "timing"], ["audio"])) throw dataError("song_invalid", "Song metadata must contain only exact authored fields");
  if (song.songId !== songId) throw dataError("song_identity_mismatch", "Package and song identities do not match");
  const packageSource = validateSource(packageRecord.source);
  const converterProfile = await validatePackageConverterProfile(packageRecord);
  const beatToTimelineMs = readTimingMapper(song);
  const notePalette = await validateAuthoredPalette(packageRecord.notePalette);
  validatePaletteSourceBinding(notePalette, packageSource);
  const effectiveNotePalette = await createEffectivePalette(notePalette);
  const bpm = readBpm(song);
  const spawnTiming = validateSpawnTiming(packageSource.spawnTiming, bpm);
  validateSpawnTimingTrace(packageRecord.conversionTrace, spawnTiming);
  const charts = requireArray(packageRecord.charts, "charts_invalid");
  if (charts.length !== 5) throw dataError("chart_count_invalid", "Package must contain Flow plus exactly four Boxing prototype charts");
  const chartIds = new Set();
  /** @type {RuntimeVariant[]} */
  const variants = [];
  const matrix = new Set();
  let flowCount = 0;
  let flowContentHash = "";
  for (let index = 0; index < charts.length; index += 1) {
    const chart = requireRecord(charts[index], "chart_invalid");
    const chartId = requireString(chart.chartId, "chart_identity_invalid");
    if (chartIds.has(chartId)) throw dataError("chart_identity_duplicate", "Chart IDs must be unique");
    chartIds.add(chartId);
    const beats = requireArray(chart.beats, "chart_beats_invalid");
    validateEvents(beats, chart.mode === "boxing", beatToTimelineMs);
    let rulesetId = "flow_grid_v2";
    let recipeId = null;
    /** @type {string[]} */
    let modifierIds = [];
    let declaredChartHash = "";
    let scoringChartHash = "";
    /** @type {readonly Readonly<{rulesetId:string, variantId:string, ranked:boolean, localOnly:boolean}>[]} */
    let runtimeIdentities = Object.freeze([]);
    if (chart.mode === "flow") {
      flowCount += 1;
      if (chart.schemaId !== "aerobeat.chart.flow.v5" || chart.schemaVersion !== 5 || chart.rulesetId !== FLOW_GRID_RULESET_ID || !hasExactFlowRulesetVariants(chart.rulesetVariants)) throw dataError("flow_chart_schema_invalid", "Flow chart must bind the exact ordered Flow Grid and Flow Colliders successor identity");
      if (!hasExactDataKeys(chart, ["schemaId", "schemaVersion", "recordVersion", "rulesetId", "rulesetVariants", "chartId", "chartName", "mode", "difficulty", "notePalette", "contentHash", "beats"])) throw dataError("flow_chart_shape_invalid", "Flow chart must contain only the exact successor fields and one shared beats array");
      validateFlowPaletteReference(chart.notePalette, notePalette);
      const expectedFlowContentHash = `sha256:${await sha256Hex(canonicalJson({ beats, rulesetId: chart.rulesetId, rulesetVariants: chart.rulesetVariants, notePalette: chart.notePalette }))}`;
      if (requireHashString(chart.contentHash, "flow_content_hash_invalid") !== expectedFlowContentHash) throw dataError("flow_content_hash_mismatch", `Flow chart ${chartId} failed successor content-hash verification`);
      flowContentHash = expectedFlowContentHash;
      declaredChartHash = expectedFlowContentHash.slice(7);
      scoringChartHash = await sha256Hex(canonicalJson(flowScoringProjection(chart)));
      runtimeIdentities = Object.freeze([
        Object.freeze({ rulesetId: FLOW_GRID_RULESET_ID, variantId: chartId, ranked: true, localOnly: false }),
        Object.freeze({ rulesetId: FLOW_COLLIDERS_RULESET_ID, variantId: `${chartId}~ruleset-${FLOW_COLLIDERS_RULESET_ID}`, ranked: false, localOnly: true })
      ]);
    } else if (chart.mode === "boxing") {
      if (Object.hasOwn(chart, "notePalette") || Object.hasOwn(chart, "paletteHash")) throw dataError("boxing_palette_forbidden", "Boxing charts cannot carry Flow note-palette fields");
      const prototype = requireRecord(chart.prototype, "prototype_invalid");
      await validateChartConverterProfile(prototype, converterProfile);
      if (prototype.contractId !== "aerobeat.boxing.prototype.v1") throw dataError("prototype_contract_invalid", "Boxing prototype contract is unsupported");
      requireString(prototype.recipeVersion, "recipe_version_invalid");
      requireString(prototype.rulesetVersion, "ruleset_version_invalid");
      requireHashString(prototype.recipeHash, "recipe_hash_invalid");
      requireHashString(prototype.rulesetHash, "ruleset_hash_invalid");
      rulesetId = requireString(prototype.rulesetId, "ruleset_invalid");
      recipeId = requireString(prototype.recipeId, "recipe_invalid");
      if (!rulesetIds.includes(/** @type {"flow_grid_v1" | "flow_grid_v2" | "flow_colliders_v1" | "boxing_semantic_track_v1" | "boxing_spatial_grid_v1"} */ (rulesetId)) || (rulesetId !== "boxing_semantic_track_v1" && rulesetId !== "boxing_spatial_grid_v1")) throw dataError("ruleset_invalid", "Boxing ruleset is unsupported");
      if (!conversionRecipeIds.includes(/** @type {"row_family_balanced_height_v1" | "cut_family_source_height_v1"} */ (recipeId))) throw dataError("recipe_invalid", "Conversion recipe is unsupported");
      if (options.supportedRulesetIds && !options.supportedRulesetIds.includes(rulesetId)) throw dataError("ruleset_unavailable", `Ruleset ${rulesetId} is unavailable`);
      if (options.supportedRecipeIds && !options.supportedRecipeIds.includes(recipeId)) throw dataError("recipe_unavailable", `Recipe ${recipeId} is unavailable`);
      modifierIds = normalizeModifiers(prototype.modifiers);
      validateEventModifierIdentity(beats, modifierIds);
      const sourceHash = requireHashString(prototype.sourceHash, "source_hash_invalid");
      declaredChartHash = requireHashString(prototype.contentHash, "chart_hash_invalid").slice(7);
      const actualChartHash = await sha256Hex(canonicalJson(chartHashProjection(beats, recipeId, rulesetId, `sha256:${sourceHash.slice(7)}`, converterProfile)));
      if (actualChartHash !== declaredChartHash) throw dataError("chart_hash_mismatch", `Chart ${chartId} failed content-hash verification`);
      scoringChartHash = declaredChartHash;
      matrix.add(`${recipeId}|${rulesetId}`);
      runtimeIdentities = Object.freeze([Object.freeze({ rulesetId, variantId: chartId, ranked: true, localOnly: false })]);
    } else {
      throw dataError("chart_mode_invalid", "Only Flow and Boxing charts are supported");
    }
    const mapHash = contentHash(declaredChartHash);
    for (const identity of runtimeIdentities) {
      const scoreValue = await sha256Hex(canonicalJson({ packageId, chartId, rulesetId: identity.rulesetId, recipeId, modifierIds, mapHash: scoringChartHash, ranked: identity.ranked }));
      variants.push(Object.freeze({
        variantId: identity.variantId,
        chartId,
        mode: chart.mode,
        rulesetId: identity.rulesetId,
        recipeId,
        modifierIds: Object.freeze([...modifierIds]),
        ranked: identity.ranked,
        localOnly: identity.localOnly,
        mapHash,
        scoreIdentityHash: contentHash(scoreValue),
        provenance: Object.freeze({ schema: "aerobeat/runtime_variant_provenance", version: 1, kind: "authored", baseVariantId: null, requestedModifierIds: Object.freeze([]), effectiveModifierIds: Object.freeze([...modifierIds]) }),
        chart
      }));
    }
  }
  if (flowCount !== 1) throw dataError("flow_variant_invalid", "Package must contain exactly one Flow chart");
  validateFlowTraceBinding(packageRecord.conversionTrace, notePalette, flowContentHash, packageSource);
  const expectedMatrix = conversionRecipeIds.flatMap((recipe) => ["boxing_semantic_track_v1", "boxing_spatial_grid_v1"].map((ruleset) => `${recipe}|${ruleset}`));
  if (!expectedMatrix.every((identity) => matrix.has(identity))) throw dataError("boxing_matrix_incomplete", "Package does not contain all four Boxing prototype variants");
  validateSets(packageRecord.sets, chartIds);
  rejectPrivateEvidence(packageRecord);
  const packageHashValue = await sha256Hex(canonicalJson(packageRecord));
  const expectedPackageHash = normalizeDeclaredHash(options.declaredPackageHash);
  if (expectedPackageHash && expectedPackageHash !== packageHashValue) throw dataError("package_hash_mismatch", "Song package failed declared hash verification");
  const semanticParityHashValue = await semanticParityHash(packageRecord);
  return Object.freeze({
    package: packageRecord,
    packageId,
    packageHash: contentHash(packageHashValue),
    semanticParityHash: contentHash(semanticParityHashValue),
    song,
    bpm,
    beatToTimelineMs,
    effectiveNotePalette,
    spawnTiming,
    variants: Object.freeze(variants),
    source: isPlainDataRecord(packageRecord.source) ? packageRecord.source : Object.freeze(Object.create(null))
  });
}

/**
 * Compose modifiers without changing the immutable base variant.
 *
 * @param {RuntimeVariant} base
 * @param {readonly string[]} requestedModifiers
 * @param {string} packageId
 * @returns {Promise<RuntimeVariant>}
 */
export async function composeRuntimeVariant(base, requestedModifiers, packageId) {
  const requested = normalizeModifiers(requestedModifiers);
  const modifiers = normalizeModifiers([...base.modifierIds, ...requested]);
  if (modifiers.includes("no_obstacles") && modifiers.includes("obstacle_visual_only")) throw dataError("modifier_conflict", "Obstacle accessibility modes are mutually exclusive");
  if (modifiers.every((entry, index) => entry === base.modifierIds[index]) && modifiers.length === base.modifierIds.length) return base;
  const chartCopy = /** @type {Record<string, unknown>} */ (cloneMutable(base.chart));
  let beats = /** @type {Record<string, unknown>[]} */ (requireArray(chartCopy.beats, "chart_beats_invalid").map((beat) => /** @type {Record<string, unknown>} */ (cloneMutable(beat))));
  if (modifiers.includes("no_squats")) beats = beats.filter((beat) => beat.type !== "squat");
  if (modifiers.includes("no_weaves")) beats = beats.filter((beat) => beat.type !== "weave_left" && beat.type !== "weave_right");
  if (base.mode === "flow" && modifiers.includes("no_obstacles")) beats = beats.filter((beat) => beat.type !== "obstacle");
  for (const beat of beats) {
    const type = String(beat.type ?? "");
    if (/^(straight|hook|uppercut)_/u.test(type)) {
      const punchModifiers = modifiers.filter((entry) => entry === "any_punch" || entry === "cross_body");
      if (punchModifiers.length > 0) {
        beat.runtimeModifiers = punchModifiers;
        beat.modifier = punchModifiers[0];
      }
    }
    if (type === "guard" && modifiers.includes("crossed_guard")) {
      const target = requireRecord(beat.guardTarget, "guard_target_invalid");
      beat.guardTarget = { ...target, leftCell: target.rightCell, rightCell: target.leftCell, crossed: true };
      beat.runtimeModifiers = ["crossed_guard"];
      beat.modifier = "crossed_guard";
    }
  }
  chartCopy.beats = beats;
  const suffixSeed = await sha256Hex(canonicalJson({ baseChartId: base.chartId, modifiers }));
  const chartId = `${base.chartId}~mods-${suffixSeed.slice(0, 12)}`;
  chartCopy.chartId = chartId;
  if (base.mode === "boxing") {
    const prototype = /** @type {Record<string, unknown>} */ (cloneMutable(requireRecord(chartCopy.prototype, "prototype_invalid")));
    const converterProfile = prototype.converterProfile === undefined ? null : await normalizeConverterProfile(prototype.converterProfile);
    prototype.modifiers = [...modifiers];
    if (converterProfile) prototype.converterProfile = cloneMutable(converterProfile);
    prototype.contentHash = `sha256:${await sha256Hex(canonicalJson(chartHashProjection(beats, base.recipeId, base.rulesetId, requireHashString(prototype.sourceHash, "source_hash_invalid"), converterProfile)))}`;
    chartCopy.prototype = prototype;
  } else {
    chartCopy.contentHash = `sha256:${await sha256Hex(canonicalJson({ beats, rulesetId: chartCopy.rulesetId, rulesetVariants: chartCopy.rulesetVariants, notePalette: chartCopy.notePalette }))}`;
  }
  const frozenChart = /** @type {DataRecord} */ (cloneFrozenData(chartCopy));
  const mapHashValue = base.mode === "flow" ? requireHashString(frozenChart.contentHash, "flow_content_hash_invalid").slice(7) : await sha256Hex(canonicalJson(frozenChart));
  const scoringMapHashValue = base.mode === "flow" ? await sha256Hex(canonicalJson(flowScoringProjection(frozenChart))) : mapHashValue;
  const scoreValue = await sha256Hex(canonicalJson({ packageId, chartId, rulesetId: base.rulesetId, recipeId: base.recipeId, modifiers, mapHashValue: scoringMapHashValue, ranked: false }));
  return Object.freeze({
    variantId: chartId,
    chartId,
    mode: base.mode,
    rulesetId: base.rulesetId,
    recipeId: base.recipeId,
    modifierIds: Object.freeze(modifiers),
    ranked: false,
    localOnly: true,
    mapHash: contentHash(mapHashValue),
    scoreIdentityHash: contentHash(scoreValue),
    provenance: Object.freeze({ schema: "aerobeat/runtime_variant_provenance", version: 1, kind: "runtime_composite", baseVariantId: base.variantId, requestedModifierIds: Object.freeze(requested), effectiveModifierIds: Object.freeze([...modifiers]) }),
    chart: frozenChart
  });
}

/** @param {DataRecord} packageRecord @returns {Promise<Readonly<Record<string, unknown>> | null>} */
async function validatePackageConverterProfile(packageRecord) {
  const source = requireRecord(packageRecord.source, "source_provenance_invalid");
  const sourceValue = source.converterProfile;
  const traceValue = packageRecord.conversionTrace;
  const trace = isPlainDataRecord(traceValue) ? traceValue : null;
  if (sourceValue === undefined) {
    if (trace && trace.converterProfile !== undefined) throw dataError("converter_profile_unbound", "Conversion trace profile requires package source provenance");
    validateUnboundTraceProfiles(trace);
    return null;
  }
  const profile = await normalizeConverterProfile(sourceValue);
  if (!trace) throw dataError("converter_profile_trace_mismatch", "Profile-authored packages require conversion trace provenance");
  const traceProfile = await normalizeConverterProfile(trace.converterProfile);
  if (!sameProfile(profile, traceProfile)) throw dataError("converter_profile_trace_mismatch", "Conversion trace profile must exactly match package source provenance");
  const boxing = requireArray(trace.boxing, "converter_profile_boxing_trace_mismatch");
  if (boxing.length !== 4) throw dataError("converter_profile_boxing_trace_mismatch", "Profile-authored packages require four Boxing trace profiles");
  for (const value of boxing) {
    const boxingTrace = requireRecord(value, "converter_profile_boxing_trace_mismatch");
    const boxingProfile = await normalizeConverterProfile(boxingTrace.converterProfile);
    if (!sameProfile(profile, boxingProfile)) throw dataError("converter_profile_boxing_trace_mismatch", "Every Boxing trace profile must match package source provenance");
  }
  const flow = requireArray(trace.flow, "converter_profile_flow_trace_forbidden");
  for (const value of flow) {
    const flowTrace = requireRecord(value, "converter_profile_flow_trace_forbidden");
    if (flowTrace.converterProfile !== undefined) throw dataError("converter_profile_flow_trace_forbidden", "Flow traces must not carry Boxing converter profile provenance");
  }
  return profile;
}

/** @param {DataRecord | null} trace */
function validateUnboundTraceProfiles(trace) {
  if (!trace) return;
  for (const key of ["boxing", "flow"]) {
    const traces = trace[key];
    if (traces === undefined) continue;
    const values = requireArray(traces, "converter_profile_unbound");
    for (const value of values) if (requireRecord(value, "converter_profile_unbound").converterProfile !== undefined) throw dataError("converter_profile_unbound", "Trace converter profile requires package source provenance");
  }
}

/** @param {DataRecord} prototype @param {Readonly<Record<string, unknown>> | null} expected */
async function validateChartConverterProfile(prototype, expected) {
  if (!expected) {
    if (prototype.converterProfile !== undefined) throw dataError("converter_profile_unbound", "Chart converter profile requires package source provenance");
    return;
  }
  const actual = await normalizeConverterProfile(prototype.converterProfile);
  if (!sameProfile(expected, actual)) throw dataError("converter_profile_chart_mismatch", "Chart converter profile must exactly match package source provenance");
}

/** @param {unknown} value @returns {Promise<Readonly<Record<string, unknown>>>} */
async function normalizeConverterProfile(value) {
  const keys = ["schema", "version", "profileId", "profileVersion", "class", "label", "experimental", "settings", "contentHash"];
  if (!hasExactDataKeys(value, keys)) throw dataError("converter_profile_invalid", "Converter profile must contain the exact bounded profile fields");
  const record = /** @type {DataRecord} */ (value);
  if (record.schema !== "aerobeat/prototype_profile" || record.version !== 1 || record.class !== "converter_regeneration" || record.experimental !== true) throw dataError("converter_profile_invalid", "Converter profile schema, version, class and experimental truth are required");
  const profileId = boundedProfileString(record.profileId, 128);
  const profileVersion = boundedProfileString(record.profileVersion, 64);
  const label = boundedProfileString(record.label, 256);
  if (!hasExactDataKeys(record.settings, ["guardRelocationRadius", "reachAllowanceSubcells"])) throw dataError("converter_profile_settings_invalid", "Converter profile settings must contain the exact supported fields");
  const settingsValue = /** @type {DataRecord} */ (record.settings);
  const settings = Object.freeze({ guardRelocationRadius: boundedProfileInteger(settingsValue.guardRelocationRadius), reachAllowanceSubcells: boundedProfileInteger(settingsValue.reachAllowanceSubcells) });
  const hashBody = Object.freeze({ schema: "aerobeat/prototype_profile", version: 1, profileId, profileVersion, class: "converter_regeneration", settings });
  const contentHash = await sha256Hex(canonicalJson(hashBody));
  if (record.contentHash !== contentHash) throw dataError("converter_profile_hash_mismatch", "Converter profile content hash does not match its canonical identity and settings");
  return Object.freeze({ ...hashBody, label, experimental: true, contentHash });
}

/** @param {unknown} value @param {number} maximum */
function boundedProfileString(value, maximum) { if (typeof value !== "string" || !value || value.length > maximum) throw dataError("converter_profile_invalid", "Converter profile strings must be bounded and non-empty"); return value; }
/** @param {unknown} value */
function boundedProfileInteger(value) { if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 8) throw dataError("converter_profile_settings_invalid", "Converter profile settings must be integers from 0 through 8"); return Number(value); }
/** @param {Readonly<Record<string, unknown>>} left @param {Readonly<Record<string, unknown>>} right */
function sameProfile(left, right) { return canonicalJson(left) === canonicalJson(right); }
/** @param {readonly unknown[]} beats @param {string | null} recipeId @param {string} rulesetId @param {string} sourceHash @param {Readonly<Record<string, unknown>> | null} converterProfile */
function chartHashProjection(beats, recipeId, rulesetId, sourceHash, converterProfile) { return { beats, recipeId, rulesetId, sourceHash, ...(converterProfile ? { converterProfile } : {}) }; }

/** @param {unknown} sourceValue @returns {DataRecord} */
function validateSource(sourceValue) {
  const source = requireRecord(sourceValue, "source_provenance_invalid");
  if (["notePalette", "paletteHash", "appearanceColor"].some((key) => Object.hasOwn(source, key))) throw dataError("source_palette_forbidden", "Package source cannot carry runtime palette fields");
  if (!hasExactOptionalDataKeys(source, ["provider", "sourceId", "sourceVersionHash", "difficulty", "sourceInfoFormat", "sourceInfoVersion", "sourceInfoHash", "sourceDifficultyPath", "sourceBeatmapFormat", "sourceBeatmapVersion", "sourceDifficultyHash", "sourceHash", "spawnTiming", "obstacleContract"], ["converterProfile"])) throw dataError("source_provenance_invalid", "Package source must contain only exact authored provenance fields");
  for (const key of ["provider", "sourceId", "sourceVersionHash", "difficulty", "sourceDifficultyPath"]) requireString(source[key], "source_provenance_invalid");
  for (const key of ["sourceHash", "sourceInfoHash", "sourceDifficultyHash"]) requireHashString(source[key], "source_hash_invalid");
  if (source.sourceInfoFormat !== "v2" && source.sourceInfoFormat !== "v4") throw dataError("source_format_provenance_invalid", "Source Info format must be v2 or v4");
  if (source.sourceBeatmapFormat !== "v2" && source.sourceBeatmapFormat !== "v3" && source.sourceBeatmapFormat !== "v4") throw dataError("source_format_provenance_invalid", "Source beatmap format must be v2, v3, or v4");
  if ((source.sourceInfoFormat === "v2" && source.sourceBeatmapFormat === "v4") || (source.sourceInfoFormat === "v4" && source.sourceBeatmapFormat !== "v4")) throw dataError("source_format_provenance_invalid", "Info v2 supports beatmap v2/v3 only; Info v4 requires beatmap v4");
  for (const key of ["sourceInfoVersion", "sourceBeatmapVersion"]) if (source[key] !== null && (typeof source[key] !== "string" || !/^\d+\.\d+\.\d+$/u.test(String(source[key])))) throw dataError("source_format_provenance_invalid", "Source format versions must be null or exact semantic versions");
  if (source.obstacleContract !== "normalized_obstacle_v2") throw dataError("obstacle_contract_invalid", "Package source must bind normalized_obstacle_v2");
  return source;
}

/** @param {unknown} setsValue @param {Set<string>} chartIds */
function validateSets(setsValue, chartIds) {
  const sets = requireArray(setsValue, "sets_invalid");
  const setIds = new Set();
  const linkedCharts = new Set();
  for (const item of sets) {
    const set = requireRecord(item, "set_invalid");
    const setId = requireString(set.setId, "set_identity_invalid");
    const chartId = requireString(set.chartId, "set_chart_invalid");
    if (setIds.has(setId) || !chartIds.has(chartId)) throw dataError("set_reference_invalid", "Set identities and chart references must be unique and valid");
    setIds.add(setId); linkedCharts.add(chartId);
  }
  if ([...chartIds].some((chartId) => !linkedCharts.has(chartId))) throw dataError("set_reference_missing", "Every chart must have a set reference");
}

/** @param {readonly unknown[]} beats @param {boolean} boxing @param {(beat:number)=>number} beatToTimelineMs */
function validateEvents(beats, boxing, beatToTimelineMs) {
  const ids = new Set();
  const lineageOwners = new Set();
  let obstacleCount = 0;
  for (let index = 0; index < beats.length; index += 1) {
    const beat = requireRecord(beats[index], "event_invalid");
    if (["appearanceColor", "notePalette", "paletteHash"].some((key) => Object.hasOwn(beat, key))) throw dataError(boxing ? "boxing_palette_forbidden" : "authored_appearance_forbidden", `Event ${index} cannot carry runtime palette appearance fields`);
    if (!Number.isFinite(beat.start) || Number(beat.start) < 0 || typeof beat.type !== "string" || beat.type.length === 0) throw dataError("event_shape_invalid", `Event ${index} is invalid`);
    if (!boxing) validateFlowEvent(beat, index);
    requireBoundedEventTimestamp(beat.start, beatToTimelineMs, index, "start");
    if (Object.hasOwn(beat, "end") && (!Number.isFinite(beat.end) || Number(beat.end) < Number(beat.start))) throw dataError("event_interval_invalid", `Event ${index} interval is invalid`);
    if (Object.hasOwn(beat, "end")) requireBoundedEventTimestamp(beat.end, beatToTimelineMs, index, "end");
    if (!boxing && beat.type === "obstacle") {
      obstacleCount += 1;
      const keys = ["start", "end", "type", "sourceGeometry", "gameplayGeometry", "gridMask"];
      if (!hasExactDataKeys(beat, keys) || Number(beat.end) <= Number(beat.start) || !isObstacleSourceGeometry(beat.sourceGeometry) || !isObstacleGameplayGeometry(beat.gameplayGeometry) || !isObstacleGridMask(beat.gridMask, /** @type {import("@aerobeat/web-contracts/obstacle-contracts").AeroObstacleGameplayGeometry} */ (beat.gameplayGeometry))) throw dataError("flow_obstacle_invalid", `Event ${index} obstacle source/gameplay geometry, mask, or interval is invalid`);
      if (obstacleCount > maximumObstaclesPerChart) throw dataError("flow_obstacle_limit_exceeded", "Flow chart exceeds the obstacle limit");
    }
    if (!boxing) continue;
    const eventId = requireString(beat.eventId, "event_identity_invalid");
    if (ids.has(eventId)) throw dataError("event_identity_duplicate", "Boxing event IDs must be unique");
    ids.add(eventId);
    if (!Array.isArray(beat.sourceEventIds) || beat.sourceEventIds.length === 0 || beat.sourceEventIds.length > 64 || beat.sourceEventIds.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 512) || new Set(beat.sourceEventIds).size !== beat.sourceEventIds.length) throw dataError("event_lineage_invalid", "Boxing event lineage is required and must be unique");
    if (beat.sourceEventIds.some((entry) => lineageOwners.has(entry))) throw dataError("event_lineage_duplicate", "Source event lineage cannot identify multiple authored targets");
    for (const entry of beat.sourceEventIds) lineageOwners.add(entry);
    if (/^(squat|weave_)/u.test(String(beat.type))) {
      obstacleCount += 1;
      if (obstacleCount > maximumObstaclesPerChart) throw dataError("boxing_obstacle_limit_exceeded", "Boxing chart exceeds the obstacle limit");
      if (!Object.hasOwn(beat, "end") || Number(beat.end) <= Number(beat.start) || !isObstacleSourceGeometry(beat.sourceGeometry) || !isObstacleGameplayGeometry(beat.gameplayGeometry) || !isObstacleGridMask(beat.gridMask, /** @type {import("@aerobeat/web-contracts/obstacle-contracts").AeroObstacleGameplayGeometry} */ (beat.gameplayGeometry))) throw dataError("boxing_obstacle_invalid", `Event ${index} obstacle source/gameplay geometry, mask, or interval is invalid`);
      if (canonicalJson(beat.blockedCells) !== canonicalJson(beat.gridMask) || obstacleActionForCells(/** @type {readonly number[]} */ (beat.gridMask)) !== beat.type) throw dataError("boxing_obstacle_invalid", `Event ${index} action and blocked cells must exactly match the normalized grid mask`);
      const checkpoint = requireRecord(beat.checkpoint, "boxing_obstacle_invalid");
      const expectedSafeCells = Array.from({ length: 12 }, (_, cell) => cell).filter((cell) => !/** @type {readonly number[]} */ (beat.gridMask).includes(cell));
      if (checkpoint.kind !== "instantaneous" || canonicalJson(checkpoint.noseSafeCells) !== canonicalJson(expectedSafeCells)) throw dataError("boxing_obstacle_invalid", `Event ${index} checkpoint must retain the exact instantaneous normalized safe-cell complement`);
    }
  }
}

/** @param {DataRecord} beat @param {number} index */
function validateFlowEvent(beat, index) {
  const invalid = () => dataError("flow_event_shape_invalid", `Flow event ${index} must match its exact authored ${String(beat.type)} schema`);
  if (beat.type === "note") {
    const keys = beat.requiresDirection === true
      ? ["start", "type", "hand", "placement", "requiresDirection", "angleOffset", "direction"]
      : ["start", "type", "hand", "placement", "requiresDirection", "angleOffset"];
    if (!hasExactDataKeys(beat, keys) || (beat.hand !== "left" && beat.hand !== "right") || !integerInRange(beat.placement, 0, 11) || typeof beat.requiresDirection !== "boolean" || !Number.isFinite(beat.angleOffset) || (beat.requiresDirection === true && !integerInRange(beat.direction, 0, 7))) throw invalid();
    return;
  }
  if (beat.type === "bomb") {
    if (!hasExactDataKeys(beat, ["start", "type", "placement"]) || !integerInRange(beat.placement, 0, 11)) throw invalid();
    return;
  }
  if (beat.type === "obstacle") {
    if (!hasExactDataKeys(beat, ["start", "end", "type", "sourceGeometry", "gameplayGeometry", "gridMask"])) throw invalid();
    return;
  }
  if (beat.type === "arc") {
    if (!hasExactOptionalDataKeys(beat, ["start", "end", "type", "hand", "startPlacement", "endPlacement", "startDirection", "endDirection", "headCurveMultiplier", "tailCurveMultiplier", "midAnchorMode"], ["startNoteRef", "endNoteRef"]) || (beat.hand !== "left" && beat.hand !== "right") || !integerInRange(beat.startPlacement, 0, 11) || !integerInRange(beat.endPlacement, 0, 11) || !integerInRange(beat.startDirection, 0, 8) || !integerInRange(beat.endDirection, 0, 8) || !Number.isFinite(beat.headCurveMultiplier) || !Number.isFinite(beat.tailCurveMultiplier) || !Number.isInteger(beat.midAnchorMode) || (Object.hasOwn(beat, "startNoteRef") && !boundedNonEmptyString(beat.startNoteRef, 512)) || (Object.hasOwn(beat, "endNoteRef") && !boundedNonEmptyString(beat.endNoteRef, 512))) throw invalid();
    return;
  }
  if (beat.type === "burst") {
    if (!hasExactOptionalDataKeys(beat, ["start", "end", "type", "hand", "placement", "direction", "tailPlacement", "checkpointCount"], ["spacingBias"]) || (beat.hand !== "left" && beat.hand !== "right") || !integerInRange(beat.placement, 0, 11) || !integerInRange(beat.tailPlacement, 0, 11) || !integerInRange(beat.direction, 0, 8) || !Number.isInteger(beat.checkpointCount) || Number(beat.checkpointCount) < 1 || (Object.hasOwn(beat, "spacingBias") && !Number.isFinite(beat.spacingBias))) throw invalid();
    return;
  }
  throw invalid();
}

/** @param {readonly number[]} cells */
function obstacleActionForCells(cells) { let left=0,right=0; for(const cell of cells) cell%4<=1?left+=1:right+=1; return left>right?"weave_right":right>left?"weave_left":"squat"; }

/** @param {unknown} beatValue @param {(beat:number)=>number} beatToTimelineMs @param {number} index @param {"start"|"end"} field */
function requireBoundedEventTimestamp(beatValue, beatToTimelineMs, index, field) {
  try { return beatToTimelineMs(Number(beatValue)); }
  catch { throw dataError("event_timeline_invalid", `Event ${index} ${field} exceeds the 24-hour runtime timeline`); }
}

/** @param {DataRecord} song */
function readTimingMapper(song) {
  try {
    const timing = plainRecordForContract(song.timing, "song_timing_invalid");
    timing.tempoSegments = requireArray(timing.tempoSegments, "song_timing_invalid").map((value) => plainRecordForContract(value, "song_timing_invalid"));
    timing.stopSegments = requireArray(timing.stopSegments, "song_timing_invalid").map((value) => plainRecordForContract(value, "song_timing_invalid"));
    timing.timeSignatureSegments = requireArray(timing.timeSignatureSegments, "song_timing_invalid").map((value) => plainRecordForContract(value, "song_timing_invalid"));
    return createAuthoredBeatToTimelineMs(timing);
  } catch { throw dataError("song_timing_invalid", "Song timing must be exact, ordered, finite, and bounded to 24 hours"); }
}

/** @param {DataRecord} song */
function readBpm(song) {
  const timing = requireRecord(song.timing, "song_timing_invalid");
  const tempos = requireArray(timing.tempoSegments, "song_timing_invalid");
  const first = requireRecord(tempos[0], "song_timing_invalid");
  if (!Number.isFinite(first.bpm) || Number(first.bpm) <= 0) throw dataError("song_bpm_invalid", "Song BPM must be positive");
  return Number(first.bpm);
}

/** @param {unknown} value @returns {Promise<import("@aerobeat/web-contracts").AeroAuthoredNotePalette | null>} */
async function validateAuthoredPalette(value) {
  if (value === null) return null;
  const normalized = plainRecordForContract(value, "note_palette_invalid");
  normalized.provenance = plainRecordForContract(normalized.provenance, "note_palette_invalid");
  if (!isAuthoredNotePalette(normalized)) throw dataError("note_palette_invalid", "Authored note palette has an invalid shape");
  const palette = /** @type {import("@aerobeat/web-contracts").AeroAuthoredNotePalette} */ (normalized);
  const base = { schema: palette.schema, version: palette.version, left: palette.left, right: palette.right, colorSpace: palette.colorSpace, alpha: palette.alpha, provenance: palette.provenance };
  const actualHash = `sha256:${await sha256Hex(canonicalJson(base))}`;
  if (palette.paletteHash !== actualHash) throw dataError("note_palette_hash_mismatch", "Authored note palette failed canonical hash verification");
  return Object.freeze({ ...palette, provenance: Object.freeze({ ...palette.provenance }) });
}

/** @param {import("@aerobeat/web-contracts").AeroAuthoredNotePalette | null} palette @param {DataRecord} source */
function validatePaletteSourceBinding(palette, source) {
  if (palette === null) return;
  if (palette.provenance.infoFormat !== source.sourceInfoFormat || palette.provenance.infoHash !== source.sourceInfoHash || palette.provenance.difficultyHash !== source.sourceDifficultyHash) throw dataError("note_palette_provenance_mismatch", "Authored note palette must bind the exact package source Info and difficulty hashes");
}

/** @param {import("@aerobeat/web-contracts").AeroAuthoredNotePalette | null} palette @returns {Promise<AeroEffectiveNotePalette>} */
async function createEffectivePalette(palette) {
  const body = palette === null
    ? { schema: /** @type {const} */ ("aerobeat/effective_note_palette"), version: /** @type {const} */ (1), left: defaultNotePalette.left, right: defaultNotePalette.right, colorSpace: /** @type {const} */ ("srgb"), source: /** @type {const} */ ("aerobeat_default") }
    : { schema: /** @type {const} */ ("aerobeat/effective_note_palette"), version: /** @type {const} */ (1), left: palette.left, right: palette.right, colorSpace: /** @type {const} */ ("srgb"), source: /** @type {const} */ ("song") };
  const result = /** @type {AeroEffectiveNotePalette} */ (Object.freeze({ ...body, paletteHash: `sha256:${await sha256Hex(canonicalJson(body))}` }));
  if (!isEffectiveNotePalette(result)) throw dataError("effective_note_palette_invalid", "Effective note palette could not be constructed");
  return result;
}

/** @param {unknown} referenceValue @param {import("@aerobeat/web-contracts").AeroAuthoredNotePalette | null} palette */
function validateFlowPaletteReference(referenceValue, palette) {
  if (palette === null) {
    if (referenceValue !== null) throw dataError("flow_note_palette_mismatch", "Flow palette reference must match the package palette");
    return;
  }
  if (!hasExactDataKeys(referenceValue, ["source", "paletteHash"])) throw dataError("flow_note_palette_mismatch", "Flow palette reference has an invalid shape");
  const reference = /** @type {DataRecord} */ (referenceValue);
  if (reference.source !== "package" || reference.paletteHash !== palette.paletteHash) throw dataError("flow_note_palette_mismatch", "Flow palette reference must bind the exact package palette hash");
}

/** @param {unknown} traceValue @param {Readonly<Record<string, unknown>>} spawnTiming */
function validateSpawnTimingTrace(traceValue,spawnTiming){const trace=requireRecord(traceValue,"spawn_timing_trace_mismatch");if(canonicalJson(trace.spawnTiming)!==canonicalJson(spawnTiming))throw dataError("spawn_timing_trace_mismatch","Top conversion trace must bind exact source spawn timing");for(const key of ["boxing","flow"]){const values=requireArray(trace[key],"spawn_timing_trace_mismatch");for(const value of values)if(canonicalJson(requireRecord(value,"spawn_timing_trace_mismatch").spawnTiming)!==canonicalJson(spawnTiming))throw dataError("spawn_timing_trace_mismatch","Every conversion trace must bind exact source spawn timing");}}

/** @param {unknown} traceValue @param {import("@aerobeat/web-contracts").AeroAuthoredNotePalette | null} palette @param {string} flowContentHash @param {DataRecord} source */
function validateFlowTraceBinding(traceValue, palette, flowContentHash, source) {
  const trace = requireRecord(traceValue, "note_palette_trace_mismatch");
  try { validateFlowPaletteReference(trace.notePalette, palette); }
  catch { throw dataError("note_palette_trace_mismatch", "Top conversion trace must bind the package note palette reference"); }
  const flowTraces = requireArray(trace.flow, "flow_trace_invalid");
  if (flowTraces.length !== 1) throw dataError("flow_trace_invalid", "Package must carry exactly one Flow conversion trace");
  const flowTrace = requireRecord(flowTraces[0], "flow_trace_invalid");
  if (!hasExactDataKeys(flowTrace, ["difficulty", "events", "obstacleContract", "sourceHash", "sourceInfoFormat", "sourceInfoVersion", "sourceInfoHash", "sourceDifficultyPath", "sourceBeatmapFormat", "sourceBeatmapVersion", "sourceDifficultyHash", "spawnTiming", "rulesetId", "rulesetVariants", "notePalette", "contentHash"])) throw dataError("flow_trace_invalid", "Flow conversion trace must contain only exact authored successor fields");
  try { validateFlowPaletteReference(flowTrace.notePalette, palette); }
  catch { throw dataError("flow_trace_invalid", "Flow conversion trace must bind the package note palette reference"); }
  if (flowTrace.rulesetId !== FLOW_GRID_RULESET_ID || !hasExactFlowRulesetVariants(flowTrace.rulesetVariants) || flowTrace.obstacleContract !== "normalized_obstacle_v2") throw dataError("flow_trace_invalid", "Flow conversion trace must bind the exact ordered successor rulesets and obstacle contract");
  for (const key of ["sourceHash", "sourceInfoFormat", "sourceInfoVersion", "sourceInfoHash", "sourceDifficultyPath", "sourceBeatmapFormat", "sourceBeatmapVersion", "sourceDifficultyHash"]) if (flowTrace[key] !== source[key]) throw dataError("flow_trace_invalid", "Flow conversion trace must bind exact package source provenance");
  if (flowTrace.contentHash !== flowContentHash) throw dataError("flow_trace_content_hash_mismatch", "Flow conversion trace must bind the exact Flow content hash");
}

/** @param {unknown} value */
function hasExactFlowRulesetVariants(value) { return Array.isArray(value) && value.length === FLOW_RULESET_VARIANTS.length && value.every((entry, index) => entry === FLOW_RULESET_VARIANTS[index]); }

/** @param {DataRecord} packageValue */
async function semanticParityHash(packageValue) { return sha256Hex(canonicalJson(semanticParityProjection(packageValue))); }
/** @param {DataRecord} packageValue */
function semanticParityProjection(packageValue) {
  const charts = requireArray(packageValue.charts, "semantic_parity_invalid");
  return {
    packageSchema: packageValue.schemaId,
    packageSchemaVersion: packageValue.schemaVersion,
    packageVersion: packageValue.packageVersion,
    packageId: packageValue.packageId,
    songId: packageValue.songId,
    source: isPlainDataRecord(packageValue.source) ? pick(packageValue.source, ["provider", "sourceId", "sourceVersionHash", "difficulty", "sourceInfoFormat", "sourceInfoVersion", "sourceInfoHash", "sourceDifficultyPath", "sourceBeatmapFormat", "sourceBeatmapVersion", "sourceDifficultyHash", "spawnTiming", "obstacleContract", "converterProfile"]) : null,
    notePalette: Object.hasOwn(packageValue, "notePalette") ? packageValue.notePalette : null,
    song: isPlainDataRecord(packageValue.song) ? pick(packageValue.song, ["schemaId", "schemaVersion", "recordVersion", "songId", "songName", "durationSec", "audio", "timing"]) : null,
    sets: Array.isArray(packageValue.sets) ? packageValue.sets.map((set) => isPlainDataRecord(set) ? pick(set, ["schemaId", "schemaVersion", "recordVersion", "setId", "setName", "songId", "chartId"]) : null) : [],
    recipeDefinitions: Array.isArray(packageValue.recipeDefinitions) ? packageValue.recipeDefinitions.map(projectDefinition) : [],
    rulesetDefinitions: Array.isArray(packageValue.rulesetDefinitions) ? packageValue.rulesetDefinitions.map(projectDefinition) : [],
    presentationSuggestion: Object.hasOwn(packageValue, "presentationSuggestion") ? packageValue.presentationSuggestion : null,
    charts: charts.map((chartValue) => {
      if (!isPlainDataRecord(chartValue)) return null;
      const prototype = isPlainDataRecord(chartValue.prototype) ? chartValue.prototype : null;
      return {
        schemaId: chartValue.schemaId, schemaVersion: chartValue.schemaVersion, recordVersion: chartValue.recordVersion, chartId: chartValue.chartId, chartName: chartValue.chartName, mode: chartValue.mode, difficulty: chartValue.difficulty,
        ...(Object.hasOwn(chartValue, "rulesetId") ? { rulesetId: chartValue.rulesetId } : {}),
        ...(chartValue.mode === "flow" ? { ...(Object.hasOwn(chartValue, "rulesetVariants") ? { rulesetVariants: chartValue.rulesetVariants } : {}), notePalette: chartValue.notePalette, contentHash: chartValue.contentHash } : {}),
        prototype: prototype ? pick(prototype, ["contractId", "recipeId", "recipeVersion", "rulesetId", "rulesetVersion", "modifiers", "converterProfile", "regenerationRequiredFor"]) : null,
        presentationSuggestion: Object.hasOwn(chartValue, "presentationSuggestion") ? chartValue.presentationSuggestion : null,
        beats: Array.isArray(chartValue.beats) ? chartValue.beats.map(projectParityBeat) : []
      };
    }),
    traces: projectTraces(packageValue.conversionTrace)
  };
}
/** @param {unknown} value */
function projectDefinition(value) { if (!isPlainDataRecord(value)) return null; const result = {}; for (const key of Reflect.ownKeys(value)) { if (typeof key !== "string" || /hash/iu.test(key)) continue; const descriptor = Object.getOwnPropertyDescriptor(value, key); if (descriptor && "value" in descriptor && descriptor.enumerable) result[key] = descriptor.value; } return result; }
/** @param {unknown} value */
function projectTraces(value) { if (!isPlainDataRecord(value)) return null; const boxing = Array.isArray(value.boxing) ? value.boxing.map((trace) => isPlainDataRecord(trace) ? { ...pick(trace, ["chartId", "difficulty", "bpm", "recipeId", "rulesetId", "sourceInfoFormat", "sourceInfoVersion", "sourceInfoHash", "sourceDifficultyPath", "sourceBeatmapFormat", "sourceBeatmapVersion", "sourceDifficultyHash", "spawnTiming", "converterProfile"]), optimizer: trace.optimizer, events: trace.events } : null) : []; const flow = Array.isArray(value.flow) ? value.flow : null; return { boxing, flow, spawnTiming: value.spawnTiming, ...(value.converterProfile ? { converterProfile: value.converterProfile } : {}) }; }
/** @param {DataRecord} value @param {readonly string[]} keys */
function pick(value, keys) { const result = {}; for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (descriptor && "value" in descriptor && descriptor.enumerable) result[key] = descriptor.value; } return result; }
/** @param {unknown} beat */
function projectParityBeat(beat) { return isPlainDataRecord(beat) ? pick(beat, ["start", "end", "type", "eventId", "sourceEventIds", "hand", "placement", "direction", "angleOffset", "requiresDirection", "sourceGeometry", "gameplayGeometry", "gridMask", "startPlacement", "endPlacement", "startDirection", "endDirection", "tailPlacement", "checkpointCount", "modifier", "spatialTarget", "guardTarget", "checkpoint", "blockedCells"]) : null; }

/** @param {DataRecord} chart */
function flowScoringProjection(chart) {
  const result = Object.create(null);
  for (const key of Object.keys(chart)) if (key !== "notePalette" && key !== "contentHash" && key !== "rulesetVariants") result[key] = chart[key];
  // The successor declaration changes package/chart integrity, not the existing Flow Grid score partition.
  result.schemaId = "aerobeat.chart.flow.v4";
  result.schemaVersion = 4;
  return result;
}

/** @param {unknown} value @param {string} code @returns {Record<string, unknown>} */
function plainRecordForContract(value, code) {
  const record = requireRecord(value, code);
  const result = {};
  for (const key of Reflect.ownKeys(record)) Object.defineProperty(result, key, { configurable: true, enumerable: true, writable: true, value: record[key] });
  return result;
}
/** @param {unknown} value */
function rejectPrivateEvidence(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw dataError("private_evidence_forbidden", "Private evidence keys must never enter package data");
    const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
    const forbidden = normalized.includes("collision") || normalized.includes("collider") || normalized.startsWith("wrist") || (normalized.startsWith("nose") && normalized !== "nosesafecells") || normalized.includes("landmark") || normalized.includes("trajectory") || normalized.includes("segmentendpoint") || normalized === "distance" || normalized.includes("contactdistance") || normalized.includes("velocityvector") || normalized.startsWith("confidence") || normalized.startsWith("calibration") || normalized === "frameid" || normalized.startsWith("sourcecontact") || normalized.startsWith("contactepisode");
    if (forbidden) throw dataError("private_evidence_forbidden", `Private collision/body evidence field ${key} is forbidden`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) throw dataError("private_evidence_forbidden", "Private evidence accessors are forbidden");
    rejectPrivateEvidence(descriptor.value);
  }
}
/** @param {unknown} value @param {readonly string[]} required @param {readonly string[]} optional */
function hasExactOptionalDataKeys(value, required, optional) { if (!isPlainDataRecord(value)) return false; const keys = Reflect.ownKeys(value); return required.every((key) => keys.includes(key)) && keys.every((key) => typeof key === "string" && (required.includes(key) || optional.includes(key))); }
/** @param {unknown} value @param {number} minimum @param {number} maximum */
function integerInRange(value, minimum, maximum) { return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum; }
/** @param {unknown} value @param {number} maximum */
function boundedNonEmptyString(value, maximum) { return typeof value === "string" && value.length > 0 && value.length <= maximum; }
/** @param {unknown} value @param {string} code @returns {DataRecord} */
function requireRecord(value, code) { if (!isPlainDataRecord(value)) throw dataError(code, "Expected a plain content record"); return value; }
/** @param {unknown} value @param {string} code @returns {readonly unknown[]} */
function requireArray(value, code) { if (!Array.isArray(value)) throw dataError(code, "Expected a content array"); return value; }
/** @param {unknown} value @param {string} code @returns {string} */
function requireString(value, code) { if (typeof value !== "string" || value.length === 0) throw dataError(code, "Expected a non-empty content string"); return value; }
/** @param {unknown} value @param {string} code @returns {string} */
function requireHashString(value, code) { if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) throw dataError(code, "Expected a lowercase SHA-256 hash"); return value; }
/** @param {unknown} value @returns {string} */
function normalizeDeclaredHash(value) { if (value === null || value === undefined) return ""; if (typeof value === "string") { if (!/^sha256:[0-9a-f]{64}$/u.test(value)) throw dataError("package_hash_invalid", "Declared package hash is invalid"); return value.slice(7); } if (hasExactDataKeys(value, ["schema", "version", "algorithm", "value"]) && value.schema === "aerobeat/content_hash" && value.version === 1 && value.algorithm === "sha256" && typeof value.value === "string" && /^[0-9a-f]{64}$/u.test(value.value)) return value.value; throw dataError("package_hash_invalid", "Declared package hash is invalid"); }
/** @param {unknown} value @returns {string[]} */
function normalizeModifiers(value) {
  if (!Array.isArray(value) || value.length > mapModifierIds.length || value.some((entry) => typeof entry !== "string")) throw dataError("modifiers_invalid", "Modifiers must be a bounded string array");
  const result = [...new Set(value)].sort();
  if (result.some((entry) => !mapModifierIds.includes(/** @type {"no_squats" | "no_weaves" | "any_punch" | "crossed_guard" | "cross_body"} */ (entry)))) throw dataError("modifier_invalid", "Modifier is unsupported");
  return result;
}
/** @param {readonly unknown[]} beats @param {readonly string[]} identity */
function validateEventModifierIdentity(beats, identity) {
  for (const value of beats) {
    const beat = requireRecord(value, "event_invalid");
    const emitted = [];
    if (beat.modifier !== undefined && beat.modifier !== null) emitted.push(beat.modifier);
    if (beat.runtimeModifiers !== undefined) {
      if (!Array.isArray(beat.runtimeModifiers)) throw dataError("event_modifier_invalid", "Event runtimeModifiers must be an array");
      emitted.push(...beat.runtimeModifiers);
    }
    if (emitted.some((entry) => typeof entry !== "string" || !identity.includes(entry))) throw dataError("event_modifier_not_in_identity", "Every emitted event modifier must be declared in chart identity");
    if (beat.type === "guard" && isPlainDataRecord(beat.guardTarget) && beat.guardTarget.crossed === true && !identity.includes("crossed_guard")) throw dataError("crossed_guard_identity_missing", "Crossed guard events require crossed_guard chart identity");
  }
}
/** @param {string} value */
function contentHash(value) { return Object.freeze({ schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value }); }
/** @param {unknown} value @returns {unknown} */
function cloneMutable(value) { if (Array.isArray(value)) return value.map(cloneMutable); if (isPlainDataRecord(value)) { const result = {}; for (const key of Object.keys(value)) result[key] = cloneMutable(value[key]); return result; } return value; }
