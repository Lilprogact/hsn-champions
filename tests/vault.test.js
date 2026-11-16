// The lock (js/vault.js). It must open a key saved the way the HSN Test Lab site saves it, refuse a wrong password,
// and never write to, change or remove that saved key. The password and token here are made up.
import { test } from "node:test";
import assert from "node:assert/strict";

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, keys: () => [...m.keys()] }; };
globalThis.localStorage = store();
globalThis.sessionStorage = store();

const PASSWORD = "a-made-up-password", TOKEN = "made_up_token_not_a_real_one";
const b64 = (bytes) => Buffer.from(new Uint8Array(bytes)).toString("base64");

/** A saved key in the Test Lab site's form: PBKDF2-SHA256 (600,000 rounds, random salt), AES-256-GCM. */
async function savedKey({ withToken = true, iterations = 600000 } = {}) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", enc.encode(PASSWORD), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const seal = async (text) => { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text))) }; };
  const vault = { version: 1, salt: b64(salt), iterations, verifier: await seal("hsn-test-lab-ok") };
  if (withToken) Object.assign(vault, { token: await seal(TOKEN), tokenSavedAt: "2026-11-15T10:00:00Z", tokenExpiresAt: null, owner: "Lilprogact" });
  return JSON.stringify(vault);
}

const vault = await import("../js/vault.js");

test("with no saved key, or a password without a token, there is nothing to open", async () => {
  assert.equal(vault.supported(), true);
  assert.equal(vault.state(), "none");
  await assert.rejects(vault.unlock(PASSWORD), /no saved key on this device/);
  localStorage.setItem("hsn.vault.v1", await savedKey({ withToken: false }));
  assert.equal(vault.state(), "no_token");
  localStorage.setItem("hsn.vault.v1", "this is not a saved key");
  assert.equal(vault.state(), "none", "something unreadable in its place is no key");
  localStorage.removeItem("hsn.vault.v1");
});

test("it opens the saved key with the right password only, and never changes it", async () => {
  const saved = await savedKey();
  localStorage.setItem("hsn.vault.v1", saved);
  assert.equal(vault.state(), "locked");
  assert.equal(vault.owner(), "Lilprogact");
  await assert.rejects(vault.getToken(), /Locked/);
  await assert.rejects(vault.unlock("the-wrong-password"), /does not match/);
  await assert.rejects(vault.unlock(""), /does not match/);
  assert.equal(vault.state(), "locked");
  assert.equal(await vault.unlock(PASSWORD), true);
  assert.equal(vault.state(), "unlocked");
  assert.equal(await vault.getToken(), TOKEN);
  assert.equal(localStorage.getItem("hsn.vault.v1"), saved, "the saved key is exactly as it was");
  assert.deepEqual(localStorage.keys(), ["hsn.vault.v1"], "nothing else was put beside it");
  let told = null;
  vault.onLock((reason) => { told = reason; });
  vault.lock("manual");
  assert.equal(told, "manual");
  assert.equal(vault.state(), "locked");
  await assert.rejects(vault.getToken(), /Locked/);
  assert.equal(await vault.resume(), false, "locking forgets the tab's key too");
  assert.equal(localStorage.getItem("hsn.vault.v1"), saved);
  vault.onLock(null);
});

test("a reload of the same tab opens without the password; a new tab does not", async () => {
  const saved = await savedKey();
  localStorage.setItem("hsn.vault.v1", saved);
  await vault.unlock(PASSWORD);
  vault.noteActivity();
  const reloaded = await import("../js/vault.js?after-a-reload");              // the page's memory is gone, the tab's session storage is not
  assert.equal(reloaded.state(), "locked");
  assert.equal(await reloaded.resume(), true);
  assert.equal(await reloaded.getToken(), TOKEN);
  globalThis.sessionStorage = store();                                          // another tab
  const otherTab = await import("../js/vault.js?in-another-tab");
  assert.equal(await otherTab.resume(), false);
  assert.equal(localStorage.getItem("hsn.vault.v1"), saved);
  reloaded.lock();
  otherTab.lock();
  vault.lock();
});

test("the file has no way to write, change or remove the saved key", async () => {
  const { readFileSync } = await import("node:fs");
  const code = readFileSync(new URL("../js/vault.js", import.meta.url), "utf8").split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /localStorage\.(setItem|removeItem|clear)/);
  assert.match(code, /localStorage\.getItem\(VAULT_KEY\)/);
  assert.equal((code.match(/sessionStorage\.setItem/g) || []).length, 1, "only the tab's own memory of the key");
});
