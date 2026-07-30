# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## Commands

**Run all tests (Node built-in test runner, no deps):**
`node --test tests/game.test.js tests/records.test.js`
(Do not pass the directory alone — invoke the two files explicitly.)

**Run a single test file:** `node --test tests/game.test.js`

**Run a single named test:** `node --test tests/game.test.js --test-name-pattern "initBoard"`

**Sanity-check that game.js loads under Node:** `node -e "require('./game.js')"`
(The DOM block is guarded by `typeof document !== 'undefined'`, so requiring it in Node only exercises the pure logic + module.exports.)

**Serve locally (no build step):** `python3 -m http.server` then open `http://localhost:8000/`. `index.html` can also be opened directly from disk, but the share-card QR fetch needs an http(s) origin.

**No linter / bundler / framework** is configured. Validation is done entirely through `node --test`. There is no compile step — the site is static.

**Deploy:** Static site hosted on Cloudflare Pages at `https://mine-sweeper-2f1.pages.dev/`. Push the git branch linked to that Pages project to redeploy. Share links / og tags in `index.html` and the QR target in `share-card.html` already point at that URL.

## Architecture

Single-page static HTML5 minesweeper (mobile-first, built for WeChat webview). No framework, no build pipeline. The whole app is `index.html` + `style.css` + `game.js`; `share-card.html` is a standalone static share page; `tests/` holds Node unit tests; `docs/` holds the design spec and implementation plan (`docs/superpowers/`).

### Two-layer design inside `game.js`

`game.js` is split into two layers by environment guards:

1. **Pure logic layer (top of file, ~lines 1–128).** No DOM, no globals. Defines the board model and game rules as standalone functions: `initBoard`, `placeMines` (with first-click safety), `reveal` (BFS flood-fill), `toggleFlag`, `remainingMines`, `isWin`, `forEachNeighbor`, `idx`, and the records helpers `loadRecords`/`saveRecord`. A board is `{ rows, cols, mineCount, cells[], firstClick, minesPlaced }` where each cell is `{ mine, revealed, flagged, adj }`. Mines are placed lazily on the first `reveal` call (`placeMines` excludes the clicked cell and its 8 neighbors → guaranteed safe first click). At the end of this layer, `module.exports = {...}` exposes these functions so Node tests can import them.

2. **Browser layer (guarded by `if (typeof document !== 'undefined')`).** Handles all DOM: rendering the grid, click-to-reveal, touch long-press / right-click-to-flag, difficulty switching (`DIFFS`: easy 9x9/10, medium 16x16/40, hard 30x16/99), the timer, records list rendering, and share-card generation. This layer closes over the pure functions from layer 1, so almost all game behavior is testable without a browser.

### Records (localStorage)

`loadRecords` / `saveRecord` use key `minesweeper_records` and cap at `MAX_RECORDS = 10`, keeping the most recent first (sorted by `date` descending, then `slice(0, 10)`). Each record is `{ date, difficulty, result: 'win'|'lose', time, cellsLeft }`. In Node, `localStorage` is absent, so `loadRecords`/`saveRecord` degrade gracefully (tests inject a `global.localStorage` mock).

### Share cards

Two surfaces, both rendering a 1200×1600 canvas card (green gradient, rounded panel, difficulty/time/result text, and a QR from `api.qrserver.com`):

- **In-game overlay** (`window.generateShareCard(diff, time, state)`): called automatically on win and on loss (after a short delay) and also from the "📤 分享" button. Draws to an offscreen canvas, sets `#share-card-img` src to the PNG data URL, and shows `#share-overlay`. The QR uses `location.href` (correct on the deployed domain). `praise(diff, time)` picks a congratulatory line based on difficulty-specific time thresholds; on loss it shows a neutral "再接再厉" message.
- **Standalone `share-card.html`**: static, self-contained page that draws the same card with a hardcoded `url` pointing at the deployed site (so its QR always returns to the game, not to itself). Used to download a PNG for use as an og:image.

`index.html` carries `og:` meta tags pointing at the deployed URL and `share-card.png` for social/preview sharing.

### Element contract (game.js ↔ index.html)

`game.js` looks up these DOM ids/selectors — keep them in sync if you edit the HTML: `#board`, `#mine-count`, `#timer`, `#record-list`, `#share-overlay`, `#share-card-img`, `#share-btn`, `#share-close`, `#restart`, `.difficulty button[data-diff]`, and `.cell` (rendered). Touch long-press (400ms) sets a `longPressed` flag so the subsequent `click` is ignored and only flags; `contextmenu` is `preventDefault`-ed for desktop right-click. Long-press system menus (copy/search) are suppressed via `-webkit-touch-callout: none` in `style.css`.

### Mobile interaction notes

- Tap = reveal; long-press (touch) or right-click (desktop) = toggle flag.
- `style.css` disables `-webkit-touch-callout` and `user-select` on the board to stop the WeChat webview long-press menu from appearing.
- The board uses CSS grid with `repeat(cols, 1fr)`; high difficulty (hard = 30 cols) relies on `overflow-x: auto`.

### Testing convention

Pure logic and records have full `node --test` coverage (12 tests). UI rendering, long-press, and the canvas share overlay are verified manually in a browser/WeChat — they are not unit tested because they depend on `document`/canvas.
