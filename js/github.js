// Reads files from the private engine repository, and nothing else. Every call is a GET of one file's contents:
// this site cannot start a GitHub job, save a setting or change a file. The token comes from the lock (js/vault.js)
// and is never stored here.

const API = "https://api.github.com";
export const ENGINE_REPO = "hsn-test-lab-engine";

export class GitHubError extends Error {
  constructor(message, status, kind) {
    super(message);
    this.status = status;
    this.kind = kind; // token | forbidden | notfound | rate | network | other
  }
}

function classify(status, message) {
  if (status === 401) return new GitHubError("Your GitHub token was rejected. It may have expired or been revoked.", status, "token");
  if (status === 403 && /rate limit/i.test(message || "")) return new GitHubError("GitHub's rate limit was hit. Wait a few minutes and try again.", status, "rate");
  if (status === 403) return new GitHubError("The saved GitHub token is not allowed to read files in hsn-test-lab-engine. It needs the permission Contents (Read-only).", status, "forbidden");
  if (status === 404) return new GitHubError("Not found.", status, "notfound");
  return new GitHubError(message || `GitHub returned ${status}`, status, "other");
}

const encodePath = (path) => String(path).split("/").map(encodeURIComponent).join("/");

/** One file's text, or null when the file does not exist. */
export async function getText(token, owner, path) {
  let response;
  try {
    response = await fetch(`${API}/repos/${encodeURIComponent(owner)}/${ENGINE_REPO}/contents/${encodePath(path)}?ref=main&t=${Date.now()}`, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
  } catch {
    throw new GitHubError("GitHub could not be reached. Check your connection.", 0, "network");
  }
  if (response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) {
    let message = "";
    try { message = JSON.parse(text).message || ""; } catch { message = ""; }
    throw classify(response.status, message);
  }
  return text;
}

/** A JSON file, or null when it does not exist. */
export async function getJson(token, owner, path) {
  const text = await getText(token, owner, path);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new GitHubError(`${path} is not readable as it stands.`, 200, "other");
  }
}

/** A file of one JSON object to a line, as a list, or null when it does not exist. */
export async function getLines(token, owner, path) {
  const text = await getText(token, owner, path);
  if (text === null) return null;
  try {
    return text.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
  } catch {
    throw new GitHubError(`${path} is not readable as it stands.`, 200, "other");
  }
}
