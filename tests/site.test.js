// What the site can never do. It only reads: no code in it can start a GitHub job, save a setting or change a file;
// it loads nothing from anywhere but itself and asks nothing of anyone but GitHub's API; and no secret is in it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => (statSync(join(ROOT, dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const code = (rel) => read(rel).split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
const SCRIPTS = walk("js").filter((f) => f.endsWith(".js"));

test("the page only loads its own files and only talks to GitHub's API", () => {
  const html = read("index.html");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src https://api.github.com", "form-action 'none'", "base-uri 'none'", "object-src 'none'"]) assert.ok(csp.includes(rule), rule);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, "no script written into the page itself");
  assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=/i, "no inline style and no inline handler");
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.deepEqual([...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0]), [], "nothing is loaded from another site");
  assert.doesNotMatch(read("styles.css"), /url\(|@import/, "no picture or font is fetched by the stylesheet");
});

test("every call to GitHub is a plain read of a file in the engine repository", () => {
  const gh = code("js/github.js");
  assert.equal((gh.match(/fetch\(/g) || []).length, 1, "one place calls GitHub");
  assert.match(gh, /method: "GET"/);
  assert.match(gh, /\/repos\/\$\{encodeURIComponent\(owner\)\}\/\$\{ENGINE_REPO\}\/contents\//);
  for (const file of SCRIPTS) {
    const text = code(file);
    for (const word of ["POST", "PUT", "PATCH", "DELETE", "dispatches", "/actions/", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
      assert.ok(!text.includes(word), `${file}: ${word}`);
    }
    if (file !== join("js", "github.js")) assert.ok(!/\bfetch\(/.test(text), `${file}: only js/github.js may call out`);
    if (file !== join("js", "vault.js")) assert.ok(!/localStorage|sessionStorage/.test(text), `${file}: only the lock touches the browser's storage`);
  }
});

test("the files it reads are the Champions work and the Lab's own status files, by name", () => {
  const app = code("js/app.js");
  const files = [...app.matchAll(/: "([a-z0-9_]+\/[A-Za-z0-9_./-]+\.(?:json|jsonl))"/g)].map((m) => m[1]);
  assert.equal(files.length, 13);
  for (const f of files) assert.match(f, /^(status|champions|live_test)\//, f);
  assert.ok(files.includes("live_test/card_001.json") && files.includes("live_test/scores/card_001.json") && files.includes("live_test/scores/card_001_trades.json"));
});

test("no secret is in the repository", () => {
  for (const file of [...walk("js"), ...walk("tests"), ...walk("tools"), "index.html", "styles.css", "README.md", "package.json"]) {
    const text = read(file);
    assert.doesNotMatch(text, /github_pat_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}/, `${file}: something shaped like a GitHub token`);
    assert.doesNotMatch(text, /FOREXCOM_MT5_PASSWORD\s*[:=]\s*\S/, file);
  }
});
