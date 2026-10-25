# Testing Strategy

This page is the canonical testing guide. It maps each user workflow to the check that proves it, lists the commands, and says when to run each check. Update it whenever a workflow, contract, or tool changes.

## Overview

The extension has three parts, and each part has its own kind of check. A fourth layer runs all of them together in a real VS Code, because the most expensive failure so far lived between the parts: autosave and save-time rewrites changed the file behind the page, and the page threw away the words the user had just typed. Each part passed its own tests.

- **Extension host code** (`src/extension.js`):
  - Event handling, message handling, and page generation run under Node with a fake `vscode` module.
  - Automated tests cover this half.
- **Markdown fidelity** (`src/markdown-sync.js`):
  - Pure functions, tested alone and against the real Milkdown Crepe editor running under jsdom.
  - The jsdom tests prove which text the editor writes. They do not prove how the page looks.
- **Webview page** (`src/webview/main.js`, `src/webview/theme.css`):
  - Mermaid, layout, and theme colors need a real browser, so no Node test covers them.
  - A browser harness and a manual smoke check cover this half.
- **The parts together, with timing** (`src/page-sync.js`, `test/helpers/session.js`):
  - The real host, the page's sync rules, and the real Crepe editor run in one Node process, with a delay on every message and a model of autosave and save participants between them.
  - It runs in `npm test`, so every change meets it. The setups are models, so it proves the rules, not VS Code's behavior.
- **A real VS Code** (`tools/e2e/`):
  - A private VS Code profile installs the packaged `.vsix`, applies one user's settings, and a script types into the real page and reads the file back. It is the proof that the models match the product.
  - It opens windows and takes about three minutes, so it is a pre-release and after-change check, not part of `npm test`.
- **Packaged artifact** (`dist/`, `.vsix`):
  - An automated smoke test loads the webpack bundle and checks the page assets.
  - A manual install of the `.vsix` confirms the artifact in a real editor.

## Commands

| Command                           | What it does                                                                                                                                                | When to run                          |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| `npm test`                        | Builds the bundle, runs every automated test, then lints. The runner takes a quoted glob that Node 22 and later expands itself. A bare `test/` directory works on newer Node releases and fails on the Node floor, so CI caught what a newer local Node hid   | Before every commit                  |
| `node --test test/extension.test.js` | Runs one suite without a build (the bundle suite needs `dist/` to exist)                                                                                 | While developing a handler           |
| `npm run e2e`                     | Builds the `.vsix`, then runs every scenario in a real VS Code with a private profile (see [Real VS Code Checks](#real-vs-code-checks)). Opens VS Code windows; run it when nothing else needs the screen | Before a release, and after a change to the host, `src/page-sync.js`, the manifest, or the save path |
| `node tools/harness.js`           | Serves the built page at `http://localhost:4173` with a fake host, for the manual smoke check. Add `?dark` to the URL for the dark theme                    | After a change under `src/webview/`  |
| `npm audit --omit=dev`            | Checks shipped dependencies for advisories                                                                                                                  | Before every release, and CI         |
| `npm run package`                 | Builds the `.vsix`                                                                                                                                          | Before manual install checks         |

## Automated Suites

| File                          | Scope                                                                                                                        | Fake used                        |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| `test/extension.test.js`      | Page generation, escaping, nonce, message protocol, document writes, line endings, echo suppression, disposal, open command | `.html` loader and `vscode` shim |
| `test/sync.test.js`           | Block reconciliation (pure), and a save-without-edit check that every Markdown file in the repository and every fixture in `test/fixtures/sync/` comes back byte-identical; edits change only the edited block | Real Crepe under jsdom (`test/helpers/crepe-dom.js`) |
| `test/editor-content.test.js` | What the editor shows: Markdown images display with their path intact, math stays text, raw HTML never runs                  | Real Crepe under jsdom           |
| `test/bundle.test.js`         | The webpack output opens a document and serves a complete page; Crepe styles and the theme mapping ship; Mermaid is a lazy chunk; the code languages share one lazy file and the script count stays low | Fake `vscode` only               |
| `test/docs.test.js`           | Relative links and heading anchors in every Markdown file; the routing table in `AGENTS.md` matches `docs/workflows.md`      | None                             |
| `test/page-sync.test.js`      | The page's rules for the host's updates against the real editor: a formatting-only update leaves the editor, the cursor, unsent typing, and a just-typed space alone; a stale update is ignored; a real change replaces the content and keeps the cursor; edits are numbered | Real Crepe under jsdom |
| `test/save-pipeline.test.js`  | The parts together: seeded typing runs on three machine setups (defaults, autosave with whitespace cleanup, format on save), a change from another program, Save pressed before the page's pause is over (the edit landing during the format, and after the save), a space typed after Save, and a control run that shows the old rule loses words | Real host, real page rules, real Crepe, modelled autosave (`test/helpers/session.js`, `test/helpers/vscode-setups.js`) |
| `test/helpers/fake-vscode.js` | Shared `vscode` and `.html` shims, fake documents and panels, handler capture                                                | Not a suite                      |

## Workflow Map

| Workflow                                    | Evidence                                                                              | Gap                                           |
| :------------------------------------------ | :------------------------------------------------------------------------------------ | :-------------------------------------------- |
| Open a Markdown file in NotionDown          | `extension`: command opens with the editor view type; errors when no Markdown file     | Menu placement is manual                      |
| See the file's content in the editor        | `extension`: `ready` produces `init` with LF text. Harness: page renders the sample   | Rendering is manual                           |
| Type while autosave or Save rewrites the file | `save-pipeline`: no word is lost on any setup, and editor and file agree afterwards. `page-sync`: each rule. `tools/e2e`: the same on real VS Code, with Prettier | None. Save pressed at any moment saves the last word, leaves the file formatted, and the tab clean |
| A user setting keeps Markdown in the text editor | `extension`: each branch of the question, its repeats, and the rocket replacing the text tab. `tools/e2e`: the toast appears, yes changes the setting and opens NotionDown, the rocket leaves one tab | None |
| Type `#text` at the start of a line         | `sync`: no backslash unless a heading would start; none in code. `tools/e2e`: the saved file holds `#asdas` | Other conservative escapes (`\*`, `\_`) remain by choice |
| Shift+Enter and Enter                       | `sync`: a hard break saves as a backslash and survives a round trip; a single line break keeps its place | The page shows a single line break as a space, as Markdown renderers do |
| Open in NotionDown from the title bar       | `extension`: the text tab is replaced, other tabs are left alone. `tools/e2e`: one tab remains | None |
| Edit in the page and save to the file       | `extension`: `edit` writes the document; equal text is skipped; CRLF kept; rejected write recovers | Typing and serialization are manual |
| Edit in another editor, undo, or checkout   | `extension`: external change posts `update`; own writes are not echoed                | Cursor behavior after `update` is manual      |
| Close the editor                            | `extension`: subscriptions are disposed; later messages are ignored                   | None                                          |
| Hostile document or file name               | `extension`: attribute escaping; nonce per page. Harness: CSP blocks `fetch`          | Mermaid `strict` mode on hostile input is manual |
| Slash menu, drag handle, table editing      | None automated                                                                        | Manual smoke check                            |
| Mermaid diagrams                            | `bundle`: Mermaid ships as a lazy chunk                                               | Rendering is manual                           |
| Markdown stays clean in Git                 | `sync`: every repository document and every style fixture saves byte-identical; an edit changes only its block; `<br />` placeholders and escapes never reach the file | New Markdown syntax needs a new fixture |
| Images written as `![alt](path)`            | `editor-content`: the `<img>` carries the path. Harness: the image loads through `<base>`                          | A real webview's resource roots are manual    |
| Math written as `$...$` and `$$...$$`       | `editor-content`: KaTeX output appears; `sync`: written back unchanged. Harness: fonts load under the CSP          | Pairing of two dollar signs is the library's  |
| Use NotionDown as the default editor        | `extension`: the manifest priority is `default`; the two commands write and remove only the `*.md` user entry. `tools/e2e`: with no association set, Markdown opens in NotionDown and no question appears | None |
| Bundled extension starts and serves a page  | `bundle`: complete page from `dist/extension.js`                                      | Install in a real editor is manual            |
| Documents agree with each other             | `docs`: links, anchors, and task routing resolve                                      | Claims about behavior are manual (Sync)       |

## Real VS Code Checks

`npm run e2e` (`tools/e2e/run.js`) runs scenarios in a real VS Code. Each scenario starts a fresh profile in a temporary folder, writes one set of user settings, installs the packaged `.vsix`, and drives the page through the DevTools protocol. It never reads or changes your own VS Code settings or extensions.

- **What it needs:**
  - A desktop VS Code (found in `/Applications` on macOS, or given with `--app` or `VSCODE_PATH`).
  - The Prettier extension, copied from your installed extensions, for the format-on-save scenarios. Without it those scenarios print `SKIP`.
  - It opens real windows on your screen for about three minutes. It stops only the processes it started.
- **Options:** `--vsix <file>` tests a given package (for example the last release, to confirm that a check can fail), `--only <text>` runs the scenarios whose name contains the text, and `--keep` leaves the profile folders for inspection.
- **Scenarios:** typing on VS Code defaults with Save, autosave with whitespace cleanup, autosave with the maintainer's settings, Prettier on Save while typing, Prettier on Save pressed the moment the last key is released, a typed `#hashtag` saved without a backslash, the rocket replacing the text tab, a change made outside the editor, no association set, and a text-editor association with the question.
- **How the typing scenarios judge:**
  - Twelve words go in with uneven pauses and a seeded generator. After every pause the page is read back many times, so a word that disappears and returns is still caught.
  - The file on disk must end with every word, and after a Save the tab must not show the unsaved marker again.
  - Each scenario checks that VS Code really rewrote the file. A run in which nothing rewrote it would pass without testing anything.
- **Facts the scenarios taught:**
  - VS Code runs Prettier on Save but not on an autosave. Whitespace trimming and the final newline run on both.
  - A file passed on the command line at VS Code's first start opens in the text editor. A file opened afterwards opens in NotionDown.
- **Not in CI:**
  - It needs a desktop. `ci.yml` is shared with the sibling extensions and stays unchanged.

## Manual Smoke Check

Run this check before a release and after any change under `src/webview/`.

- **Setup:**
  - Build the bundle, then start the harness with `node tools/harness.js`.
  - Open `http://localhost:4173`, and repeat the check at `http://localhost:4173/?dark`.
- **Final pass:**
  - Install the `.vsix` and open `examples/test.md` with **Open in NotionDown**.

1. Confirm that headings, lists, task lists, the table, the code block, and the quote render.
2. Confirm that the Mermaid block shows a diagram under its source (it can take a moment on first load).
3. Click an empty paragraph, type `/`, and confirm the command menu opens.
4. Open `readme.md` (`node tools/harness.js 4173 readme.md`), type at the end of the last paragraph, and confirm that `window.__posted` holds one `edit` whose text differs from the file only at the typed text. In the installed extension, edit a file and confirm that `git diff` shows only the lines you touched, with no `<br />` and no new backslashes.
5. In the harness, run `window.postMessage({ type: "update", text: "# Other" }, "*")`, and confirm the page shows the new text and posts no `edit`.
6. In the installed extension, edit the file in a text editor beside NotionDown and confirm the page follows. Undo in the text editor and confirm the page follows.
7. Switch the VS Code color theme. Confirm that the editor colors follow it. A Mermaid diagram keeps its original theme until the file reopens.
8. Open Developer Tools and confirm that the console shows no error.

## Where a Defect Must Be Reproduced

A test proves a fix only if it runs the layer where the user saw the failure.

- **Rule:** reproduce a user-reported failure at the highest layer that can show it, then add the cheaper test that pins the rule.
- **Why:** the swallowed-word bug passed every part's tests and the manual smoke check, which typed one character in a harness whose fake host never rewrote the file.
- **User settings are inputs.** Autosave, format on save, whitespace trimming, the final newline, and editor associations change what the extension sees. A new scenario belongs in `tools/e2e/scenarios.js` and a new setup in `test/helpers/vscode-setups.js` whenever a report names a setting.

## Defect-Sensitivity Rule

A check proves something only if it can fail. When you add or change a test for a bug fix, break the behavior on purpose and confirm the test fails, then restore the code.

- **Examples that were checked:**
  - Removing the echo suppression in `src/extension.js` fails the echo tests.
  - Skipping `escapeAttribute` fails the hostile file name test.
  - Dropping the CRLF conversion on write fails the CRLF test.
  - Removing the equal-text guard fails the no-write test.
  - Removing `sideEffects: true` from the CSS rule in `webpack.config.js` fails the bundle styles test.
  - Importing Mermaid statically in the page fails the lazy chunk test.
  - Removing the `codeLanguages` cache group from `webpack.config.js` fails the language chunk test.
  - Making the page replace its content on every update, or removing the formatting-only check, the stale-update check, the host's edit count, or the canonical block comparison, each fails `page-sync` or `save-pipeline` tests. `save-pipeline` also has a control run that must lose words under the old rule.
  - Not restoring the cursor after a replace fails the cursor tests.
  - Running `npm run e2e -- --vsix <the 0.2.0 package>` fails the autosave scenario, which proves the end-to-end check can fail.
  - Not dropping the `<br />` placeholder, not carrying link definitions, not canonicalizing list markers, not splitting front matter, and not matching blocks at all each fail the save tests.

## Rules for Changing Tests

- **Never weaken an assertion** to get a green run. Fix the implementation, or confirm the requirement changed first.
- **Reproduce a bug with a failing test** before you fix it.
- **Keep the fakes honest.** When the extension starts using a new `vscode` API, add it to `test/helpers/fake-vscode.js`. When `npm run e2e` shows VS Code behaving differently from `test/helpers/vscode-setups.js`, change the model to match VS Code.
