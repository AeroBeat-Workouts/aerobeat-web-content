# Runtime boundaries and future-only swaps

## Status

Accepted for Task 5.

## Decision

Each connected game owns one `AeroContentRuntime`. Loading is generation-scoped and replacement cancels stale work. Persistence is available only through an injected public resolver; this package never imports authoring or writes storage. Current authored handles are consumed through deterministic `AEROPKG1` export metadata when available so the runtime can independently verify package and asset hashes. Public records are descriptor-narrowed before property access; resolver paths and playback IDs are bounded string arrays. Transport timeout/abort and body limits are package-owned, so injected transports cannot bypass cancellation by ignoring `AbortSignal`.

Public snapshots contain only deeply frozen serializable records and source handles. Asset bytes remain behind explicit load/read methods. Critical chart/audio integrity or readability failures prevent readiness, while background failure reports a cosmetic fallback.

The runtime exposes one Flow variant and the complete frozen 2×2 Boxing matrix. Profile-authored Boxing charts bind one exact normalized converter profile across source provenance, the top conversion trace, every Boxing trace and every Boxing chart; their chart hashes and modifier recompositions include that immutable profile. Legacy no-profile packages omit the key entirely and retain their historical chart hashes. Runtime modifier composites use sorted unique authored-plus-requested identity, are unranked, and expose base/requested/effective provenance.

Gameplay remains the owner of score and judgement history. Content receives only paused position plus judged/active IDs. A paused variant swap preserves the exact existing event objects for past, judged, and active targets and suppresses lineage-equivalent replacement duplicates; it replaces only remaining future targets. Any swap or selection while running is rejected.

## Consequences

- Arbitrary compatible package identities and external URLs work without a playlist allowlist.
- Deleting a persisted package is observed on reload and invalidates playable state.
- Theme and background records remain suggestions under host-owned `default < playlist < song < athlete` precedence.
- `AEROPKG1` bytes, audio bytes, provider DTOs, `Blob`, media, scoring, and renderer state cannot leak into content snapshots.
- Future authored export formats require an explicit parser/version branch rather than silently accepting unknown framing.
