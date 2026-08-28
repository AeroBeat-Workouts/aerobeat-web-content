// @ts-check

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(".testbed/demo/index.html", "utf8");
const moduleSource = readFileSync(".testbed/demo/main.js", "utf8");
const config = readFileSync(".testbed/playwright.config.js", "utf8");

assert.match(html, /<script\s+type="module"\s+src="\.\/main\.js"><\/script>/u);
assert.match(html, /<aero-content-foundation\b/u);
assert.match(moduleSource, /from\s+"@aerobeat\/web-this-repo"/u);
assert.match(moduleSource, /customElements\.define\("aero-content-foundation"/u);
assert.doesNotMatch(moduleSource, /console\.(?:warn|error)\s*\(/u);
assert.match(config, /console warnings/u);
assert.match(config, /and errors/u);

console.log("Browser testbed foundation check passed.");
