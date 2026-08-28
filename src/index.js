// @ts-check

/**
 * Stable browser content runtime service identity.
 *
 * @type {"aero.content.runtime"}
 */
export const aeroContentServiceId = "aero.content.runtime";

/**
 * @typedef {Object} AeroContentRuntimeFoundationMarker
 * @property {"aero.content.runtime.foundation"} schema Foundation marker schema.
 * @property {1} version Foundation marker version.
 * @property {"aero.content.runtime"} serviceId Runtime service identity reserved by this package.
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
