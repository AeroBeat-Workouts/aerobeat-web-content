// @ts-check

/**
 * Stable browser content runtime service identity.
 *
 * @type {"aero.content.library"}
 */
export const aeroContentServiceId = "aero.content.library";

/**
 * @typedef {Object} AeroContentRuntimeFoundationMarker
 * @property {"aero.content.runtime.foundation"} schema Foundation marker schema.
 * @property {1} version Foundation marker version.
 * @property {"aero.content.library"} serviceId Canonical content-library service identity from web contracts.
 * @property {false} domainBehaviorImplemented Whether package loading and resolution behavior exists in this scaffold.
 */

/**
 * Frozen marker proving the package foundation without claiming Task 5 behavior.
 *
 * @type {Readonly<AeroContentRuntimeFoundationMarker>}
 */
export const aeroContentRuntimeFoundation = Object.freeze({
  schema: "aero.content.runtime.foundation",
  version: 1,
  serviceId: aeroContentServiceId,
  domainBehaviorImplemented: false
});
