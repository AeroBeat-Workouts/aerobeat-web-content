// @ts-check

import { isObstacleGameplayGeometry, isObstacleGridMask, isObstacleSourceGeometry, maximumObstaclesPerChart } from "@aerobeat/web-contracts/obstacle-contracts";
import {
  conversionRecipeIds,
  mapModifierIds,
  rulesetIds
} from "@aerobeat/web-contracts";
import { canonicalJson, cloneFrozenData, dataError, hasExactDataKeys, isPlainDataRecord, runtimePackageDataLimits, sha256Hex } from "./runtime-data.js";

/** @typedef {Readonly<Record<string, unknown>>} DataRecord */
/** @typedef {Readonly<{variantId: string, chartId: string, mode: "flow" | "boxing", rulesetId: string, recipeId: string | null, modifierIds: readonly string[], ranked: boolean, localOnly: boolean, mapHash: Readonly<Record<string, unknown>>, scoreIdentityHash: Readonly<Record<string, unknown>>, provenance: Readonly<Record<string, unknown>>, chart: DataRecord}>} RuntimeVariant */

const maximumEventTimelineMs = 24 * 60 * 60 * 1000;

/**
 * Narrow and verify one canonical package and return its immutable variant catalog.
 *
 * @param {unknown} packageValue
 * @param {{declaredPackageHash?: string | Readonly<Record<string, unknown>> | null, supportedRulesetIds?: readonly string[], supportedRecipeIds?: readonly string[]}} [options]
 */
export async function validateRuntimePackage(packageValue, options = {}) {
  const packageRecord = /** @type {DataRecord} */ (cloneFrozenData(packageValue, runtimePackageDataLimits));
  requireString(packageRecord.schemaId, "package_schema_invalid");
  if ((packageRecord.schemaId === "aerobeat.song-package.v1" && packageRecord.schemaVersion === 1) || (packageRecord.schemaId === "aerobeat.song-package.v2" && packageRecord.schemaVersion === 2)) throw dataError("flow_obstacle_reimport_required", "Prior-contract package requires reimport for normalized obstacle geometry");
  if (packageRecord.schemaId !== "aerobeat.song-package.v3" || packageRecord.schemaVersion !== 3 || packageRecord.packageVersion !== "3.0.0") throw dataError("package_schema_invalid", "Song package schema/version is unsupported");
  const packageId = requireString(packageRecord.packageId, "package_identity_invalid");
  const songId = requireString(packageRecord.songId, "package_identity_invalid");
  const song = requireRecord(packageRecord.song, "song_invalid");
  if (song.songId !== songId) throw dataError("song_identity_mismatch", "Package and song identities do not match");
  validateSource(packageRecord.source);
  const converterProfile = await validatePackageConverterProfile(packageRecord);
  const bpm = readBpm(song);
  const charts = requireArray(packageRecord.charts, "charts_invalid");
  if (charts.length !== 5) throw dataError("chart_count_invalid", "Package must contain Flow plus exactly four Boxing prototype charts");
  const chartIds = new Set();
  /** @type {RuntimeVariant[]} */
  const variants = [];
  const matrix = new Set();
  let flowCount = 0;
  for (let index = 0; index < charts.length; index += 1) {
    const chart = requireRecord(charts[index], "chart_invalid");
    const chartId = requireString(chart.chartId, "chart_identity_invalid");
    if (chartIds.has(chartId)) throw dataError("chart_identity_duplicate", "Chart IDs must be unique");
    chartIds.add(chartId);
    const beats = requireArray(chart.beats, "chart_beats_invalid");
    validateEvents(beats, chart.mode === "boxing", bpm);
    let rulesetId = "flow_grid_v2";
    let recipeId = null;
    /** @type {string[]} */
    let modifierIds = [];
    let declaredChartHash = "";
    if (chart.mode === "flow") {
      flowCount += 1;
      if (chart.schemaId !== "aerobeat.chart.flow.v3" || chart.schemaVersion !== 3 || chart.rulesetId !== "flow_grid_v2") throw dataError("flow_chart_schema_invalid", "Flow chart must use normalized obstacle schema/ruleset v3");
      declaredChartHash = await sha256Hex(canonicalJson(chart));
    } else if (chart.mode === "boxing") {
      const prototype = requireRecord(chart.prototype, "prototype_invalid");
      await validateChartConverterProfile(prototype, converterProfile);
      if (prototype.contractId !== "aerobeat.boxing.prototype.v1") throw dataError("prototype_contract_invalid", "Boxing prototype contract is unsupported");
      requireString(prototype.recipeVersion, "recipe_version_invalid");
      requireString(prototype.rulesetVersion, "ruleset_version_invalid");
      requireHashString(prototype.recipeHash, "recipe_hash_invalid");
      requireHashString(prototype.rulesetHash, "ruleset_hash_invalid");
      rulesetId = requireString(prototype.rulesetId, "ruleset_invalid");
      recipeId = requireString(prototype.recipeId, "recipe_invalid");
      if (!rulesetIds.includes(/** @type {"flow_grid_v1" | "flow_grid_v2" | "boxing_semantic_track_v1" | "boxing_spatial_grid_v1"} */ (rulesetId)) || rulesetId.startsWith("flow_grid_")) throw dataError("ruleset_invalid", "Boxing ruleset is unsupported");
      if (!conversionRecipeIds.includes(/** @type {"row_family_balanced_height_v1" | "cut_family_source_height_v1"} */ (recipeId))) throw dataError("recipe_invalid", "Conversion recipe is unsupported");
      if (options.supportedRulesetIds && !options.supportedRulesetIds.includes(rulesetId)) throw dataError("ruleset_unavailable", `Ruleset ${rulesetId} is unavailable`);
      if (options.supportedRecipeIds && !options.supportedRecipeIds.includes(recipeId)) throw dataError("recipe_unavailable", `Recipe ${recipeId} is unavailable`);
      modifierIds = normalizeModifiers(prototype.modifiers);
      validateEventModifierIdentity(beats, modifierIds);
      const sourceHash = requireHashString(prototype.sourceHash, "source_hash_invalid");
      declaredChartHash = requireHashString(prototype.contentHash, "chart_hash_invalid").slice(7);
      const actualChartHash = await sha256Hex(canonicalJson(chartHashProjection(beats, recipeId, rulesetId, `sha256:${sourceHash.slice(7)}`, converterProfile)));
      if (actualChartHash !== declaredChartHash) throw dataError("chart_hash_mismatch", `Chart ${chartId} failed content-hash verification`);
      matrix.add(`${recipeId}|${rulesetId}`);
    } else {
      throw dataError("chart_mode_invalid", "Only Flow and Boxing charts are supported");
    }
    const mapHash = contentHash(declaredChartHash);
    const scoreValue = await sha256Hex(canonicalJson({ packageId, chartId, rulesetId, recipeId, modifierIds, mapHash: declaredChartHash, ranked: true }));
    variants.push(Object.freeze({
      variantId: chartId,
      chartId,
      mode: chart.mode,
      rulesetId,
      recipeId,
      modifierIds: Object.freeze([...modifierIds]),
      ranked: true,
      localOnly: false,
      mapHash,
      scoreIdentityHash: contentHash(scoreValue),
      provenance: Object.freeze({ schema: "aerobeat/runtime_variant_provenance", version: 1, kind: "authored", baseVariantId: null, requestedModifierIds: Object.freeze([]), effectiveModifierIds: Object.freeze([...modifierIds]) }),
      chart
    }));
  }
  if (flowCount !== 1) throw dataError("flow_variant_invalid", "Package must contain exactly one Flow chart");
  const expectedMatrix = conversionRecipeIds.flatMap((recipe) => ["boxing_semantic_track_v1", "boxing_spatial_grid_v1"].map((ruleset) => `${recipe}|${ruleset}`));
  if (!expectedMatrix.every((identity) => matrix.has(identity))) throw dataError("boxing_matrix_incomplete", "Package does not contain all four Boxing prototype variants");
  validateSets(packageRecord.sets, chartIds);
  const packageHashValue = await sha256Hex(canonicalJson(packageRecord));
  const expectedPackageHash = normalizeDeclaredHash(options.declaredPackageHash);
  if (expectedPackageHash && expectedPackageHash !== packageHashValue) throw dataError("package_hash_mismatch", "Song package failed declared hash verification");
  return Object.freeze({
    package: packageRecord,
    packageId,
    packageHash: contentHash(packageHashValue),
    song,
    bpm,
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
  }
  const frozenChart = /** @type {DataRecord} */ (cloneFrozenData(chartCopy));
  const mapHashValue = await sha256Hex(canonicalJson(frozenChart));
  const scoreValue = await sha256Hex(canonicalJson({ packageId, chartId, rulesetId: base.rulesetId, recipeId: base.recipeId, modifiers, mapHashValue, ranked: false }));
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

/** @param {unknown} sourceValue */
function validateSource(sourceValue) {
  const source = requireRecord(sourceValue, "source_provenance_invalid");
  for (const key of ["provider", "sourceId", "sourceVersionHash", "difficulty", "sourceDifficultyPath"]) requireString(source[key], "source_provenance_invalid");
  requireHashString(source.sourceHash, "source_hash_invalid");
  if (source.obstacleContract !== "normalized_obstacle_v2") throw dataError("obstacle_contract_invalid", "Package source must bind normalized_obstacle_v2");
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

/** @param {readonly unknown[]} beats @param {boolean} boxing @param {number} bpm */
function validateEvents(beats, boxing, bpm) {
  const ids = new Set();
  const lineageOwners = new Set();
  let obstacleCount = 0;
  for (let index = 0; index < beats.length; index += 1) {
    const beat = requireRecord(beats[index], "event_invalid");
    if (!Number.isFinite(beat.start) || Number(beat.start) < 0 || typeof beat.type !== "string" || beat.type.length === 0) throw dataError("event_shape_invalid", `Event ${index} is invalid`);
    requireBoundedEventTimestamp(beat.start, bpm, index, "start");
    if (Object.hasOwn(beat, "end") && (!Number.isFinite(beat.end) || Number(beat.end) < Number(beat.start))) throw dataError("event_interval_invalid", `Event ${index} interval is invalid`);
    if (Object.hasOwn(beat, "end")) requireBoundedEventTimestamp(beat.end, bpm, index, "end");
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

/** @param {readonly number[]} cells */
function obstacleActionForCells(cells) { let left=0,right=0; for(const cell of cells) cell%4<=1?left+=1:right+=1; return left>right?"weave_right":right>left?"weave_left":"squat"; }

/** @param {unknown} beatValue @param {number} bpm @param {number} index @param {"start"|"end"} field */
function requireBoundedEventTimestamp(beatValue, bpm, index, field) {
  const timestampMs = Number(beatValue) * 60_000 / bpm;
  if (!Number.isFinite(timestampMs) || timestampMs > maximumEventTimelineMs) throw dataError("event_timeline_invalid", `Event ${index} ${field} exceeds the 24-hour runtime timeline`);
  return timestampMs;
}

/** @param {DataRecord} song */
function readBpm(song) {
  const timing = requireRecord(song.timing, "song_timing_invalid");
  const tempos = requireArray(timing.tempoSegments, "song_timing_invalid");
  const first = requireRecord(tempos[0], "song_timing_invalid");
  if (!Number.isFinite(first.bpm) || Number(first.bpm) <= 0) throw dataError("song_bpm_invalid", "Song BPM must be positive");
  return Number(first.bpm);
}

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
