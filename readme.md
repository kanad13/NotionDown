# NotionDown: a visual Markdown editor for VS Code

**Write Markdown the way you write in Notion.** Type `/` for headings, lists, tables, and code. Drag blocks to reorder them. Diagrams and math appear as you write. The file on disk stays plain Markdown, so Git, your docs site, and every other tool keep working.

![NotionDown editing a note with a task list and a Mermaid diagram, light theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/overview-light.png)

- **One page, no preview pane.** You edit the finished page, not source next to a preview.
- **Clean Git diffs.** Lines you did not touch are saved exactly as they were, so a small edit is a small diff.
- **Matches your theme.** Light, dark, or any color theme. It fills the editor, the tab, or the split you give it.
- **Private.** No tracking, no accounts, no network requests for code.
- **Nothing to set up.** Install it, open a `.md` file, and write.

## Type `/` to add anything

Headings, bullet, numbered and task lists, quotes, tables, code blocks, math, and diagrams. Select text for a formatting toolbar, and drag the handle beside any block to move it.

![The slash menu in NotionDown, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/slash-dark.png)

## Diagrams, math, code, and tables, right in the page

- **Diagrams:** a `mermaid` code block draws its diagram under the source.
- **Math:** `$...$` and `$$...$$` render with KaTeX.
- **Code:** editable blocks with syntax highlighting for the languages CodeMirror supports.
- **Tables:** add, remove, and align rows and columns with the mouse.

![Math, a code block, a table, and a quote in NotionDown, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/table-dark.png)

![Math, code, a table, and a quote in NotionDown, light theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/details-light.png)

## Works with the rest of your tools

Change the file in another editor, undo, or switch Git branches, and NotionDown updates. Press Cmd/Ctrl+S at any moment, even a split second after your last key: the last word is in the file, and your formatter still runs.

![A note with a task list and a Mermaid diagram, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/overview-dark.png)

## Install

1. Open the Extensions view in VS Code.
2. Search for "NotionDown", or for the identifier `KunalPathak.notiondown`.
3. Select **Install**.

NotionDown opens every `.md` file by default. Open one and start writing.

## Switch between NotionDown and the text editor

- The **`</>`** button in a NotionDown tab shows the Markdown source in VS Code's text editor. The rocket button in the text editor brings you back. Each replaces the tab, so the file is never open twice.
- To choose the default for all Markdown files, run **Markdown: Use the VS Code Text Editor as the Default Markdown Editor** or **Markdown: Use NotionDown as the Default Markdown Editor** from the Command Palette. Both write one `"*.md"` entry to your `workbench.editorAssociations` user setting, so you can also edit it in settings.json.
- If that setting already sends `*.md` to the text editor, NotionDown asks whether to switch. **See Screenshots** on that question, or **Markdown: Show NotionDown Screenshots**, opens a Get Started page that shows the editor and has the buttons to choose.
- For one file only, use **Reopen Editor With...** and pick the editor.
- To open a file in NotionDown from the Explorer, right-click it and choose **Open in NotionDown**.

## How NotionDown saves your file

- A block you edit is saved in NotionDown's style: `-` bullets, padded table columns, and a backslash before a character Markdown could read as formatting. Everything else stays byte for byte.
- Enter starts a new paragraph. Shift+Enter breaks the line inside a paragraph and writes a backslash at the end of it, which every Markdown renderer reads as a line break.
- Front matter is kept out of the editor and left unchanged.

## What to expect

- Images written as `![alt](path)` display. NotionDown does not insert, paste, or drag-and-drop images.
- Two dollar signs in one paragraph, such as two prices, can display as math. The text in the file does not change.
- Syntax that Milkdown does not support, such as footnotes, shows as text.
- A Mermaid diagram takes its color theme when you open the file.
- VS Code's Outline view stays empty in a NotionDown tab, because VS Code does not offer it to custom editors. The text editor's Outline works as usual.

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
