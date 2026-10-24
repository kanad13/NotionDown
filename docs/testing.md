# Testing Strategy

This page is the canonical testing guide. It maps each user workflow to the check that proves it, lists the commands, and says when to run each check. Update it whenever a workflow, contract, or tool changes.

## Overview

The extension has two halves, and each half has its own kind of check.

- **Extension host code** (`src/extension.js`):
  - Event handling, message handling, and page generation run under Node with a fake `vscode` module.
  - Automated tests cover this half.
- **Webview page** (`src/webview/main.js`, `src/webview/theme.css`):
  - Milkdown Crepe and Mermaid need a real DOM, so no Node test renders them.
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
| Markdown stays clean in Git                 | Harness: first edit keeps `-` bullets and `---` rules                                 | Whole-file comparison is manual               |
| Bundled extension starts and serves a page  | `bundle`: complete page from `dist/extension.js`                                      | Install in a real editor is manual            |
| Documents agree with each other             | `docs`: links, anchors, and task routing resolve                                      | Claims about behavior are manual (Sync)       |

## Manual Smoke Check

Run this check before a release and after any change under `src/webview/`. Build first, then start the harness with `node tools/harness.js`, open `http://localhost:4173`, and repeat the check at `http://localhost:4173/?dark`. For the final check, install the `.vsix` and open `examples/test.md` with **Open in NotionDown**.

1. Confirm that headings, lists, task lists, the table, the code block, and the quote render.
2. Confirm that the Mermaid block shows a diagram under its source (it can take a moment on first load).
3. Click an empty paragraph, type `/`, and confirm the command menu opens.
4. Type a character at the end of a paragraph. In the harness, confirm that `window.__posted` holds an `edit` message with `-` list markers and a `---` rule. In the installed extension, confirm the file changes on disk and the diff is limited to the edit and table padding.
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

## Rules for Changing Tests

- **Never weaken an assertion** to get a green run. Fix the implementation, or confirm the requirement changed first.
- **Reproduce a bug with a failing test** before you fix it.
- **Keep the fakes honest.** When the extension starts using a new `vscode` API, add it to `test/helpers/fake-vscode.js`.
