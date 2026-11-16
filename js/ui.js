// Small DOM helpers. All text goes in as text, never as HTML, so anything read from a file is shown as plain data.
const SVG = "http://www.w3.org/2000/svg";

/** Text for the page: a sum's sign stays on the same line as the sum ("+" and "£2,553" are never split by a line end). */
export const tidy = (text) => String(text).replace(/([+−])(?=£)/g, "$1\u2060");

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(tidy(c)));
  }
  return el;
}

/** Replace an element's children, leaving out anything that is null, undefined or false. */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false).map((c) => (c instanceof Node ? c : document.createTextNode(tidy(c)))));
  return el;
}

/** A small line drawing (no image file, no inline style): `paths` are SVG path strings on a 24 by 24 grid. */
export function icon(paths, cls = "icon") {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  for (const d of [].concat(paths)) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

export const ICONS = {
  arrow: "M5 12h13M12.5 6l6 6-6 6",
  lock: ["M7 11V8a5 5 0 0 1 10 0v3", "M6 11h12v9H6z"],
  refresh: ["M19 12a7 7 0 1 1-2.1-5", "M19 5v4h-4"],
};

/** A tick, a cross or a question mark in a filled circle, with words for a screen reader. */
export function mark(ok, unread = false) {
  return h("span", { class: `mark ${unread ? "unread" : ok ? "ok" : "no"}`, role: "img", "aria-label": unread ? "Could not be read" : ok ? "Yes" : "No" }, unread ? "?" : ok ? "✓" : "✕");
}

export function chip(c) {
  return h("span", { class: `chip ${c.kind || ""}`.trim() }, c.text);
}

/** A fold-away part with a plain-words handle. */
export function more(label, ...children) {
  return h("details", { class: "more" }, h("summary", {}, h("span", {}, label)), h("div", { class: "more-body" }, ...children));
}
