# Testing Strategy

This page is the canonical testing guide. It maps each user workflow to the check that proves it, lists the commands, and says when to run each check. Update it whenever a workflow, contract, or tool changes.

## Overview

The extension has three parts, and each part has its own kind of check.

- **Extension host code** (`src/extension.js`):
  - Event handling, message handling, and page generation run under Node with a fake `vscode` module.
  - Automated tests cover this half.
- **Markdown fidelity** (`src/markdown-sync.js`):
  - Pure functions, tested alone and against the real Milkdown Crepe editor running under jsdom.
  - The jsdom tests prove which text the editor writes. They do not prove how the page looks.
- **Webview page** (`src/webview/main.js`, `src/webview/theme.css`):
  - Mermaid, layout, and theme colors need a real browser, so no Node test covers them.
  - A browser harness and a manual smoke check cover this half.
- **Packaged artifact** (`dist/`, `.vsix`):
  - An automated smoke test loads the webpack bundle and checks the page assets.
  - A manual install of the `.vsix` confirms the artifact in a real editor.

## Commands

| Command                           | What it does                                                                                                                                                | When to run                          |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| `npm test`                        | Builds the bundle, runs every automated test, then lints. The runner takes the `test/` directory, not a glob, because Node does not expand glob patterns   | Before every commit                  |
| `node --test test/extension.test.js` | Runs one suite without a build (the bundle suite needs `dist/` to exist)                                                                                 | While developing a handler           |
| `node tools/harness.js`           | Serves the built page at `http://localhost:4173` with a fake host, for the manual smoke check. Add `?dark` to the URL for the dark theme                    | After a change under `src/webview/`  |
| `npm audit --omit=dev`            | Checks shipped dependencies for advisories                                                                                                                  | Before every release, and CI         |
| `npm run package`                 | Builds the `.vsix`                                                                                                                                          | Before manual install checks         |

## Automated Suites

| File                          | Scope                                                                                                                        | Fake used                        |
| :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| `test/extension.test.js`      | Page generation, escaping, nonce, message protocol, document writes, line endings, echo suppression, disposal, open command | `.html` loader and `vscode` shim |
| `test/sync.test.js`           | Block reconciliation (pure), and a save-without-edit check that every Markdown file in the repository and every fixture in `test/fixtures/sync/` comes back byte-identical; edits change only the edited block | Real Crepe under jsdom (`test/helpers/crepe-dom.js`) |
| `test/editor-content.test.js` | What the editor shows: Markdown images display with their path intact, math stays text, raw HTML never runs                  | Real Crepe under jsdom           |
| `test/bundle.test.js`         | The webpack output opens a document and serves a complete page; Crepe styles and the theme mapping ship; Mermaid is a lazy chunk | Fake `vscode` only               |
| `test/docs.test.js`           | Relative links and heading anchors in every Markdown file; the routing table in `AGENTS.md` matches `docs/workflows.md`      | None                             |
| `test/helpers/fake-vscode.js` | Shared `vscode` and `.html` shims, fake documents and panels, handler capture                                                | Not a suite                      |

## Workflow Map

| Workflow                                    | Evidence                                                                              | Gap                                           |
| :------------------------------------------ | :------------------------------------------------------------------------------------ | :-------------------------------------------- |
| Open a Markdown file in NotionDown          | `extension`: command opens with the editor view type; errors when no Markdown file     | Menu placement is manual                      |
| See the file's content in the editor        | `extension`: `ready` produces `init` with LF text. Harness: page renders the sample   | Rendering is manual                           |
| Edit in the page and save to the file       | `extension`: `edit` writes the document; equal text is skipped; CRLF kept; rejected write recovers | Typing and serialization are manual |
| Edit in another editor, undo, or checkout   | `extension`: external change posts `update`; own writes are not echoed                | Cursor behavior after `update` is manual      |
| Close the editor                            | `extension`: subscriptions are disposed; later messages are ignored                   | None                                          |
| Hostile document or file name               | `extension`: attribute escaping; nonce per page. Harness: CSP blocks `fetch`          | Mermaid `strict` mode on hostile input is manual |
| Slash menu, drag handle, table editing      | None automated                                                                        | Manual smoke check                            |
| Mermaid diagrams                            | `bundle`: Mermaid ships as a lazy chunk                                               | Rendering is manual                           |
| Markdown stays clean in Git                 | `sync`: every repository document and every style fixture saves byte-identical; an edit changes only its block; `<br />` placeholders and escapes never reach the file | New Markdown syntax needs a new fixture |
| Images written as `![alt](path)`            | `editor-content`: the `<img>` carries the path. Harness: the image loads through `<base>`                          | A real webview's resource roots are manual    |
| Math written as `$...$` and `$$...$$`       | `editor-content`: KaTeX output appears; `sync`: written back unchanged. Harness: fonts load under the CSP          | Pairing of two dollar signs is the library's  |
| Use NotionDown as the default editor        | `extension`: the manifest priority is `default`; the two commands write and remove only the `*.md` user entry, and no question is asked | The setting's effect in a real editor is manual |
| Bundled extension starts and serves a page  | `bundle`: complete page from `dist/extension.js`                                      | Install in a real editor is manual            |
| Documents agree with each other             | `docs`: links, anchors, and task routing resolve                                      | Claims about behavior are manual (Sync)       |

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

## Defect-Sensitivity Rule

A check proves something only if it can fail. When you add or change a test for a bug fix, break the behavior on purpose and confirm the test fails, then restore the code.

- **Examples that were checked:**
  - Removing the echo suppression in `src/extension.js` fails the echo tests.
  - Skipping `escapeAttribute` fails the hostile file name test.
  - Dropping the CRLF conversion on write fails the CRLF test.
  - Removing the equal-text guard fails the no-write test.
  - Removing `sideEffects: true` from the CSS rule in `webpack.config.js` fails the bundle styles test.
  - Importing Mermaid statically in the page fails the lazy chunk test.
  - Not dropping the `<br />` placeholder, not carrying link definitions, not canonicalizing list markers, not splitting front matter, and not matching blocks at all each fail the save tests.

## Rules for Changing Tests

- **Never weaken an assertion** to get a green run. Fix the implementation, or confirm the requirement changed first.
- **Reproduce a bug with a failing test** before you fix it.
- **Keep the fakes honest.** When the extension starts using a new `vscode` API, add it to `test/helpers/fake-vscode.js`.
