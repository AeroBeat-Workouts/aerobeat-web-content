# aerobeat-web-content

Validated browser song-package loading and runtime variant resolution for AeroBeat Web.

## Responsibility

`@aerobeat/web-content` owns one `AeroContentRuntime` per connected game. It narrows untrusted package data, verifies package/chart/audio hashes, resolves direct packages, arbitrary CORS-readable URLs, deterministic `AEROPKG1` exports, and injected authored persistence handles, then exposes immutable serializable package, asset-capability, variant, and resolved-event snapshots.

The runtime is not a map allowlist. Any package satisfying the current package, hash, asset, lineage, recipe, and ruleset contracts can load.

This package does **not** own BeatSaver acquisition, source ZIP inspection, conversion, persistence writes, export creation, playback, scoring, rendering, UI, camera/CV, or iframe transport. Raw ZIPs, audio bytes, `Blob`, provider DTOs, media tracks, frames, and pixels never appear in snapshots.

## Public API

```js
import { createAeroContentRuntime } from "@aerobeat/web-content";

const runtime = createAeroContentRuntime({
  persistenceResolver: {
    loadPackage: (handle) => authoring.loadPackage(handle),
    readAsset: (handle, path) => authoring.readAsset(handle, path),
    exportPackage: (handle) => authoring.exportPackage(handle)
  }
});

await runtime.loadPersistenceHandle(authoredHandle);
const snapshot = runtime.getSnapshot();
```

Public exports:

- `createAeroContentRuntime(options)`
- `validateRuntimePackage(package, options)`
- `assertCurrentFlowRulesetBinding(package)` — throws exact `flow_grid_reimport_required` when a stored Flow chart is still bound to the retired `flow_grid_v2` ruleset; the authoring/persistence boundary enforcement point for playback reimport
- `composeRuntimeVariant(base, modifiers, packageId)`
- canonical timing re-exports `createAuthoredBeatToTimelineMs(timing)`, `authoredBeatToTimelineMs(timing, beat)`, and `maximumAuthoredTimelineMs`
- `aeroContentRuntimeCapabilities`
- `aeroContentRuntimeDescriptor`
- canonical `aeroContentServiceId` (`aero.content.library`)

Per-instance runtime operations:

- `loadPackage(packageOrWrapper, options)`
- `loadExternalPackage(url, options)`
- `loadPersistenceHandle(handle, options)`
- `reload()`
- `selectVariant(variantId, { modifierIds })`
- `setPlaybackState(state)`
- `swapFutureVariant(variantId, { modifierIds })`
- `readAsset(path)`
- `getSnapshot()` / `subscribe(listener)`
- `getCapabilities()` / `destroy()`

Direct wrappers use `{ package, packageHash?, assets }`. Asset descriptors use `{ path, kind?, hash?, url?, bytes?, critical? }`. Raw bytes are accepted only by explicit load/read boundaries and are copied; they never enter public state.

## Integrity and Asset Policy

- Package data must be plain enumerable JSON-like data with bounded depth, strings, and a package-specific 500,000-value ceiling, with no cycles, accessors, class instances, symbols, non-finite numbers, hidden fields, sparse/custom arrays, or prototype overrides. Array and record descriptors are inspected without invoking getters. Generic metadata/handle cloning retains its stricter 100,000-value default.
- Playable content uses only the exact successor tuple `aerobeat.song-package.v6` / schema `6` / package `6.0.0`, with exact hash-bound `source.spawnTiming` raw BPM/NJS/offset and recomputed `beatsaber_core_hjd_v1` HJD/reaction-time/jump-distance values. Package versions 1–4 fail with stable `spawn_timing_reimport_required`; v5 fails on this successor path with exact `flow_colliders_reimport_required` and is never promoted, appended, or rewritten. The package retains exactly one palette-bound normalized-obstacle `aerobeat.chart.flow.v5` chart with `rulesetId:"flow_colliders_v1"` and exact `rulesetVariants:["flow_colliders_v1"]` (the sole Flow ruleset), one shared `beats` array, and the frozen four-chart Boxing v1 recipe/ruleset matrix. Historical two-variant Flow Grid bytes (`rulesetId:"flow_grid_v2"`, `rulesetVariants:["flow_grid_v2","flow_colliders_v1"]`) remain readable for historical reads (list/export/management) but are reimport-required for playback with exact `flow_grid_reimport_required` at the authoring/persistence boundary (enforced by `assertCurrentFlowRulesetBinding`); they never load for playback. A non-enumerable generation-bound private content seam exposes the immutable validated spawn timing only while ready; it never enters public snapshots, telemetry, or serialization. A non-enumerable generation-bound private assembly seam exposes the immutable validated effective palette while ready; stale, loading, idle, and destroyed generations receive `null`, and no palette data enters public snapshots or serialization.
- Flow chart, trace, and note/bomb/arc/burst/obstacle records use closed exact authored schemas. Unknown fields—including collision/body-evidence aliases—and hostile nested records fail admission before hash acceptance or publication; output redaction is not used. Flow `contentHash` is recomputed over exactly `{beats,rulesetId,rulesetVariants,notePalette}`; its sole trace must agree on that hash, exact ruleset variants, obstacle contract, palette, spawn timing, and source provenance. Package SHA-256, `AEROPKG1` envelope package hash, and the authoring-compatible semantic parity projection are independently recomputed. The sanitized 3C9D acceptance authority is package `sha256:b4e0d16058ceaa60fe118e2cbdbcf0d518eb37384bec4d1a5a3be658d351ebb1`, Flow `sha256:9c48a53b0fac85d3798756a38797fccf1f88360ac38e312a5b4d103d98d1d39d`, semantic parity `sha256:63fbd288ce7694528a83be4275a69fc176eda11b3d62c072694b865e0611b525`.
- Boxing chart hashes are recomputed from beats, recipe, ruleset, source hash, and—only when present—an exact normalized converter profile. Every Boxing squat/weave must retain a positive source interval, provider `sourceGeometry`, normalized `gameplayGeometry`, derived `gridMask`, identical `blockedCells`, and an instantaneous checkpoint whose nose-safe cells are the exact complement; any disagreement fails package loading before publication. Profile-authored packages bind the same profile across source provenance, top conversion trace, every Boxing trace and Boxing chart. Authored note palettes are strictly rehashed and must match the sole Flow chart reference; Boxing charts cannot carry embedded palette fields. The private renderer projection applies the package-effective left/right colors to eligible Flow notes and Boxing `straight_*`, `hook_*`, and `uppercut_*` punch cues without mutating either chart; Boxing guards, squats/weaves, bombs, and walls remain fixed-color. Palette changes may change visual package/chart hashes but are excluded from Flow score identity. Declared package and audio hashes are recomputed and compared through `@aerobeat/web-hash`, using its native fast path or deterministic bundled fallback without changing canonical bytes.
- Audio and explicitly critical assets block readiness on absence, CORS/readability failure, or hash mismatch.
- Background failure is cosmetic and produces an explicit CSS fallback with degradation truth.
- External package/asset URLs require HTTPS, except localhost HTTP for development. Fetch follows only a still-valid final URL, uses CORS mode, omits credentials, and applies package-owned timeout, abort, declared-length, decoded-body, per-asset, and aggregate byte limits even when injected transports ignore `AbortSignal`.
- `AEROPKG1` parsing validates exact metadata/table records, metadata/asset-count/per-asset/aggregate bounds, safe-integer contiguous ranges, duplicate/canonical paths, trailing bytes, and every asset SHA-256. Integrity verification works in Window contexts on secure localhost and genuine non-loopback insecure HTTP where `crypto.subtle` is absent.

Package environment/theme data remains an optional suggestion. Host precedence is `default < playlist < song < athlete`; runtime content never overrides a valid host selection.

## Variants and Paused Swaps

The catalog is frozen to the exact sole Flow (colliders) variant plus:

- **Flow (Colliders)** retains the authored chart ID, `flow_colliders_v1`, `recipeId:null`, `ranked:true`, and `localOnly:false`, and remains the default; historical two-variant Flow Grid bytes resolve the same single playable variant.
- The single Flow variant references the exact immutable chart and authored beat objects/bytes; no collision settings, wrist/nose evidence, or inferred support enters content state or public snapshots.
- Semantic Track · Row Family
- Spatial Grid · Row Family
- Semantic Track · Cut Family
- Spatial Grid · Cut Family

Supported modifiers are `no_squats`, `no_weaves`, `any_punch`, `crossed_guard`, `cross_body`, `no_obstacles`, and `obstacle_visual_only`. Effective identity is the sorted unique union of authored/emitted and requested modifiers. Runtime composites are always unranked/local-only and carry explicit base/requested/effective provenance. Flow composite `variantId` binds the exact base variant, ruleset, and canonical modifiers, while `chartId` remains the stable map-derived identity over base chart plus modifiers. Boxing retains its existing composite identity formula. Flow accessibility is between-run and identity-bound: `no_obstacles` removes obstacle events, while `obstacle_visual_only` retains source geometry for visual projection; selecting both fails atomically.

Resolved event envelopes own authoritative timeline milliseconds. Every event includes `centerTimestampMs` derived from authored `start` through the contract-owned snapshotted mapper over the exact anchor, strictly ordered tempo segments, and strictly ordered `{startBeat,durationMs}` stops; a stop contributes when `startBeat <= beat`. Authored intervals such as Flow obstacles, arcs, and bursts additionally expose immutable optional `intervalEndTimestampMs`, derived from authored `end` through that same mapper; instantaneous events omit interval keys and retain their existing exact envelope shape. Package validation rejects either derived timestamp when it is non-finite or exceeds the inclusive 24-hour runtime bound, so public snapshots cannot degrade overflow to JSON `null`. Authored beats and package/chart bytes and hashes are never rewritten.

A future-target swap is accepted only while paused. Events before the paused position and events identified as judged or active retain their exact frozen object identity, including interval end timing. Only non-overlapping future targets are replaced; content runtime never rewrites gameplay score or judgement history. Selection and future swapping are rejected while running. Playback publication is exact and idempotent: `setPlaybackState()` publishes only when bounded state, position, judged-event IDs, or active-event IDs truthfully change; equivalent ID sets are order/duplicate independent.

## Persistence Boundary

Persistence access is dependency-injected. The runtime imports no browser-authoring implementation. For the current authored format it prefers the resolver's public `exportPackage(handle)` seam, which carries the `AEROPKG1` hash table; the fallback `loadPackage`/`readAsset` seam requires externally supplied asset hashes. Reloading a deleted or invalidated handle clears playable state and reports the resolver failure.

## Allowed Imports

Runtime source imports only documented public exports from `@aerobeat/web-contracts` and local modules. It must not import sibling `src/`, `internal`, testbed, vendor, Godot, authoring, gameplay, renderer, UI, audio, video, or assembly internals.

## Validation

```bash
npm run check
npm test
npm run test:browser
npm pack --dry-run --json
git diff --check
```

Unit coverage includes package/chart/audio hashes, arbitrary external URLs, critical CORS failure, cosmetic fallback, direct and authored persistence loading, deleted-handle invalidation, modifier composition, stable lineage, future-only paused swaps, active-object preservation, unranked provenance, listener/generation/destroy safety, and multi-instance isolation. Chromium coverage loads real direct and persisted runtime content on secure localhost and genuine non-loopback Tailscale HTTP, requires `crypto.subtle` to be absent in the insecure row, proves native/fallback identity parity, verifies nonzero-offset and 4 MiB bounded assets, rejects package/chart/asset tampering with exact domain errors, and requires zero console warnings/errors.
