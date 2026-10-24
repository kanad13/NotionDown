# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - Unreleased

### Added

- Notion-style Markdown editor in a VS Code custom editor: slash menu, drag handles, formatting toolbar, visual tables, task lists, and syntax-highlighted code blocks
- Live Mermaid diagrams under `mermaid` code blocks
- **Open in NotionDown** command in the editor title bar and the Explorer context menu, and **Reopen Editor With...** support
- Edits save to the Markdown file through VS Code's own text model, so undo, Save, and Git behave as for any file
- Editor colors follow the active VS Code color theme
- One-time question on first use to make NotionDown the default Markdown editor, plus commands to turn that on and off
- Lines you did not edit are written back unchanged: no `<br />` for empty paragraphs, no new backslashes, no change of list markers or rule style, and front matter stays untouched
