// @ts-check

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { networkInterfaces } from "node:os";
import { chromium } from "playwright";

const root = resolve(".");
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const relative = pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1);
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(`${root}${sep}`)) throw new Error("Path escaped test root");
    const bytes = await readFile(file);
    response.writeHead(200, { "content-type": mediaType(file), "cache-control": "no-store" });
    response.end(bytes);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
});
await new Promise((resolveListening) => server.listen(0, "0.0.0.0", resolveListening));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Browser test server did not bind");
const insecureHost = nonLoopbackIpv4();
assert.ok(insecureHost, "A genuine non-loopback Tailscale IPv4 address is required for insecure-context browser verification");
const browser = await chromium.launch({ headless: true });
try {
  const secureEvidence = await verifyContext(`http://127.0.0.1:${address.port}`, true);
  const insecureEvidence = await verifyContext(`http://${insecureHost}:${address.port}`, false);
  assert.deepEqual(insecureEvidence.identities, secureEvidence.identities, "native and fallback content identities must match exactly");
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log("Content runtime secure-localhost and genuine insecure-HTTP hash checks passed.");

/** @param {string} origin @param {boolean} secure */
async function verifyContext(origin, secure) {
  const page = await browser.newPage();
  const consoleFailures = [];
  page.on("console", (message) => { if (message.type() === "warning" || message.type() === "error") consoleFailures.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => consoleFailures.push(`pageerror: ${error.message}`));
  page.on("response", (networkResponse) => { if (!networkResponse.ok()) consoleFailures.push(`http ${networkResponse.status()}: ${networkResponse.url()}`); });
  try {
    const response = await page.goto(`${origin}/.testbed/demo/index.html`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.ok(), true);
    try { await page.locator("aero-content-runtime[data-ready='true']").waitFor(); }
    catch (cause) { throw new Error(`Browser runtime did not become ready: ${consoleFailures.join(" | ") || (cause instanceof Error ? cause.message : "unknown failure")}`); }
    const runtime = page.locator("aero-content-runtime");
    assert.match(await runtime.innerText(), /aero\.content\.library · implemented · 5 variants/u);
    assert.equal(await runtime.getAttribute("data-interval-start-ms"), "1000");
    assert.equal(await runtime.getAttribute("data-interval-end-ms"), "1250");
    assert.equal(await runtime.getAttribute("data-interval-frozen"), "true");
    assert.equal(await runtime.getAttribute("data-instant-keys"), "schema,version,eventId,variantId,chartId,centerTimestampMs,authoredBeat");
    const evidence = await page.evaluate(() => globalThis.__contentHashEvidence);
    assert.equal(evidence.isSecureContext, secure);
    assert.equal(evidence.subtleType, secure ? "object" : "undefined");
    assert.deepEqual({ package: evidence.packageFailure, chart: evidence.chartFailure, asset: evidence.assetFailure }, { package: "package_hash_mismatch", chart: "chart_hash_mismatch", asset: "asset_hash_mismatch" });
    assert.equal(evidence.persistedState, "ready");
    assert.equal(evidence.persistedAssetMatches, true);
    assert.equal(evidence.largeAssetBytes, 4 * 1024 * 1024);
    assert.equal(evidence.largeAssetMatches, true);
    assert.equal(evidence.compositeKind, "runtime_composite");
    assert.equal(evidence.destroyedState, "destroyed");
    assert.deepEqual(consoleFailures, []);
    return evidence;
  } finally { await page.close(); }
}

function nonLoopbackIpv4() {
  return Object.values(networkInterfaces()).flat().filter((entry) => entry && entry.family === "IPv4" && !entry.internal).map((entry) => entry.address).find(isTailscaleIpv4);
}

/** @param {string} value */
function isTailscaleIpv4(value) {
  const [first, second] = value.split(".").map(Number);
  return first === 100 && second >= 64 && second <= 127;
}

/** @param {string} file */
function mediaType(file) { const extension = extname(file); if (extension === ".html") return "text/html; charset=utf-8"; if (extension === ".js") return "text/javascript; charset=utf-8"; if (extension === ".json") return "application/json; charset=utf-8"; return "application/octet-stream"; }
