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
- `composeRuntimeVariant(base, modifiers, packageId)`
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

- Package data must be plain enumerable JSON-like data with bounded depth, strings, and a package-specific 500,000-value ceiling, with no cycles, accessors, class instances, symbols, non-finite numbers, or hidden fields. Generic metadata/handle cloning retains its stricter 100,000-value default.
- The current package schema is `aerobeat.song-package.v1` with exactly one Flow chart and the frozen four-chart Boxing recipe/ruleset matrix.
- Boxing chart hashes are recomputed from beats, recipe, ruleset, source hash, and—only when present—an exact normalized converter profile. Profile-authored packages bind the same profile across source provenance, top conversion trace, every Boxing trace and Boxing chart; legacy packages omit the key and retain their original hashes. Declared package and audio hashes are recomputed and compared.
- Audio and explicitly critical assets block readiness on absence, CORS/readability failure, or hash mismatch.
- Background failure is cosmetic and produces an explicit CSS fallback with degradation truth.
- External package/asset URLs require HTTPS, except localhost HTTP for development. Fetch follows only a still-valid final URL, uses CORS mode, omits credentials, and applies package-owned timeout, abort, declared-length, decoded-body, per-asset, and aggregate byte limits even when injected transports ignore `AbortSignal`.
- `AEROPKG1` parsing validates exact metadata/table records, metadata/asset-count/per-asset/aggregate bounds, safe-integer contiguous ranges, duplicate/canonical paths, trailing bytes, and every asset SHA-256.

Package environment/theme data remains an optional suggestion. Host precedence is `default < playlist < song < athlete`; runtime content never overrides a valid host selection.

## Variants and Paused Swaps

The catalog is frozen to Flow plus:

- Semantic Track · Row Family
- Spatial Grid · Row Family
- Semantic Track · Cut Family
- Spatial Grid · Cut Family

Supported modifiers are `no_squats`, `no_weaves`, `any_punch`, `crossed_guard`, and `cross_body`. Effective identity is the sorted unique union of authored/emitted and requested modifiers. Runtime composites are always unranked and carry explicit base/requested/effective provenance.

Resolved event envelopes own authoritative timeline milliseconds. Every event includes `centerTimestampMs` derived from authored `start` and the package BPM. Authored intervals such as Flow obstacles, arcs, and bursts additionally expose immutable optional `endTimestampMs`, derived from authored `end` through the same BPM; instantaneous events omit that key and retain their existing exact envelope shape. Package validation rejects either derived timestamp when it is non-finite or exceeds the inclusive 24-hour runtime bound, so public snapshots cannot degrade overflow to JSON `null`. Authored beats and package/chart bytes and hashes are never rewritten.

A future-target swap is accepted only while paused. Events before the paused position and events identified as judged or active retain their exact frozen object identity, including interval end timing. Only non-overlapping future targets are replaced; content runtime never rewrites gameplay score or judgement history. Selection and future swapping are rejected while running.

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

Unit coverage includes package/chart/audio hashes, arbitrary external URLs, critical CORS failure, cosmetic fallback, direct and authored persistence loading, deleted-handle invalidation, modifier composition, stable lineage, future-only paused swaps, active-object preservation, unranked provenance, listener/generation/destroy safety, and multi-instance isolation. Chromium coverage loads a real runtime package through Web Crypto and verifies isolated instances with zero console warnings/errors.
