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

No entries.

## Declined

### Image insertion (paste, drag and drop, upload)

- **What it is:**
  - Pasting or dragging an image into the editor saves the file beside the document and inserts a link.
- **Why it is declined:**
  - The maintainer decided that NotionDown never inserts images. Images written as `![alt](path)` still display.
  - The editor's image feature is off, so the slash menu has no image entry.
- **Reopen when:**
  - The maintainer changes the product goal.
