# aerobeat-web-content

Browser song-package loading and runtime content service for AeroBeat Web.

## Responsibility

This repository owns the browser runtime boundary for acquiring, narrowing, validating, and resolving playable AeroBeat song-package content. Its future implementation will expose immutable package/chart/variant snapshots, verify declared hashes, report asset and CORS capability truth, preserve source lineage, resolve authored persistence handles supplied by the browser authoring owner, and resolve modifier or paused future-target variant selections without rewriting judged history. Resolving a persistence handle does not make this package the persistence implementation or write authority.

The current slice is intentionally a package foundation only. It establishes the public package, validation posture, testbed layout, and service identity; Task 5 of the cross-repo prototype plan will implement runtime domain behavior.

This repository does not own canonical authored-content semantics, BeatSaver acquisition or conversion, authored persistence or export, audio playback, camera/CV, pose input, gameplay judgement or scoring, rendering, UI components, environment drawing, or assembly wiring.

## Public API Surface

- `src/index.js` exports the `aero.content.runtime` service identity and a frozen foundation marker.
- Future runtime APIs must use documented immutable shapes from public `@aerobeat/web-contracts` exports and must narrow external package data before exposing it.
- No content loader, validator, variant resolver, or asset fetcher is implemented in this scaffold.

## Adjacent Repositories

- `aerobeat-content-core` remains the canonical Godot donor for durable song-package and chart semantics.
- `aerobeat-tool-content-authoring` and `aerobeat-vendor-beatsaver` remain offline Godot donor/reference implementations for conversion and BeatSaver acquisition; they do not own the browser runtime path.
- `aerobeat-web-vendor-beatsaver` owns browser BeatSaver acquisition and normalized source manifests.
- `aerobeat-web-content-authoring` owns browser conversion, authored persistence, and export; this package only resolves the persistence handles it publishes.
- `aerobeat-web-contracts` owns shared browser service IDs and content/message shapes.
- `aerobeat-web-audio` owns playback and clock truth.
- `aerobeat-web-video` owns browser media lifecycle.
- `aerobeat-web-gameplay` consumes resolved immutable charts and variants.
- `aerobeat-web-renderer` and `aerobeat-web-ui` present runtime state without loading content.
- `aerobeat-web-assembly` composes the concrete runtime service.

## Allowed Imports

Runtime code may import documented public exports from `@aerobeat/web-contracts`. It must not import sibling `src/`, `internal`, testbed, vendor-native, Godot runtime, authoring implementation, gameplay, renderer, UI, audio, video, or assembly internals.

Testbed code imports this package through the generated `.testbed/node_modules/@aerobeat/web-this-repo` symlink. Add sibling packages only as declared public dependencies.

## Runtime Data Posture

- Treat downloaded packages, manifests, chart data, URLs, and host-provided configuration as untrusted external values.
- Preserve declared hashes, recipe/ruleset identity, source-event lineage, and capability failures rather than silently repairing data.
- Browser content snapshots will be serializable and immutable at public boundaries.
- Raw camera frames, media tracks, scoring state, and renderer objects never belong in content snapshots.
- Cosmetic asset failure may eventually fall back; gameplay-critical chart/audio failure must remain explicit.

## Testbed Shape

The hidden `.testbed/` owns browser demos, scenes, debug data, test setup, Playwright configuration, and generated local package links. Create the self-link with:

```bash
npm run testbed:link-self
```

Do not commit `node_modules` or generated testbed symlinks.

## Validation

Run before handoff:

```bash
npm run check
npm test
npm run test:browser
```

The scaffold checks strict `// @ts-check` and no-JSDoc-escape posture, public import boundaries, named-component scene rules, Playwright console warning/error posture, deterministic public marker exports, and deterministic browser-testbed structure.

## Documentation Handoff

Keep repository implementation decisions under `docs/decisions/`. Public product or contributor documentation belongs in `aerobeat-web-docs` after contracts are accepted.
