# Flow Colliders successor runtime acceptance

## Decision

The current runtime path accepts only the exact authored successor tuple:

- package `aerobeat.song-package.v6`, `schemaVersion:6`, `packageVersion:"6.0.0"`;
- exactly one Flow chart `aerobeat.chart.flow.v5`, `schemaVersion:5`;
- default `rulesetId:"flow_grid_v2"`;
- exact ordered `rulesetVariants:["flow_grid_v2","flow_colliders_v1"]`;
- one shared Flow `beats` array, with no per-variant beat authority.

Package v5 fails this path with `flow_colliders_reimport_required`. The runtime does not infer Colliders support, append identities, migrate hashes, or rewrite historical bytes. Any explicit historical Flow Grid path remains outside this successor validator under the existing stale-consumer policy.

## Integrity

Flow `contentHash` is SHA-256 over canonical JSON of exactly `{beats,rulesetId,rulesetVariants,notePalette}`. The sole Flow trace must agree on that hash, the ordered ruleset pair, normalized obstacle contract, palette reference, spawn timing, and exact source provenance. Runtime acceptance also recomputes package SHA-256 and the authoring semantic-parity projection; `AEROPKG1` loading binds the envelope's declared package hash to the recomputed package hash.

Sanitized 3C9D Standard Easy evidence:

- package: `sha256:60e850b3a822b22f34ff1050e0f8531b5d34ce8e3bb3a01bd3208ae27a074b92`
- Flow: `sha256:329bf3af3435f309670a307748f70585cf4be15372d4a7b54a658fa28cfd6145`
- semantic parity: `sha256:978c9d7d1415e5597e1e2560b88090a05236088d117f422dae0222f21182cc99`

The deterministic package fixture is `fixtures/flow-colliders-3c9d-successor-v1.json`, reproduced from authoring commit `10a7a3dbcd3b5f05049813f5eb1d04e332a6ca22`.

## Runtime variants and privacy

Flow Grid remains the default, retains the authored chart ID, uses `recipeId:null`, and retains its ranked/non-local policy. Flow Colliders receives a distinct deterministic variant ID and score identity, uses `recipeId:null`, and is always `ranked:false` / `localOnly:true`. Both variants reference the same immutable chart, beats array, and authored event objects/bytes; resolved envelopes retain the selected variant identity. Runtime Flow composite `variantId` binds `{baseVariantId,rulesetId,modifiers}` while its `chartId` retains the existing `{baseChartId,modifiers}` map-derived authority. Thus identical derived Flow bytes share chart/map identity but remain unambiguous Grid-versus-Colliders selections with ruleset-bound scores and exact provenance. Boxing composite identities are unchanged. The collision analysis is preserved in `.plans/2026-09-09-flow-composite-identity-debug-record.md` under P0 `aerobeat-web-content-cbj`.

Public package, variant, event, asset, and runtime snapshots expose no collision settings, collider geometry, wrist/nose evidence, trajectories, confidence, calibration/frame/source contact evidence, or contact episodes. Admission uses closed exact successor package/source/song/Flow-chart/Flow-trace schemas and exact per-type Flow note, bomb, arc, burst/chain, and obstacle schemas. Correctly rehashed unknown fields and collision/body-evidence aliases fail before publication; hidden, symbol, accessor, prototype/class, sparse/custom-array, aliased-evidence, and hostile nested obstacle records fail without getter invocation. Authored beats remain direct immutable shared authority rather than being redacted or rewritten.

The independent QA failure and root-cause record are preserved in `.plans/2026-09-09-flow-event-admission-debug-record.md` under P0 `aerobeat-web-content-rp1`. Spawn timing, palette projection, obstacle validation, Boxing—including sanctioned `noseSafeCells`—assets, generation, and stale-lifecycle behavior remain unchanged except for the explicit successor identities above.
