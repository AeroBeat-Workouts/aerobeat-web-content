# Flow event admission privacy failure — debug record

**Date:** 2026-09-09
**Bead:** `aerobeat-web-content-rp1`
**Failing commit:** `8a110b81bd6a2c86bab9a4c4256de25966ed3fc6`

## Exact Observed Failure

An exact local reproduction cloned the sanitized successor fixture, injected these fields into the first Flow note, and recomputed the valid Flow hash, Flow-trace hash, package hash, empty-audio hash, and direct-load package declaration:

```js
beat.collisionSettings = { colliderRadius: 0.25 };
beat.colliderRadius = 0.5;
beat.wristEvidence = { x: 0.5, y: 0.5 };
beat.frameId = "private-frame";
```

`createAeroContentRuntime().loadPackage(...)` completed with `state:"ready"` and default `rulesetId:"flow_grid_v2"`. `JSON.stringify(runtime.getSnapshot())` contained `collisionSettings`, `colliderRadius`, `wristEvidence`, and `private-frame`.

The directly observed admission path is `validateRuntimePackage()` → `validateEvents()` → `timelineFor()` → public `resolvedEvents[].authoredBeat`. The failure is publication of attacker-authored private collision/body evidence, not merely retention in an internal validation result.

## Expected Behavior

Every Flow event type must satisfy its exact authored schema before hash acceptance or publication. Unknown, extra, hidden, symbol, accessor-backed, alias, prototype/class-instance, collision-setting, collider-geometry, wrist/nose-evidence, trajectory, confidence, calibration/frame/source-contact, and contact-episode data must fail closed at admission without invoking getters. Sanctioned authoring v6 fields and exact hashes must remain unchanged.

## Execution Path

1. `loadPackage()` clones wrapper package input.
2. `startLoad()` calls `validateRuntimePackage()`.
3. `cloneFrozenData()` rejects hidden/symbol/accessor/prototype records globally but retains arbitrary enumerable plain-data keys.
4. `validateEvents(beats, false, mapper)` currently validates common timing and obstacle-specific exact keys only.
5. A Flow note, bomb, arc, or burst with arbitrary enumerable extra fields therefore passes after attacker rehash.
6. `timelineFor()` assigns the accepted frozen beat directly to `resolvedEvents[].authoredBeat`.
7. `getSnapshot()` publishes the event and attacker fields unchanged.

## Most Likely Root Cause

`validateEvents()` has no exact allowed-key schema for Flow notes, bombs, arcs, or bursts. Its generic Flow path checks only start/type/timeline and delegates exact-key validation solely for obstacles. Hash verification establishes integrity of attacker-selected bytes, not authorization of their fields. Evidence: the fully rehashed attack reached ready, while the injected fields were visible under `resolvedEvents[].authoredBeat`.

## Alternative Hypotheses

1. **Output filtering omission (low likelihood as root cause):** output does publish the accepted beat directly, but redaction would leave polluted package/variant authority admitted and violates the required admission fix.
2. **Clone weakness (low):** enumerable plain-data extras are intentionally cloned; global clone already rejects getters, hidden keys, symbols, and class instances. The missing layer is domain schema validation.
3. **Hash-verification weakness (contradicted):** all hashes were recomputed correctly and verified; hashes cannot distinguish sanctioned from forbidden fields.

## Why Previous Fixes Failed

Commit `8a110b8` added deep snapshot scans for forbidden tokens but only exercised clean fixtures. It rejected a few chart-level per-variant aliases and validated the exact successor identity, but assumed existing event-shape checks were a closed schema. Those checks were open for all non-obstacle Flow events, so the tests proved absence in trusted data rather than rejection of hostile data.

## Unknowns

- Exact complete key inventory emitted by authoring for Flow note, bomb, arc, and burst records must be derived from pushed authoring output/source and existing fixtures.
- Whether raw-source linking fields on arcs/bursts vary by supported Beat Saber format must be retained by the exact schema.
- Whether nested sanctioned event records require additional exact validation beyond Flow obstacle geometry contracts.

These unknowns are resolved by inspecting pushed authoring converter output and all existing v6 fixture event shapes before implementing the key tables.

## Minimal Reproduction

Clone `fixtures/flow-colliders-3c9d-successor-v1.json`, add the four fields shown above to one Flow note, recompute `{beats,rulesetId,rulesetVariants,notePalette}`, copy the Flow hash into the trace, add a hash-bound empty audio asset, recompute package SHA-256, and load directly. Commit `8a110b8` reaches ready and leaks all four values.

## Proposed Verification

1. Run the exact reproduction unchanged after the fix and require an admission error before ready.
2. Apply one correctly rehashed unknown-field mutation to every Flow event type and sanctioned nested record.
3. Exercise hidden, symbol, accessor (with getter-call counter), alias, and class/prototype attacks.
4. Deep-scan all public snapshots and resolved authored beats after valid loads.
5. Revalidate unchanged 3C9D package/Flow/semantic hashes, shared chart/beats/event identity, six variants, Grid score identity, browser native/fallback parity, and export envelope verification.

## Recommended Fix

Add a closed exact-key discriminator for each supported Flow beat type inside package admission, before timeline publication. Validate nested sanctioned Flow structures through existing strict contract predicates and exact key sets where applicable. Rely on the pre-validation `cloneFrozenData()` boundary to reject accessors, hidden/symbol keys, aliases, and class instances without invoking getters; add explicit tests proving that behavior. Do not redact or rebuild authored beats on output.

Adjacent regression risks: rejecting legitimate optional authoring fields (especially note angle offsets and arc/burst source-link fields), weakening obstacle geometry acceptance, changing canonical fixture hashes, or changing shared object identity. Cover all in deterministic tests.

## Debugging Record

```text
Problem: Rehashed Flow events admit arbitrary collision/body-evidence fields.
Observed symptom: Runtime reaches ready and resolvedEvents.authoredBeat publicly contains collisionSettings, colliderRadius, wristEvidence, and private-frame.
Root cause: Flow note/bomb/arc/burst validation is open-schema; only obstacles use exact keys.
Evidence: Exact rehashed direct-load reproduction on commit 8a110b8; QA comments on rp1/lpv.
Failed approaches: Clean-output deep scans tested trusted fixtures but did not challenge admission; chart-level alias rejection did not close event schemas.
Corrective action: Add exact per-type Flow event admission schemas and strict adversarial tests; retain direct authored objects without redaction.
Verification test: Rehashed per-type/alias/prototype/accessor attacks reject before publication; clean successor hashes and all gates remain exact.
Related files/components: src/package-content.js validateEvents(); src/content-runtime.js timelineFor(); scripts/validate-content-runtime.js; browser fixture/tests.
Remaining uncertainty: None after inventorying pushed authoring converter output for note, bomb, arc, burst/chain, and obstacle records.
```

## Resolution evidence

Pushed authoring source and the 3C9D fixture established the sanctioned exact fields. Admission now applies closed schemas to the successor package, source, song, Flow chart, Flow trace, and each Flow event discriminator; nested obstacle contracts remain authoritative. Ordinary-array descriptor cloning was hardened so sparse/custom/prototype/accessor arrays reject without reading indexed getters. A final recursive package privacy guard covers private collision/body aliases inside otherwise sanctioned trace containers while preserving Boxing `noseSafeCells`.

The original correctly rehashed attack now returns `flow_event_shape_invalid`, runtime state becomes `error`, and `private-frame` is absent from the snapshot. Deterministic tests cover all five Flow event types, nested obstacle records, package/chart/source/song/trace locations, hidden/symbol/accessor/prototype/class/aliased records, getter-call counters, package/envelope/audio rehashing, and deep public snapshot scans.
