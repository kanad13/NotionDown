# NotionDown: a visual Markdown editor for VS Code

**Write Markdown the way you write in Notion.** Type `/` for headings, lists, tables, and code. Drag blocks to reorder them. See diagrams and math as you write. The file on disk stays plain Markdown, so Git, your docs site, and every other tool keep working.

![NotionDown editing a note with a task list and a Mermaid diagram, light theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/overview-light.png)

## Why NotionDown

- **One canvas, no preview pane.** You edit the finished page. There is no split screen and no scroll sync.
- **Plain Markdown, clean Git diffs.** Lines you did not touch are written back byte for byte, so a small edit is a small diff.
- **Fits your editor.** Colors follow your VS Code theme, light or dark, and the page fills the editor, tab, or split you give it and resizes with it.
- **Private by design.** No tracking, no accounts, and no network request for code. Everything runs inside VS Code.
- **Nothing to set up.** Install it, open a `.md` file, and write.

## What you can do

### Type `/` for any block

Headings, bullet, numbered and task lists, quotes, tables, code blocks, math, and diagrams. Select text for a floating toolbar, and drag the handle beside a block to move it.

![The slash menu in NotionDown, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/slash-dark.png)

### Tables, code, math, and diagrams in place

- **Tables:** add, remove, and align rows and columns visually.
- **Code:** editable blocks with syntax highlighting for the languages CodeMirror supports.
- **Math:** inline `$...$` and block `$$...$$` render with KaTeX, and the source stays in the file.
- **Diagrams:** a `mermaid` code block draws its diagram under the source.

![Math, code, a table, and a quote in NotionDown, light theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/details-light.png)

### Stays in sync with everything else

Changes made in another editor, an undo, or a Git checkout appear in NotionDown, and the reverse. Save with Cmd/Ctrl+S at any moment, even a split second after your last key: the last word is in the file, and your formatter (Prettier, whitespace trimming, a final newline) still runs.

![A note with a task list and a Mermaid diagram, dark theme](https://raw.githubusercontent.com/kanad13/NotionDown/main/assets/screenshots/overview-dark.png)

## Install

1. Open the Extensions view in VS Code.
2. Search for "NotionDown", or for the identifier `KunalPathak.notiondown`.
3. Select **Install**.

NotionDown opens every `.md` file by default. Open one and start writing.

## Use

1. Open a Markdown file.
2. To open a file in NotionDown by hand, select the **Open in NotionDown** rocket icon in the editor title bar (it replaces the text editor tab), or right-click the file in the Explorer and choose **Open in NotionDown**.
3. Edit and save as you would any file.

**Prefer VS Code's text editor for Markdown?**

- Run **Markdown: Use the VS Code Text Editor as the Default Markdown Editor** from the Command Palette. **Markdown: Use NotionDown as the Default Markdown Editor** reverses it.
- Both commands write one entry (`"*.md"`) to your `workbench.editorAssociations` user setting, so you can also edit it in settings.json.
- If your own `workbench.editorAssociations` setting maps `*.md` to the text editor, VS Code keeps using it. NotionDown asks once whether to replace that entry, and asks again in up to two later sessions if you ignore it. Pressing either button ends the question.
- To open a single file in the text editor, use **Reopen Editor With... > Text Editor**.

## How it treats your file

- A block you edited is written in NotionDown's style: `-` bullets, padded table columns, and a backslash before a character that Markdown could read as formatting. A `#` that cannot start a heading, such as `#hashtag`, gets no backslash.
- Enter starts a new paragraph, which the file separates with a blank line. Shift+Enter breaks the line inside a paragraph and writes a backslash at the end of it, which every Markdown renderer reads as a line break.
- Empty paragraphs you add are not written to the file, and front matter is kept out of the editor and left unchanged.
- A single line break in the file shows as a space, as in most Markdown renderers.

## Good to know

- Images written as `![alt](path)` display. NotionDown focuses on text, so it does not insert, paste, or drag-and-drop images.
- Two dollar signs in one paragraph, such as two prices, can display as math. The text in the file does not change.
- Syntax that Milkdown does not support, such as footnotes, shows as text.
- A Mermaid diagram changes its color theme the next time you open the file.

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
