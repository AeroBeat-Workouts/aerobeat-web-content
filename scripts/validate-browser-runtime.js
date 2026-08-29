// @ts-check

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
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
await new Promise((resolveListening) => server.listen(0, "127.0.0.1", resolveListening));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Browser test server did not bind");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const consoleFailures = [];
  page.on("console", (message) => { if (message.type() === "warning" || message.type() === "error") consoleFailures.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => consoleFailures.push(`pageerror: ${error.message}`));
  page.on("response", (networkResponse) => { if (!networkResponse.ok()) consoleFailures.push(`http ${networkResponse.status()}: ${networkResponse.url()}`); });
  const response = await page.goto(`http://127.0.0.1:${address.port}/.testbed/demo/index.html`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.ok(), true);
  try {
    await page.locator("aero-content-runtime[data-ready='true']").waitFor();
  } catch (cause) {
    throw new Error(`Browser runtime did not become ready: ${consoleFailures.join(" | ") || (cause instanceof Error ? cause.message : "unknown failure")}`);
  }
  assert.match(await page.locator("aero-content-runtime").innerText(), /aero\.content\.library · implemented · 5 variants/u);
  assert.deepEqual(consoleFailures, []);
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log("Content runtime browser checks passed.");

/** @param {string} file */
function mediaType(file) { const extension = extname(file); if (extension === ".html") return "text/html; charset=utf-8"; if (extension === ".js") return "text/javascript; charset=utf-8"; if (extension === ".json") return "application/json; charset=utf-8"; return "application/octet-stream"; }
