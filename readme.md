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

**Default editor:**

- NotionDown opens every `.md` file by default, from the moment it is installed.
- To use VS Code's text editor for Markdown instead, run **Markdown: Use the VS Code Text Editor as the Default Markdown Editor** from the Command Palette. **Markdown: Use NotionDown as the Default Markdown Editor** reverses it.
- Both commands write one entry (`"*.md"`) to your `workbench.editorAssociations` user setting, so you can also edit it in settings.json.
- To open a single file in the text editor, use **Reopen Editor With... > Text Editor**.

## Features

- **Blocks:**
  - Slash menu, drag-to-reorder, and a floating formatting toolbar.
- **Tables:**
  - Add, remove, and align rows and columns visually.
- **Code:**
  - Syntax highlighting for many languages in an editable code block.
- **Diagrams:**
  - A `mermaid` code block shows its diagram under the source.
- **Math:**
  - Inline `$...$` and block `$$...$$` math render with KaTeX, and the source stays in the file.
- **One source of truth:**
  - Edits made in another editor, an undo, or a Git checkout appear in NotionDown, and the reverse.

**Your file stays yours:**

- Lines you did not edit are written back byte for byte. A block you edited is written in NotionDown's style: `-` bullets, padded table columns, and a backslash before a character that Markdown could read as formatting.
- Empty paragraphs you add are not written to the file.
- Front matter is kept out of the editor and left unchanged.

**Limits:**

- Images written as `![alt](path)` display. NotionDown does not insert, paste, or drag-and-drop images, and will not.
- Two dollar signs in one paragraph, such as two prices, can display as math. The text in the file does not change.
- Syntax that Milkdown does not support, such as footnotes, shows as text.
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
