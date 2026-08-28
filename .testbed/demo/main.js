// @ts-check

import {
  aeroContentRuntimeFoundation,
  aeroContentServiceId
} from "@aerobeat/web-this-repo";

class AeroContentFoundationElement extends HTMLElement {
  connectedCallback() {
    this.textContent = `${aeroContentServiceId} · foundation v${aeroContentRuntimeFoundation.version}`;
  }
}

if (!customElements.get("aero-content-foundation")) {
  customElements.define("aero-content-foundation", AeroContentFoundationElement);
}
