# Flow Colliders successor runtime acceptance

> **Amendment 2026-09-10** (Bead `aerobeat-web-assembly-8tz4`): the Flow Grid ruleset is deleted. `flow_colliders_v1` is the sole Flow ruleset and the sole Flow runtime variant (ranked, authored chart ID). Historical two-variant Flow Grid bytes remain readable for historical reads (list/export/management) but are reimport-required for playback with exact `flow_grid_reimport_required` at the authoring/persistence boundary via the exported `assertCurrentFlowRulesetBinding` helper. Import/reimport and cross-package defaults select Flow (colliders).

## Decision

The current runtime path accepts only the exact authored successor tuple:

- package `aerobeat.song-package.v6`, `schemaVersion:6`, `packageVersion:"6.0.0"`;
- exactly one Flow chart `aerobeat.chart.flow.v5`, `schemaVersion:5`;
- `rulesetId:"flow_colliders_v1"`;
- exact `rulesetVariants:["flow_colliders_v1"]`;
- one shared Flow `beats` array, with no per-variant beat authority.

The retired two-variant bind (`rulesetId:"flow_grid_v2"`, `rulesetVariants:["flow_grid_v2","flow_colliders_v1"]`) is accepted only for historical reads. Package v5 fails this path with `flow_colliders_reimport_required`. The runtime does not infer Colliders support, append identities, migrate hashes, or rewrite historical bytes. Playback reimport of retired Flow Grid bytes is enforced by the authoring/persistence layer calling `assertCurrentFlowRulesetBinding`, which throws exact `flow_grid_reimport_required`; `validateRuntimePackage` itself retains historical readability so list/export/management operations continue to work on stored bytes.

## Integrity

Flow `contentHash` is SHA-256 over canonical JSON of exactly `{beats,rulesetId,rulesetVariants,notePalette}`. The sole Flow trace must agree on that hash, exact ruleset variants (single colliders bind, or the exact historical two-variant Flow Grid bind for readability), normalized obstacle contract, palette reference, spawn timing, and exact source provenance. Runtime acceptance also recomputes package SHA-256 and the authoring semantic-parity projection; `AEROPKG1` loading binds the envelope's declared package hash to the recomputed package hash.

Sanitized 3C9D Standard Easy evidence (regenerated single-variant successor):

- package: `sha256:b4e0d16058ceaa60fe118e2cbdbcf0d518eb37384bec4d1a5a3be658d351ebb1`
- Flow: `sha256:9c48a53b0fac85d3798756a38797fccf1f88360ac38e312a5b4d103d98d1d39d`
- semantic parity: `sha256:63fbd288ce7694528a83be4275a69fc176eda11b3d62c072694b865e0611b525`

The deterministic package fixture is `fixtures/flow-colliders-3c9d-successor-v1.json`, regenerated for the single-variant binding from authoring commit `10a7a3dbcd3b5f05049813f5eb1d04e332a6ca22`.

## Runtime variants and privacy

The sole Flow variant retains the authored chart ID, uses `flow_colliders_v1`, `recipeId:null`, `ranked:true`, and `localOnly:false`, and is the runtime default. Historical two-variant Flow Grid bytes resolve the same single playable colliders variant bound to the authored chart ID (their stored bytes stay untouched). The Flow variant references the immutable chart, beats array, and authored event objects/bytes; resolved envelopes retain the selected variant identity. Runtime Flow composite `variantId` binds `{baseVariantId,rulesetId,modifiers}` while its `chartId` retains the existing `{baseChartId,modifiers}` map-derived authority. Boxing composite identities are unchanged.

Public package, variant, event, asset, and runtime snapshots expose no collision settings, collider geometry, wrist/nose evidence, trajectories, confidence, calibration/frame/source contact evidence, or contact episodes. Admission uses closed exact successor package/source/song/Flow-chart/Flow-trace schemas and exact per-type Flow note, bomb, arc, burst/chain, and obstacle schemas. Correctly rehashed unknown fields and collision/body-evidence aliases fail before publication; hidden, symbol, accessor, prototype/class, sparse/custom-array, aliased-evidence, and hostile nested obstacle records fail without getter invocation. Authored beats remain direct immutable shared authority rather than being redacted or rewritten.

The independent QA failure and root-cause record are preserved in `.plans/2026-09-09-flow-event-admission-debug-record.md` under P0 `aerobeat-web-content-rp1`. Spawn timing, palette projection, obstacle validation, Boxing—including sanctioned `noseSafeCells`—assets, generation, and stale-lifecycle behavior remain unchanged except for the explicit successor identities above.
