// The lock. This site keeps no key of its own. It opens the one your HSN Test Lab site already saved on this device:
// both sites live at the same address (lilprogact.github.io), so the browser gives them the same storage. What is
// stored there is your GitHub token, encrypted with a key made from your password (PBKDF2-SHA256, 600,000 rounds,
// random salt; AES-256-GCM), exactly as the Test Lab site wrote it.
//
// Read-only: nothing here writes, changes or removes that saved key. Until the password is entered, the site shows
// nothing and calls nothing. (The key for this tab is remembered in the tab's own session storage, as the Test Lab
// site does, so a reload does not ask again; closing the tab or 30 idle minutes forgets it.)

const VAULT_KEY = "hsn.vault.v1";
const SESSION_KEY = "hsn.session.v1";
const VERIFIER = "hsn-test-lab-ok";
const ITERATIONS = 600000;
export const IDLE_MINUTES = 30;

let cryptoKey = null;
let cachedToken = null;
let idleTimer = null;
let onLockCallback = null;

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function readVault() {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

async function decrypt(key, blob) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return dec.decode(plain);
}

function touchIdle() {
  if (!cryptoKey) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lock("idle"), IDLE_MINUTES * 60 * 1000);
}

export function supported() {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof localStorage !== "undefined";
}

/** "none": no saved key on this device. "no_token": a password but no token yet. Otherwise "locked" or "unlocked". */
export function state() {
  const vault = readVault();
  if (!vault || !vault.verifier) return "none";
  if (!vault.token) return "no_token";
  return cryptoKey ? "unlocked" : "locked";
}

export function owner() {
  const vault = readVault();
  return (vault && vault.owner) || null;
}

export function onLock(callback) {
  onLockCallback = callback;
}

async function rememberSession(key) {
  try {
    sessionStorage.setItem(SESSION_KEY, b64(await crypto.subtle.exportKey("raw", key)));
  } catch {
    /* remembering the tab is a convenience only */
  }
}

export async function unlock(password) {
  const vault = readVault();
  if (!vault) throw new Error("There is no saved key on this device.");
  const key = await deriveKey(String(password || ""), unb64(vault.salt), vault.iterations || ITERATIONS);
  let check;
  try {
    check = await decrypt(key, vault.verifier);
  } catch {
    throw new Error("That password does not match.");
  }
  if (check !== VERIFIER) throw new Error("That password does not match.");
  cryptoKey = key;
  cachedToken = null;
  await rememberSession(key);
  touchIdle();
  return true;
}

/** Open again without the password when this tab was unlocked a moment ago (a reload). */
export async function resume() {
  if (cryptoKey) return true;
  const vault = readVault();
  let raw = null;
  try { raw = sessionStorage.getItem(SESSION_KEY); } catch { raw = null; }
  if (!vault || !raw) return false;
  try {
    const key = await crypto.subtle.importKey("raw", unb64(raw), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    if ((await decrypt(key, vault.verifier)) !== VERIFIER) return false;
    cryptoKey = key;
    touchIdle();
    return true;
  } catch {
    return false;
  }
}

export function lock(reason = "manual") {
  cryptoKey = null;
  cachedToken = null;
  clearTimeout(idleTimer);
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing to forget */ }
  if (onLockCallback) onLockCallback(reason);
}

export async function getToken() {
  if (!cryptoKey) throw new Error("Locked.");
  if (cachedToken) return cachedToken;
  const vault = readVault();
  if (!vault || !vault.token) return null;
  cachedToken = await decrypt(cryptoKey, vault.token);
  return cachedToken;
}

export function noteActivity() {
  touchIdle();
}
