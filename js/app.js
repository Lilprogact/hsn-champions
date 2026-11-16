// HSN Champions: a read-only window onto the Champions work in the private engine repository (the five agents, the
// small-account challenge and the forward test). The site asks GitHub for files and shows them. It starts nothing.
import * as vault from "./vault.js";
import * as gh from "./github.js";
import { h, fill, icon, ICONS } from "./ui.js";
import { when } from "./logic/check.js";
import * as overview from "./views/overview.js";
import * as forward from "./views/forward.js";
import * as agents from "./views/agents.js";
import * as challenge from "./views/challenge.js";
import * as checks from "./views/checks.js";

const FILES = {
  login: "status/forexcom_login.json", cloud: "status/mt5_cloud.json", coverage: "status/data_coverage.json", match: "status/data_match.json",
  agents: "champions/status.json", probe: "champions/probe/forexcom_demo.json", apart: "champions/step2/take_apart.json",
  finished: "champions/step3/finished.json", rounds: "champions/step3/rounds.jsonl", byYear: "champions/step3/by_year.json",
  card: "live_test/card_001.json", score: "live_test/scores/card_001.json", trades: "live_test/scores/card_001_trades.json",
};
const BY_LINE = new Set(["rounds"]);                         // files with one JSON object to a line
const VIEWS = { overview, forward, agents, challenge, checks };
const TITLES = { overview: "Overview", forward: "Forward test", agents: "Agents", challenge: "Challenge", checks: "Checks" };

const state = { token: null, owner: null, cache: new Map(), turn: 0 };
const $ = (id) => document.getElementById(id);
const lockEl = $("lock"), navEl = $("nav"), mainEl = $("main"), footEl = $("foot");

// ── reading ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function read(keys, fresh) {
  const out = {}, failed = {};
  await Promise.all(keys.map(async (key) => {
    if (!fresh && state.cache.has(key)) { out[key] = state.cache.get(key); return; }
    try {
      out[key] = BY_LINE.has(key) ? await gh.getLines(state.token, state.owner, FILES[key]) : await gh.getJson(state.token, state.owner, FILES[key]);
      state.cache.set(key, out[key]);
    } catch (error) {
      out[key] = null;
      failed[key] = error;
    }
  }));
  return { out, failed };
}

const currentView = () => { const name = location.hash.replace(/^#/, ""); return VIEWS[name] ? name : "overview"; };

/** Nothing at all could be read, for one reason: say it once, with the one thing to do. */
function nothingRead(failed, keys) {
  const errors = keys.map((k) => failed[k]).filter(Boolean);
  if (errors.length < keys.length) return null;
  const kind = errors[0].kind;
  if (!errors.every((e) => e.kind === kind) || !["token", "forbidden", "network", "rate"].includes(kind)) return null;
  const todo = kind === "network" ? "Check your connection, then read again." : kind === "rate" ? "Wait a few minutes, then read again." : "Put the token right in HSN Test Lab, under Settings, then come back.";
  return h("div", { class: "page-head wrap center" }, h("h1", { class: "headline" }, "Nothing could be read."), h("p", { class: "sub" }, errors[0].message),
    h("div", { class: "todo" }, h("p", {}, h("b", {}, "What to do: "), todo), kind === "token" || kind === "forbidden" ? h("a", { class: "button small", href: "../hsn-test-lab/#settings" }, "Open Settings") : null));
}

async function show({ fresh = false } = {}) {
  const name = currentView(), view = VIEWS[name], turn = ++state.turn;
  for (const a of navEl.querySelectorAll("[data-view]")) { if (a.dataset.view === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }
  document.title = `${TITLES[name]} · HSN Champions`;
  if (fresh) state.cache.clear();
  if (!view.needs.every((k) => state.cache.has(k))) fill(mainEl, h("div", { class: "page-head wrap center" }, h("p", { class: "sub reading" }, "Reading…")));
  const { out, failed } = await read(view.needs, false);
  if (turn !== state.turn || vault.state() !== "unlocked") return;        // another page was asked for meanwhile, or the site was locked
  const now = Date.now();
  const page = nothingRead(failed, view.needs) || view.render({ out, failed, now });
  page.classList.add("enter");
  fill(mainEl, page);
  $("foot-read").textContent = `Read from GitHub on ${when(new Date(now).toISOString())}.`;
  window.scrollTo(0, 0);
}

// ── the lock ────────────────────────────────────────────────────────────────────────────────────────────────────────
function showLock(reason = "") {
  state.token = null;
  state.cache.clear();
  state.turn++;
  fill(mainEl);
  for (const el of [navEl, mainEl, footEl]) el.hidden = true;
  lockEl.hidden = false;
  $("lock-error").textContent = "";
  $("lock-pass").value = "";
  const st = vault.supported() ? vault.state() : "unsupported";
  const can = st === "locked" || st === "unlocked";
  $("lock-field").hidden = !can;
  $("lock-setup").hidden = can || st === "unsupported";
  $("lock-sub").textContent = reason === "idle" ? "Locked after 30 quiet minutes. Enter your Test Lab password." : can ? "Enter your Test Lab password."
    : st === "unsupported" ? "This browser cannot keep a key safe, so the site cannot open here." : st === "no_token" ? "No GitHub token is saved on this device yet." : "This device has no saved key yet.";
  $("lock-help").textContent = can ? "The same password as your HSN Test Lab site. Nothing is shown until you enter it."
    : st === "unsupported" ? "Open it in Safari or Chrome, with private browsing off."
    : st === "no_token" ? "Your HSN Test Lab site has a password on this device but no GitHub token yet. Paste the token there, under Settings, then come back here."
    : "Open your HSN Test Lab site once on this device, set it up there, then come back here. This site uses the same password and the same saved key.";
  if (can) setTimeout(() => $("lock-pass").focus(), 50);
}

async function unlocked() {
  state.token = await vault.getToken();
  state.owner = vault.owner() || (/\.github\.io$/.test(location.hostname) ? location.hostname.split(".")[0] : null);
  if (!state.token || !state.owner) { vault.lock("no_token"); return; }
  lockEl.hidden = true;
  for (const el of [navEl, mainEl, footEl]) el.hidden = false;
  await show();
}

$("lock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const go = $("lock-go"), pass = $("lock-pass");
  if (go.disabled || !pass.value) return;
  go.disabled = true;
  $("lock-error").textContent = "";
  try {
    await vault.unlock(pass.value);
    pass.value = "";
    await unlocked();
  } catch (error) {
    $("lock-error").textContent = error.message || "That did not work.";
    pass.select();
  } finally {
    go.disabled = false;
  }
});

$("lock-go").append(icon(ICONS.arrow));
$("lock-now").append(icon(ICONS.lock));
$("lock-now").addEventListener("click", () => vault.lock("manual"));
$("refresh").addEventListener("click", () => show({ fresh: true }));
vault.onLock((reason) => showLock(reason));
window.addEventListener("hashchange", () => { if (vault.state() === "unlocked") show(); });
for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, () => vault.noteActivity(), { passive: true });

(async () => {
  if (vault.supported() && vault.state() === "locked" && await vault.resume()) await unlocked();
  else showLock();
})();
