// @ts-check

import { canonicalJson, cloneFrozenData, dataError, hasExactDataKeys } from "./runtime-data.js";

const constants = Object.freeze({
  schema: "aerobeat/beatsaber_spawn_timing",
  version: 1,
  algorithm: "beatsaber_core_hjd_v1",
  maxHalfJumpDistance: 17.999,
  startHalfJumpDurationBeats: 4,
  minimumHalfJumpDurationBeats: 0.25
});
const exactKeys = Object.freeze(["schema", "version", "algorithm", "bpm", "noteJumpMovementSpeed", "noteJumpStartBeatOffset", "maxHalfJumpDistance", "startHalfJumpDurationBeats", "minimumHalfJumpDurationBeats", "halfJumpDurationBeats", "reactionTimeMs", "jumpDistanceMeters"]);

/** @param {number} bpm @param {number} njs @param {number} offset */
function derive(bpm, njs, offset) {
  if (!Number.isFinite(bpm) || bpm <= 0) throw dataError("spawn_timing_bpm_invalid", "Spawn timing BPM must be finite and positive");
  if (!Number.isFinite(njs) || njs <= 0) throw dataError("spawn_timing_njs_invalid", "Spawn timing NJS must be finite and positive");
  if (!Number.isFinite(offset)) throw dataError("spawn_timing_offset_invalid", "Spawn timing offset must be finite");
  const secondsPerBeat = 60 / bpm;
  let halfJumpDurationBeats = Number(constants.startHalfJumpDurationBeats);
  while (njs * secondsPerBeat * halfJumpDurationBeats > constants.maxHalfJumpDistance) halfJumpDurationBeats /= 2;
  if (halfJumpDurationBeats < 1) halfJumpDurationBeats = 1;
  halfJumpDurationBeats += offset;
  if (halfJumpDurationBeats < constants.minimumHalfJumpDurationBeats) halfJumpDurationBeats = constants.minimumHalfJumpDurationBeats;
  const reactionTimeMs = secondsPerBeat * halfJumpDurationBeats * 1000;
  return Object.freeze({ ...constants, bpm, noteJumpMovementSpeed: njs, noteJumpStartBeatOffset: offset, halfJumpDurationBeats, reactionTimeMs, jumpDistanceMeters: njs * (reactionTimeMs / 1000) * 2 });
}

/** @param {unknown} value @param {number} songBpm */
export function validateSpawnTiming(value, songBpm) {
  if (!hasExactDataKeys(value, exactKeys)) throw dataError("spawn_timing_invalid", "Package source spawnTiming must contain the exact v1 fields");
  const record = /** @type {Readonly<Record<string, unknown>>} */ (value);
  const expected = derive(Number(record.bpm), Number(record.noteJumpMovementSpeed), Number(record.noteJumpStartBeatOffset));
  if (expected.bpm !== songBpm) throw dataError("spawn_timing_bpm_mismatch", "Spawn timing BPM must match authored song timing");
  if (canonicalJson(record) !== canonicalJson(expected)) throw dataError("spawn_timing_mismatch", "Spawn timing raw and derived values do not match the pinned algorithm");
  return /** @type {Readonly<Record<string, unknown>>} */ (cloneFrozenData(expected));
}
