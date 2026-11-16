# HSN Champions

The website for the Champions work: the five agents, the small-account challenge and the forward test.
It lives at **https://lilprogact.github.io/hsn-champions/**

Hassan asked for it on 17 Nov 2026: a website of its own, in a repository of its own, Apple style, holding only what
the website needs.

## What is here, and what is not

**Here:** the page design and the code that draws it. Nothing else.

**Not here:** no prices, no indicator, no agent's rules, no results, no password and no token. All of that stays in the
private repository `hsn-test-lab-engine`, where the Engine runs. This repository is public only because a free GitHub
website has to be.

## How it works

* **Only Hassan can open it.** The site opens the key his HSN Test Lab site already saved on the device (both sites
  are at `lilprogact.github.io`, so the browser shares it): his GitHub token, encrypted with his password. Same
  password as the Test Lab site. Until it is entered the site shows nothing and calls nothing.
* **It only reads.** Every call it makes is a GET of one file in `hsn-test-lab-engine`. It cannot start a GitHub job,
  save a setting or change a file, and it never writes to the saved key. Tests hold it to that (`tests/site.test.js`,
  `tests/vault.test.js`).
* **Every figure is the Engine's.** The pages show what the engine's files say and work nothing out for themselves.
  A file that cannot be read is said to be unread, with GitHub's reason. A missing figure is never shown as a nought.
* **Paper only.** The forward test replays frozen rules on real FOREX.com prices. No order is sent to any account.

## The pages

| Page | What it shows | Files it reads in `hsn-test-lab-engine` |
|---|---|---|
| Overview | Where the forward test stands, and four tiles to the rest | the ones below |
| Forward test | The ten frozen versions, their figures, rules and trades, and the pass marks | `live_test/card_001.json`, `live_test/scores/card_001.json`, `live_test/scores/card_001_trades.json` |
| Agents | Each of the five: what its record made, what it does, whether any code was changed | `champions/status.json`, `champions/step2/take_apart.json` |
| Challenge | Step 3: what was tried, round by round, and what counted | `champions/step3/finished.json`, `rounds.jsonl`, `by_year.json` |
| Checks | A tick or a cross for the login, the prices, the indicator, the agents and the forward test | `status/forexcom_login.json`, `status/mt5_cloud.json`, `status/data_coverage.json`, `status/data_match.json`, `champions/status.json`, `champions/probe/forexcom_demo.json` |

## The files

| File | What it is |
|---|---|
| `index.html`, `styles.css` | The page and its look. No build step, no outside fonts or pictures |
| `js/app.js` | Ties it together: the lock screen, the pages, the reading |
| `js/vault.js` | The lock. Read-only: it opens the Test Lab site's saved key and never changes it |
| `js/github.js` | The one place that calls GitHub. Reads only |
| `js/logic/` | What each page says, with no page code, so the tests can hold it to its word |
| `js/views/` | The five pages |
| `tests/` | `npm test` (Node's own test runner, nothing to install) |
| `tools/harness.cjs` | Opens the site in a real browser against a stand-in for GitHub, with a throwaway password and a made-up token. Needs Playwright |

## Changing it

Run `npm test` and `npm run check` before every commit. Look at a change in a real browser with `tools/harness.cjs`
at iPad and phone widths, in light and dark, before it goes out. The rules of the project are in the engine
repository: `docs/HANDOVER_PROMPT.md` and `docs/CHAMPIONS.md`.
