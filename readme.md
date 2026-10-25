# NotionDown

A Notion-style editor for Markdown files in VS Code. You edit on one canvas, and the file on disk stays plain Markdown.

## Overview

NotionDown opens a Markdown file as a block editor. There is no split screen and no preview pane.

- **What you get:**
  - Slash commands: type `/` for headings, lists, tables, code blocks, and quotes.
  - Drag handles to reorder blocks, and a toolbar for inline formatting.
  - Visual tables, task lists, and code blocks with syntax highlighting.
  - Live Mermaid diagrams under `mermaid` code blocks.
- **What you do not get:**
  - Settings, accounts, or a proprietary file format. The colors follow your VS Code theme.
- **Why it is small:**
  - Everything runs inside VS Code, and the extension makes no network request for code.

| Light theme                                                                | Dark theme                                                               |
| :------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| ![A note with a task list and a Mermaid diagram, light theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/overview-light.png) | ![A note with a task list and a Mermaid diagram, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/overview-dark.png) |

## Install

1. Open the Extensions view in VS Code.
2. Search for "NotionDown", or for the identifier `KunalPathak.notiondown`.
3. Select **Install**.

## Use

1. Open a Markdown file.
2. Select the **Open in NotionDown** rocket icon in the editor title bar (it replaces the text editor tab), or right-click the file in the Explorer and choose **Open in NotionDown**.
3. Edit. Save as you would any file.

**Default editor:**

- NotionDown opens every `.md` file by default, from the moment it is installed.
- To use VS Code's text editor for Markdown instead, run **Markdown: Use the VS Code Text Editor as the Default Markdown Editor** from the Command Palette. **Markdown: Use NotionDown as the Default Markdown Editor** reverses it.
- Both commands write one entry (`"*.md"`) to your `workbench.editorAssociations` user setting, so you can also edit it in settings.json.
- If your own `workbench.editorAssociations` setting maps `*.md` to the text editor, VS Code keeps using it. NotionDown asks whether to replace that entry, and asks again in up to two later sessions if you ignore it. Pressing either button ends the question, and the two commands above stay available.
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

- Lines you did not edit are written back byte for byte. A block you edited is written in NotionDown's style: `-` bullets, padded table columns, and a backslash before a character that Markdown could read as formatting. A `#` that cannot start a heading, such as `#hashtag`, gets no backslash.
- Empty paragraphs you add are not written to the file.
- Enter starts a new paragraph, which the file separates with a blank line. Shift+Enter breaks the line inside a paragraph and writes a backslash at the end of it, which every Markdown renderer reads as a line break.
- A single line break in the file shows as a space in NotionDown, as it does in most Markdown renderers.
- Front matter is kept out of the editor and left unchanged.

**Limits:**

- Images written as `![alt](path)` display. NotionDown does not insert, paste, or drag-and-drop images, and will not.
- Two dollar signs in one paragraph, such as two prices, can display as math. The text in the file does not change.
- Syntax that Milkdown does not support, such as footnotes, shows as text.
- A Mermaid diagram keeps its color theme until you reopen the file.
- A Save pressed within about half a second of your last key can save the file without that last word. The tab shows the unsaved marker again, and the next Save includes it.

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

The security model is in [docs/architecture.md](https://github.com/kanad13/NotionDown/blob/main/docs/architecture.md#security-model).

## Screenshots

Type `/` in an empty paragraph to open the block menu.

| Light theme                                                      | Dark theme                                                      |
| :--------------------------------------------------------------- | :-------------------------------------------------------------- |
| ![The slash menu, light theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/slash-light.png) | ![The slash menu, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/slash-dark.png) |

Math, code, tables, and quotes show in place, and the file keeps their Markdown source.

| Light theme                                                                  | Dark theme                                                                  |
| :--------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| ![Math, code, a table, and a quote, light theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/details-light.png) | ![Math, code, a table, and a quote, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/details-dark.png) |

The screenshots come from [examples/showcase.md](https://github.com/kanad13/NotionDown/blob/main/examples/showcase.md). `node tools/e2e/screenshots.js` regenerates them.

## About

- **Not affiliated with Notion:**
  - NotionDown is an independent open-source project.
  - It is not made, endorsed, or sponsored by Notion Labs, Inc.
  - "Notion" is a trademark of its owner. The name describes the editing style only.
- **Built with open-source libraries:**
  - [Milkdown](https://milkdown.dev) and its Crepe editor provide the blocks, slash menu, tables, and math input.
  - [Mermaid](https://mermaid.js.org) draws the diagrams.
  - [KaTeX](https://katex.org) renders the math.
  - [CodeMirror](https://codemirror.net) highlights the code blocks.
  - All four are MIT-licensed.

## Contribute

- Read [AGENTS.md](https://github.com/kanad13/NotionDown/blob/main/AGENTS.md) for the rules, and [docs/workflows.md](https://github.com/kanad13/NotionDown/blob/main/docs/workflows.md) for the procedure that fits your request.
- Set up with `npm ci`, then check with `npm test`. [docs/development.md](https://github.com/kanad13/NotionDown/blob/main/docs/development.md) covers the daily workflow, and [docs/testing.md](https://github.com/kanad13/NotionDown/blob/main/docs/testing.md) covers the checks.
- [docs/decisions.md](https://github.com/kanad13/NotionDown/blob/main/docs/decisions.md) lists ideas that were evaluated and not built.
- [docs/sibling-extensions.md](https://github.com/kanad13/NotionDown/blob/main/docs/sibling-extensions.md) lists the other extensions published as KunalPathak and the files they share.

Licensed under the [MIT License](https://github.com/kanad13/NotionDown/blob/main/LICENSE).
