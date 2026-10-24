# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - Unreleased

### Added

- Notion-style Markdown editor in a VS Code custom editor: slash menu, drag handles, formatting toolbar, visual tables, task lists, and syntax-highlighted code blocks
- Live Mermaid diagrams under `mermaid` code blocks
- **Open in NotionDown** command in the editor title bar and the Explorer context menu, and **Reopen Editor With...** support
- Edits save to the Markdown file through VS Code's own text model, so undo, Save, and Git behave as for any file
- Editor colors follow the active VS Code color theme
- NotionDown is the default editor for `.md` files, with two commands to switch to VS Code's text editor and back
- Math: inline `$...$` and block `$$...$$` render with KaTeX
- Lines you did not edit are written back unchanged: no `<br />` for empty paragraphs, no new backslashes, no change of list markers or rule style, and front matter stays untouched
