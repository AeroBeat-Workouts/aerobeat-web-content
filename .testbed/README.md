# Content Runtime Testbed

This hidden testbed owns browser content-runtime demos, future package/variant fixtures, component-composed scenes, debug data, Playwright setup, and generated local dependency symlinks.

Create `.testbed/node_modules/@aerobeat/web-this-repo` as a local symlink to `../../../src` with `npm run testbed:link-self`. Add sibling `@aerobeat/web-*` symlinks only for declared public package dependencies.

The current demo proves the package marker only. It does not claim package loading, hash verification, CORS validation, variant resolution, or any Task 5 behavior.

Do not commit installed `node_modules` folders or generated testbed symlinks.
