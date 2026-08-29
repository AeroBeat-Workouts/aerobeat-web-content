// @ts-check

import { serviceIds } from "@aerobeat/web-contracts";

export { aeroContentRuntimeCapabilities, createAeroContentRuntime } from "./content-runtime.js";
export { composeRuntimeVariant, validateRuntimePackage } from "./package-content.js";

/** @type {"aero.content.library"} */
export const aeroContentServiceId = serviceIds.contentLibrary;

/** @type {Readonly<{schema: "aero.content.runtime.descriptor", version: 1, serviceId: "aero.content.library", implementationState: "implemented"}>} */
export const aeroContentRuntimeDescriptor = Object.freeze({
  schema: "aero.content.runtime.descriptor",
  version: 1,
  serviceId: aeroContentServiceId,
  implementationState: "implemented"
});
