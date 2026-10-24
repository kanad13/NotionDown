# NotionDown

A Notion-style editor for Markdown files in VS Code. You edit on one canvas, and the file on disk stays plain Markdown.

## Overview

NotionDown opens a Markdown file as a block editor, built on [Milkdown Crepe](https://milkdown.dev). There is no split screen and no preview pane.

- **What you get:**
  - Slash commands: type `/` for headings, lists, tables, code blocks, and quotes.
  - Drag handles to reorder blocks, and a toolbar for inline formatting.
  - Visual tables, task lists, and code blocks with syntax highlighting.
  - Live Mermaid diagrams under `mermaid` code blocks.
- **What you do not get:**
  - Settings, accounts, or a proprietary file format. The colors follow your VS Code theme.
- **Why it is small:**
  - Everything runs inside VS Code, and the extension makes no network request for code.

## Install

1. Open the Extensions view in VS Code.
2. Search for "NotionDown", or for the identifier `KunalPathak.notiondown`.
3. Select **Install**.

The extension is not yet published. Until it is, build the `.vsix` with `npm run package` and run **Extensions: Install from VSIX...**.

## Use

1. Open a Markdown file.
2. Select the **Open in NotionDown** icon in the editor title bar, or right-click the file in the Explorer and choose **Open in NotionDown**.
3. Edit. Save as you would any file.

To make NotionDown the default for Markdown, right-click a `.md` file, choose **Open With... > Configure default editor for '*.md'**, and select NotionDown. To go back, use **Reopen Editor With... > Text Editor**.

## Features

- **Blocks:**
  - Slash menu, drag-to-reorder, and a floating formatting toolbar.
- **Tables:**
  - Add, remove, and align rows and columns visually.
- **Code:**
  - Syntax highlighting for many languages in an editable code block.
- **Diagrams:**
  - A `mermaid` code block shows its diagram under the source.
- **One source of truth:**
  - Edits made in another editor, an undo, or a Git checkout appear in NotionDown, and the reverse.

**Limits:**

- The first edit in a file can normalize its Markdown style: `-` list markers, a `---` rule, and padded table columns. The change is limited to that file and shows in the Git diff.
- Math (`$...$`) shows as text, and image insertion is off. Images that the Markdown already references display.
- A Mermaid diagram keeps its color theme until you reopen the file.

## Privacy and Security

- **No tracking:**
  - The extension collects no data and has no settings that send data anywhere.
- **No remote code:**
  - Every script ships in the extension, and the page runs only scripts that carry a per-load random nonce.
- **Remote images:**
  - A document that links an `https` image makes the editor fetch it, as any Markdown viewer does.
- **Diagrams:**
  - Mermaid runs in strict mode.
- **Restricted Mode:**
  - The extension works in untrusted workspaces.

The security model is in [docs/architecture.md](docs/architecture.md#security-model).

## Contribute

- Read [AGENTS.md](AGENTS.md) for the rules, and [docs/workflows.md](docs/workflows.md) for the procedure that fits your request.
- Set up with `npm ci`, then check with `npm test`. [docs/development.md](docs/development.md) covers the daily workflow, and [docs/testing.md](docs/testing.md) covers the checks.
- [docs/decisions.md](docs/decisions.md) lists ideas that were evaluated and not built.

Licensed under the [MIT License](LICENSE).
