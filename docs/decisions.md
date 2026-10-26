# Decisions

This page records ideas that were evaluated and are **not implemented**. Each entry gives the reason and the condition that would justify reopening it. The page is a decision log, not a backlog.

- **Scheduling:**
  - No entry is scheduled.
  - Implement an entry only when the maintainer asks for it.
- **Related pages:**
  - [readme.md](../readme.md) and [architecture.md](architecture.md) describe the features that exist.
  - [CHANGELOG.md](../CHANGELOG.md) lists release history.

## How Ideas Are Judged

Each idea is compared on two measures:

- **Value:** Does it fix a real failure or add a capability people need?
- **Cost:** What does it add in code, risk, and upkeep?

The project goals set the limits: one canvas, plain Markdown on disk, private, and zero configuration.

## Status Meanings

| Status                  | Meaning                                                                            |
| :---------------------- | :--------------------------------------------------------------------------------- |
| Worthwhile, unscheduled | Value justifies the cost. Waiting for the maintainer to ask.                       |
| Deferred                | Value is real but too small for the current cost. Reopen when the condition holds. |
| Declined                | Conflicts with a project goal. Do not reopen without changing the goal.            |

## Worthwhile, Unscheduled

No entries.

## Deferred

### Settings for width, font, and similar options

- **What it is:**
  - Extension settings (`notionDown.*`) for the reading width, font size, line height, font family, and similar presentation options.
- **Why it is deferred:**
  - The column now fills the pane up to 72 rem and follows every resize, which removes the main reason to ask for a width setting. The editor already uses VS Code's UI and editor fonts, and VS Code's zoom scales the page.
  - A setting needs a manifest entry, a way to reach the page without a fifth message (CSS values written into the page template when it renders, which applies after a reopen) or a live path that adds a message, a test per setting, and a place in the readme. The product goal is zero configuration.
  - If one is built, a width setting (`notionDown.maxWidth`, with `full`) is the likeliest, then font size.
- **Reopen when:**
  - Several users ask for the same option, or a default width or size proves wrong for a group of users.

### Outline panel, word count, focus and typewriter mode

- **What it is:**
  - Typora offers an outline panel, a word count, and a focus mode that dims every line but the active one.
- **Why it is deferred:**
  - VS Code has an Outline view and a status bar, but this evaluation did not confirm that the Outline view follows a custom editor's page. A reliable outline needs a new message type from the page (headings) or the host parsing the file again, and the architecture allows four messages only. A word count in the status bar is smaller, but it is a second feature surface for a small gain, and focus mode is page CSS and script that only a few writers use.
- **Reopen when:**
  - Several users ask for an outline in particular, or VS Code lets a custom text editor feed its Outline view.

### Callouts, toggles, and columns

- **What it is:**
  - Notion's callout, toggle list, and column blocks.
- **Why it is deferred:**
  - Plain Markdown has no syntax for them. Notion's own Markdown export writes them as XML-like tags, which other renderers show as raw text. The Crepe editor in use has no such blocks, and the file must stay readable everywhere. GitHub's alert syntax (`> [!NOTE]`) is the portable form, but the editor would show it as a quote until a feature for it exists.
- **Reopen when:**
  - Crepe ships a block for GitHub alerts, or users ask for alerts specifically.

### Rewriting the serializer's output fixes inside the serializer

- **What it is:**
  - `src/markdown-sync.js` removes `<br />` placeholders and the `\#` escape from the serializer's text after the fact. The same effect could come from custom `remark-stringify` handlers.
- **Why it is deferred:**
  - The text fixes are small, run only on blocks the user edited, and have fixtures. Fence tracking was the one real defect and follows CommonMark now. Handlers would couple the code to remark-stringify's internals, which change between Milkdown releases.
- **Reopen when:**
  - A fixture shows a wrong rewrite that the text fixes cannot repair, or a Milkdown upgrade breaks them.

### Live theme change for Mermaid

- **What it is:**
  - A diagram redraws when the user changes the VS Code color theme.
- **Why it is deferred:**
  - The diagram takes its theme when the file opens, and the readme says so. Redrawing needs an observer on the body class and a way to refresh Crepe's preview slot.
- **Reopen when:**
  - Users report it, or Crepe exposes a refresh for the preview.

## Declined

### Image insertion (paste, drag and drop, upload)

- **What it is:**
  - Pasting or dragging an image into the editor saves the file beside the document and inserts a link.
- **Why it is declined:**
  - The maintainer decided that NotionDown never inserts images. Images written as `![alt](path)` still display.
  - The editor's image feature is off, so the slash menu has no image entry.
- **Reopen when:**
  - The maintainer changes the product goal.
