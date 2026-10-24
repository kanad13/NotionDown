# NotionDown - VS Code Extension

This file is the shared instruction set for every AI agent and harness that works in this repository.

## Key Context

This extension is a Notion-style Markdown editor in a VS Code custom editor. It uses Milkdown Crepe for blocks, a slash menu, drag handles, and tables, and Mermaid for live diagrams. The file on disk stays plain Markdown. Package name: `notiondown`, command prefix: `notionDown`.

- Host: `src/extension.js`
- Fidelity: `src/markdown-sync.js` (pure CommonJS, shared by the page and the tests)
- Page: `src/webview/main.js` and `src/webview/theme.css`, with the shell in `src/webview.html`
- Build: webpack, two bundles → `dist/extension.js` and `dist/webview/`
- Closure-based state in the host (no classes, no globals)
- CSP nonce security on the page, and no network access for code

## Task Routing

Match the maintainer's request to a workflow in `docs/workflows.md` and run it. Stop at the stopping point that the workflow names. The workflow column must equal a heading in `docs/workflows.md`; `test/docs.test.js` checks it.

| If the maintainer says...                                    | Run workflow             |
| :----------------------------------------------------------- | :----------------------- |
| "Evaluate adding X", "Is X worth it?", "Add a dependency"    | Evaluate a Change        |
| "Add X", "Implement X" (after approval)                      | Build an Approved Change |
| "Update", "upgrade", "maintain", "dependency review"         | Maintain and Upgrade     |
| "X is broken", "fix this bug"                                | Fix a Defect             |
| "Release", "publish", "ship it"                              | Release                  |
| "Check for drift", "sync the repo", "are the docs accurate?" | Sync and Audit           |
| "Update the docs", "rewrite the README"                      | Change Documentation     |

- **No match:**
  - A question about the code or the docs gets an answer and no file changes.
  - Any other request that matches no row or several rows: name the closest workflow and ask the maintainer to confirm it.
- **Evidence:**
  - Verify claims about libraries, store rules, and behavior against the code, a command's output, or primary documentation.
  - Report a check as passed only if you ran it.
- **Authority:**
  - Treat `docs/decisions.md` as context, not as a task list.

## Dependencies

Before adding, upgrading, or auditing any dependency (npm package or build tool), read `docs/dependencies.md`. It defines the version-selection criteria, the floors for VS Code and Node, and the review procedure. Ideas that were evaluated and not built are logged in `docs/decisions.md`.

## Architecture Rules

- Host logic in `src/extension.js` unless it exceeds ~1500 lines
- One custom editor type (`notionDown.editor`), registered with `priority: "option"`; the default-editor choice is the user's `workbench.editorAssociations`, never the manifest priority
- Every write from the page goes through `src/markdown-sync.js`, so blocks the user did not edit keep their original text. Any new Markdown construct needs a fixture in `test/fixtures/sync/`
- The host and the page exchange Markdown strings in four messages only: `ready`, `init`, `edit`, `update`
- No TypeScript, no UI framework of our own
- No remote scripts: everything the page runs ships in the `.vsix`, and `script-src` allows only the per-render nonce
- Mermaid loads through a dynamic `import()` and runs with `securityLevel: "strict"`
- Crepe CSS is imported file by file, and the webpack CSS rule keeps `sideEffects: true`
- The page theme maps Crepe tokens to VS Code variables in `src/webview/theme.css`

## Code Style (enforced by ESLint)

- Tabs, double quotes, semicolons, Unix line endings
- ES2020, CommonJS in the host (`require`/`module.exports`), ES modules in `src/webview/`
- JSDoc on all exported/public functions
- No TODO comments in code - track in issues

## Git and Commits

- Work on a feature branch. Never commit to `main`, except the repository's first commit.
- Commit messages are concise and imperative, and describe _what changed_. Commit at meaningful intervals.
- Merge, push, tag, and publish only when the maintainer says so.
- Do not add `Co-Authored-By` trailers or other tool attribution to commits, pull requests, files, or release notes.

## Multi-File Change Protocol

When a task touches 3+ files or requires multiple related edits:

1. **Branch first** - see Git and Commits
2. **File-touch matrix** - map which files each change touches, then group/sequence to minimize redundant edits to the same file across commits
3. **Phase the work** - group changes into logical phases (infra/config first, then code, then tests). Never fix a file you're about to delete
4. **Gate each phase** - after each phase: commit, build `.vsix`, run tests, verify before proceeding
5. **Track in a workplan** - for more than 1 phase, create a `WORKPLAN.md` (delete when done) with the matrix and checklist

## Testing

- The testing strategy, commands, and manual smoke check live in `docs/testing.md`; update it when a workflow, contract, or tool changes
- Manual testing via F5 debug launch, and in a browser with `node tools/harness.js`
- Round-trip tests run the real Crepe editor under jsdom; run them before and after any change to Milkdown, the stringify style, or `src/markdown-sync.js`
- Test file at `examples/test.md` with diverse Markdown content and a Mermaid diagram
- `npm test` and `npm audit --omit=dev` must pass before any work is considered complete
- Build a `.vsix` (`npm run package`) after each phase for manual install testing
