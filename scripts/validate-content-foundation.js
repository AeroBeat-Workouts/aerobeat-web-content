// @ts-check

import assert from "node:assert/strict";
import {
  aeroContentRuntimeFoundation,
  aeroContentServiceId
} from "../src/index.js";

assert.equal(aeroContentServiceId, "aero.content.runtime");
assert.deepEqual(aeroContentRuntimeFoundation, {
  schema: "aero.content.runtime.foundation",
  version: 1,
  serviceId: "aero.content.runtime",
  domainBehaviorImplemented: false
});
assert.equal(Object.isFrozen(aeroContentRuntimeFoundation), true);
assert.deepEqual(Object.keys(aeroContentRuntimeFoundation), [
  "schema",
  "version",
  "serviceId",
  "domainBehaviorImplemented"
]);

console.log("Content runtime foundation unit check passed.");
