# Flow composite identity collision — debug record

**Date:** 2026-09-09
**Content Bead:** `aerobeat-web-content-cbj`
**Assembly discovery:** `aerobeat-web-assembly-46i0`
**Observed content tip:** `070dd9d815e86eec91c78fcf3b49972103bb8d94`

## Exact Observed Output

Using the unchanged sanitized 3C9D v6 fixture, both authored Flow variants were composed with `no_obstacles`:

```text
Flow Grid base variant:       ab-chart-3c9d-flow-easy
Flow Colliders base variant:  ab-chart-3c9d-flow-easy~ruleset-flow_colliders_v1
shared base chartId:          ab-chart-3c9d-flow-easy

Grid composite variantId/chartId:
  ab-chart-3c9d-flow-easy~mods-12385d70f7a5
Colliders composite variantId/chartId:
  ab-chart-3c9d-flow-easy~mods-12385d70f7a5
```

Both composites correctly retained distinct `rulesetId`, `provenance.baseVariantId`, and score hashes. They also correctly shared map hash `329bf3af…cfd6145`, because `no_obstacles` is a no-op for the obstacle-free 3C9D fixture. Public `variantId` and `chartId`, however, collided exactly.

## Identity Contract

A runtime composite is a selection identity over one exact base runtime variant plus a canonical modifier set. Flow Grid and Flow Colliders intentionally share one authored Flow chart and map bytes but are distinct selectable rulesets. Therefore composite `variantId` must bind the exact base variant and ruleset as well as canonical modifiers. `mapHash` must continue to describe the derived chart bytes only, independent of scoring selection. `scoreIdentityHash` must remain ruleset-bound.

Public-contract inspection:

- Content selection/cache takes the authored base `variantId` plus canonical modifiers; snapshots expose `variantId`, `chartId`, `rulesetId`, hashes, and `provenance.baseVariantId`.
- Assembly selects and retains by `variantId`; accessibility reset uses `provenance.baseVariantId`. It does not require globally distinct chart IDs for variants sharing a chart.
- Gameplay requires each resolved event's `variantId` and `chartId` to equal the selected variant. Its score partition identity already includes both IDs, ruleset, modifiers, map hash, and score hash. It does not require two rulesets over the same derived chart bytes to have distinct chart IDs.

## Causal Path

1. `validateRuntimePackage()` emits two Flow base variants with distinct `variantId`/ruleset but one shared authored `chartId` and chart object.
2. `composeRuntimeVariant()` canonicalizes the union of authored/requested modifiers.
3. It hashes only `{baseChartId: base.chartId, modifiers}`.
4. It assigns the resulting single identity to both `variantId` and `chartId`.
5. Same modifiers over the shared Flow chart therefore erase the base variant/ruleset distinction from public composite IDs.
6. Runtime cache keys remain distinct because they begin with requested base `variantId`, but both cached values publish the same `variantId`; selection, retained state, and cross-service identity become ambiguous.

## Alternatives

### A. Make only composite `variantId` distinct; retain derived `chartId` (selected)

Derive chart identity exactly as today from `{baseChartId, modifiers}` so Boxing IDs and map-derived chart identity remain stable. For Flow, derive public variant identity separately from `{baseVariantId, rulesetId, modifiers}`. Grid and Colliders then remain distinct selections over one semantically identical derived chart/map projection. Score identity remains unchanged because its existing authority is chart ID plus explicit ruleset/modifiers/map hash.

This is the smallest change and matches content, gameplay, and assembly public contracts.

### B. Make both composite `variantId` and `chartId` distinct

Hash base variant/ruleset into the shared suffix used for both IDs. This removes the collision but gives two chart IDs to identical derived Flow chart bytes, changes score hashes because `chartId` participates in score identity, and needlessly versions Grid/Boxing-visible identities if applied generally. No inspected consumer contract requires it.

### C. Add consumer disambiguation/shims

Keep colliding producer IDs and teach assembly/gameplay to combine ruleset with variant ID. Rejected: content owns public runtime variant identity, the task forbids shims, and producer ambiguity would remain.

## Most Likely Root Cause

The composition implementation predates two runtime variants sharing one authored chart. It treated chart identity and selectable variant identity as interchangeable. That assumption became false when explicit `flow_colliders_v1` was added over the Flow Grid chart.

## Verification Plan

1. Compose identical modifiers for Grid and Colliders directly in both input orders.
2. Require deterministic, distinct Flow `variantId`; shared stable derived `chartId`; correct ruleset and provenance; canonical modifier order; equal map hash and canonical derived chart/event bytes; distinct score identities.
3. Exercise runtime selection in alternating order to prove cache entries cannot alias and each resolved envelope uses the selected variant ID with the shared chart ID.
4. Repeat in Chromium native/fallback hash contexts.
5. Assert existing Boxing composite IDs are unchanged from the prior `{baseChartId,modifiers}` formula.
6. Preserve exact 3C9D package/Flow/semantic hashes, six authored variants, privacy admission tests, Grid default/retention, and full gates.

## Debugging Record

```text
Problem: Same-modifier Flow Grid and Colliders composites publish identical variantId/chartId.
Observed symptom: Both no_obstacles composites emit ab-chart-3c9d-flow-easy~mods-12385d70f7a5.
Root cause: composeRuntimeVariant hashes only shared base.chartId plus modifiers and reuses one ID for chart and variant.
Evidence: Direct 3C9D reproduction; assembly P0 aerobeat-web-assembly-46i0; content/gameplay/assembly public contract inspection.
Failed approaches: None attempted; integration correctly stopped before consumer shims.
Corrective action: Preserve map-derived chartId; bind Flow composite variantId to exact base variant, ruleset, and canonical modifiers.
Verification test: Direct/browser cross-ruleset same-modifier composition and alternating runtime selection/cache checks.
Related files/components: src/package-content.js composeRuntimeVariant; src/content-runtime.js resolveVariant/timelineFor; assembly selection; gameplay variant/event validation.
Remaining uncertainty: None; public contracts do not require distinct chartId for rulesets sharing exact derived chart bytes.
```

## Resolution evidence

The selected authority now preserves the prior map-derived composite `chartId` and all Boxing composite IDs. Flow composite `variantId` independently binds exact base variant, ruleset, and canonical modifiers. For sanitized 3C9D plus `no_obstacles`, Grid and Colliders now publish distinct variant IDs, the same prior chart ID `ab-chart-3c9d-flow-easy~mods-12385d70f7a5`, the same map hash, distinct unchanged score hashes, and correct distinct provenance bases. Direct runtime alternation returns the deterministic cached Grid identity after selecting Colliders, and every resolved envelope agrees with its selected variant plus shared chart. Chromium proves the same facts in native and fallback hash contexts.
