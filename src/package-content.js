// @ts-check

import {
  conversionRecipeIds,
  mapModifierIds,
  rulesetIds
} from "@aerobeat/web-contracts";
import { canonicalJson, cloneFrozenData, dataError, isPlainDataRecord, sha256Hex } from "./runtime-data.js";

/** @typedef {Readonly<Record<string, unknown>>} DataRecord */
/** @typedef {Readonly<{variantId: string, chartId: string, mode: "flow" | "boxing", rulesetId: string, recipeId: string | null, modifierIds: readonly string[], ranked: boolean, mapHash: Readonly<Record<string, unknown>>, scoreIdentityHash: Readonly<Record<string, unknown>>, provenance: Readonly<Record<string, unknown>>, chart: DataRecord}>} RuntimeVariant */

/**
 * Narrow and verify one canonical package and return its immutable variant catalog.
 *
 * @param {unknown} packageValue
 * @param {{declaredPackageHash?: string | Readonly<Record<string, unknown>> | null, supportedRulesetIds?: readonly string[], supportedRecipeIds?: readonly string[]}} [options]
 */
export async function validateRuntimePackage(packageValue, options = {}) {
  const packageRecord = /** @type {DataRecord} */ (cloneFrozenData(packageValue));
  requireString(packageRecord.schemaId, "package_schema_invalid");
  if (packageRecord.schemaId !== "aerobeat.song-package.v1" || packageRecord.schemaVersion !== 1) throw dataError("package_schema_invalid", "Song package schema/version is unsupported");
  const packageId = requireString(packageRecord.packageId, "package_identity_invalid");
  const songId = requireString(packageRecord.songId, "package_identity_invalid");
  const song = requireRecord(packageRecord.song, "song_invalid");
  if (song.songId !== songId) throw dataError("song_identity_mismatch", "Package and song identities do not match");
  validateSource(packageRecord.source);
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
    validateEvents(beats, chart.mode === "boxing");
    let rulesetId = "flow_grid_v1";
    let recipeId = null;
    /** @type {string[]} */
    let modifierIds = [];
    let declaredChartHash = "";
    if (chart.mode === "flow") {
      flowCount += 1;
      declaredChartHash = await sha256Hex(canonicalJson(chart));
    } else if (chart.mode === "boxing") {
      const prototype = requireRecord(chart.prototype, "prototype_invalid");
      if (prototype.contractId !== "aerobeat.boxing.prototype.v1") throw dataError("prototype_contract_invalid", "Boxing prototype contract is unsupported");
      requireString(prototype.recipeVersion, "recipe_version_invalid");
      requireString(prototype.rulesetVersion, "ruleset_version_invalid");
      requireHashString(prototype.recipeHash, "recipe_hash_invalid");
      requireHashString(prototype.rulesetHash, "ruleset_hash_invalid");
      rulesetId = requireString(prototype.rulesetId, "ruleset_invalid");
      recipeId = requireString(prototype.recipeId, "recipe_invalid");
      if (!rulesetIds.includes(/** @type {"flow_grid_v1" | "boxing_semantic_track_v1" | "boxing_spatial_grid_v1"} */ (rulesetId)) || rulesetId === "flow_grid_v1") throw dataError("ruleset_invalid", "Boxing ruleset is unsupported");
      if (!conversionRecipeIds.includes(/** @type {"row_family_balanced_height_v1" | "cut_family_source_height_v1"} */ (recipeId))) throw dataError("recipe_invalid", "Conversion recipe is unsupported");
      if (options.supportedRulesetIds && !options.supportedRulesetIds.includes(rulesetId)) throw dataError("ruleset_unavailable", `Ruleset ${rulesetId} is unavailable`);
      if (options.supportedRecipeIds && !options.supportedRecipeIds.includes(recipeId)) throw dataError("recipe_unavailable", `Recipe ${recipeId} is unavailable`);
      modifierIds = normalizeModifiers(prototype.modifiers);
      const sourceHash = requireHashString(prototype.sourceHash, "source_hash_invalid");
      declaredChartHash = requireHashString(prototype.contentHash, "chart_hash_invalid").slice(7);
      const actualChartHash = await sha256Hex(canonicalJson({ beats, recipeId, rulesetId, sourceHash: `sha256:${sourceHash.slice(7)}` }));
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
  if (modifiers.every((entry, index) => entry === base.modifierIds[index]) && modifiers.length === base.modifierIds.length) return base;
  const chartCopy = /** @type {Record<string, unknown>} */ (cloneMutable(base.chart));
  let beats = /** @type {Record<string, unknown>[]} */ (requireArray(chartCopy.beats, "chart_beats_invalid").map((beat) => /** @type {Record<string, unknown>} */ (cloneMutable(beat))));
  if (modifiers.includes("no_squats")) beats = beats.filter((beat) => beat.type !== "squat");
  if (modifiers.includes("no_weaves")) beats = beats.filter((beat) => beat.type !== "weave_left" && beat.type !== "weave_right");
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
    prototype.modifiers = [...modifiers];
    prototype.contentHash = `sha256:${await sha256Hex(canonicalJson({ beats, recipeId: base.recipeId, rulesetId: base.rulesetId, sourceHash: prototype.sourceHash }))}`;
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
    mapHash: contentHash(mapHashValue),
    scoreIdentityHash: contentHash(scoreValue),
    provenance: Object.freeze({ schema: "aerobeat/runtime_variant_provenance", version: 1, kind: "runtime_composite", baseVariantId: base.variantId, requestedModifierIds: Object.freeze(requested), effectiveModifierIds: Object.freeze([...modifiers]) }),
    chart: frozenChart
  });
}

/** @param {unknown} sourceValue */
function validateSource(sourceValue) {
  const source = requireRecord(sourceValue, "source_provenance_invalid");
  for (const key of ["provider", "sourceId", "sourceVersionHash", "difficulty", "sourceDifficultyPath"]) requireString(source[key], "source_provenance_invalid");
  requireHashString(source.sourceHash, "source_hash_invalid");
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

/** @param {readonly unknown[]} beats @param {boolean} boxing */
function validateEvents(beats, boxing) {
  const ids = new Set();
  for (let index = 0; index < beats.length; index += 1) {
    const beat = requireRecord(beats[index], "event_invalid");
    if (!Number.isFinite(beat.start) || Number(beat.start) < 0 || typeof beat.type !== "string" || beat.type.length === 0) throw dataError("event_shape_invalid", `Event ${index} is invalid`);
    if (!boxing) continue;
    const eventId = requireString(beat.eventId, "event_identity_invalid");
    if (ids.has(eventId)) throw dataError("event_identity_duplicate", "Boxing event IDs must be unique");
    ids.add(eventId);
    if (!Array.isArray(beat.sourceEventIds) || beat.sourceEventIds.length === 0 || beat.sourceEventIds.some((entry) => typeof entry !== "string" || entry.length === 0)) throw dataError("event_lineage_invalid", "Boxing event lineage is required");
  }
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
function normalizeDeclaredHash(value) { if (value === null || value === undefined) return ""; if (typeof value === "string") return /^sha256:[0-9a-f]{64}$/u.test(value) ? value.slice(7) : ""; if (isPlainDataRecord(value) && value.algorithm === "sha256" && typeof value.value === "string" && /^[0-9a-f]{64}$/u.test(value.value)) return value.value; throw dataError("package_hash_invalid", "Declared package hash is invalid"); }
/** @param {unknown} value @returns {string[]} */
function normalizeModifiers(value) { if (!Array.isArray(value)) throw dataError("modifiers_invalid", "Modifiers must be an array"); const result = [...new Set(value.map((entry) => String(entry)))].sort(); if (result.some((entry) => !mapModifierIds.includes(/** @type {"no_squats" | "no_weaves" | "any_punch" | "crossed_guard" | "cross_body"} */ (entry)))) throw dataError("modifier_invalid", "Modifier is unsupported"); return result; }
/** @param {string} value */
function contentHash(value) { return Object.freeze({ schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value }); }
/** @param {unknown} value @returns {unknown} */
function cloneMutable(value) { if (Array.isArray(value)) return value.map(cloneMutable); if (isPlainDataRecord(value)) { const result = {}; for (const key of Object.keys(value)) result[key] = cloneMutable(value[key]); return result; } return value; }
