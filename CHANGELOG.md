# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-10-25

### Changed

- Code blocks highlight every language that CodeMirror supports again. Version 0.1.1 limited highlighting to 29 languages. This release keeps all of them in one file, so the package still avoids the vsce file-count warning.
- Publishing to Open VSX is checked through the shared release workflow.

## [0.1.1] - 2026-10-25

### Changed

- Code blocks highlight 29 common languages (JavaScript, TypeScript, Python, Go, Rust, Java, C, C++, C#, PHP, Ruby, Shell, SQL, JSON, YAML, TOML, HTML, CSS, SCSS, XML, Markdown, Diff, Dockerfile, Kotlin, Lua, PowerShell, Swift, JSX, and TSX). Other languages stay as plain, editable text.
- The package has about 90 fewer files, and Visual Studio Code no longer warns about the extension's file count.

## [0.1.0] - 2026-10-24

### Added

- Notion-style Markdown editor in a VS Code custom editor: slash menu, drag handles, formatting toolbar, visual tables, task lists, and syntax-highlighted code blocks
- Live Mermaid diagrams under `mermaid` code blocks
- **Open in NotionDown** command in the editor title bar and the Explorer context menu, and **Reopen Editor With...** support
- Edits save to the Markdown file through VS Code's own text model, so undo, Save, and Git behave as for any file
- Editor colors follow the active VS Code color theme
- NotionDown is the default editor for `.md` files, with two commands to switch to VS Code's text editor and back
- Math: inline `$...$` and block `$$...$$` render with KaTeX
- Lines you did not edit are written back unchanged: no `<br />` for empty paragraphs, no new backslashes, no change of list markers or rule style, and front matter stays untouched
