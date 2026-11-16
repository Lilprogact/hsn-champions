// The site in a real browser (Chromium) against a stand-in for api.github.com that serves a folder of engine files.
// Nothing here talks to GitHub: no password of Hassan's and no token of his is needed or used. The lock is opened with
// a throwaway password, and the "saved key" it opens is made here with a made-up token, in the same form the HSN Test
// Lab site saves it (PBKDF2-SHA256, 600,000 rounds; AES-256-GCM).
//
//   const { open, overflow } = require("./tools/harness.cjs");
//   const h = await open({ root: "/path/to/hsn-test-lab-engine", viewport: { width: 820, height: 1180 }, hash: "#forward" });
//   ... h.page is a Playwright page; h.calls lists every request the page sent to GitHub; h.writes every request that
//   was not a plain read (there must be none: the site is read-only); h.problems every console error ...
//   await h.close();
//
// `root` is a checkout of the engine repository, or a scratch copy of the files a page reads. Options: `scheme`
// ("light" or "dark"), `key` ("ok", "none" for a device with no saved key, "no_token" for a password without a token),
// `unlock` (false leaves the lock screen up), `forbid` (true makes every read fail the way a token without Contents
// access does). Needs Playwright (npm i playwright), which is not a dependency of the site itself.
const { chromium } = require("playwright");
const { webcrypto } = require("crypto");
const http = require("http"), fs = require("fs"), path = require("path");

const SITE = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const PASSWORD = "throwaway-password-1";
const TOKEN = ["github", "pat", "test_only_not_a_token"].join("_");

function serveSite() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const p = path.join(SITE, url === "/" ? "/index.html" : url);
      if (!p.startsWith(SITE) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
      res.end(fs.readFileSync(p));
    }).listen(0, "127.0.0.1", () => resolve(srv));
  });
}

/** A saved key as the HSN Test Lab site writes it, for a throwaway password and a made-up token. */
async function savedKey(withToken = true) {
  const b64 = (bytes) => Buffer.from(new Uint8Array(bytes)).toString("base64");
  const enc = new TextEncoder();
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const material = await webcrypto.subtle.importKey("raw", enc.encode(PASSWORD), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const seal = async (text) => { const iv = webcrypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text))) }; };
  const vault = { version: 1, salt: b64(salt), iterations: 600000, verifier: await seal("hsn-test-lab-ok") };
  if (withToken) Object.assign(vault, { token: await seal(TOKEN), tokenSavedAt: new Date().toISOString(), tokenExpiresAt: null, owner: "Lilprogact" });
  return JSON.stringify(vault);
}

async function open({ root, viewport = { width: 820, height: 1180 }, hash = "", scheme = "light", key = "ok", unlock = true, forbid = false } = {}) {
  const srv = await serveSite();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: +(process.env.DSF || 1), hasTouch: true, isMobile: true, colorScheme: scheme, reducedMotion: "reduce",
    userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  if (key !== "none") {
    const vault = await savedKey(key !== "no_token");
    await ctx.addInitScript((v) => { if (!localStorage.getItem("hsn.vault.v1")) localStorage.setItem("hsn.vault.v1", v); }, vault);
  }
  const page = await ctx.newPage();
  const problems = [], calls = [], writes = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`.slice(0, 400)));
  await ctx.route("https://api.github.com/**", async (route) => {
    const req = route.request(), url = new URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push(`${req.method()} ${url.pathname}`);
    const send = (status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (req.method() !== "GET") { writes.push(`${req.method()} ${url.pathname}`); return send(403, { message: "This stand-in only answers reads." }); }
    if (req.headers().authorization !== `Bearer ${TOKEN}`) return send(401, { message: "Bad credentials" });
    const m = url.pathname.match(/^\/repos\/[^/]+\/hsn-test-lab-engine\/contents\/(.+)$/);
    if (!m) return send(404, { message: "Not Found" });
    if (forbid) return send(403, { message: "Resource not accessible by personal access token" });
    const p = path.join(root, decodeURIComponent(m[1]));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(404, { message: "Not Found" });
    return route.fulfill({ status: 200, headers: { ...cors, "content-type": "text/plain; charset=utf-8" }, body: fs.readFileSync(p) });
  });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html${hash}`);
  if (unlock && key === "ok") {
    await page.fill("#lock-pass", PASSWORD);
    await page.click("#lock-go");
    await page.waitForSelector("#main:not([hidden]) .enter", { timeout: +(process.env.OPEN_WAIT || 30000) });
  }
  return { page, browser, srv, problems, calls, writes, password: PASSWORD, close: async () => { await browser.close(); srv.close(); } };
}

/** How far the page can be pushed sideways, in pixels (0 = it cannot). */
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

module.exports = { open, overflow };
