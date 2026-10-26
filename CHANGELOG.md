# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Removed

- **See Screenshots** on the default-editor question, the **Markdown: Show NotionDown Screenshots** command, and the Get Started walkthrough. The walkthrough did not open in some windows and showed the plain Welcome page instead. The question now has two buttons, **Use NotionDown** and **Keep Text Editor**. The screenshots stay in the readme and are no longer packed into the extension.

## [1.0.0] - 2026-10-26

### Added

- **See Screenshots** on the default-editor question opens a Get Started page that shows NotionDown in light and dark and has the buttons that choose the default editor. **Markdown: Show NotionDown Screenshots** opens the same page.
- A `</>` button in the NotionDown tab shows the Markdown source in VS Code's text editor.

### Fixed

- The default-editor question appeared never again after a reinstall if you had once chosen NotionDown, because VS Code keeps an extension's stored answers through an uninstall. A "yes" is no longer stored, so the question returns when your settings send Markdown to the text editor again.
- A Mermaid diagram with an error no longer leaves its error drawing at the bottom of the page.
- Code fences longer than three backticks, and tilde fences that hold backtick lines, are treated as code when you edit the block around them.

### Changed

- The readme leads with the features and more screenshots.

## [0.4.0] - 2026-10-25

### Fixed

- Save pressed within about half a second of your last key now saves that last word. The file ends formatted by your formatter, and the tab no longer shows the unsaved marker again.

### Changed

- The text column fills the editor up to a wider limit and follows the window, tab, or split as you resize it. Before, it stopped at a fixed 52 rem with wide empty margins.

## [0.3.0] - 2026-10-25

### Fixed

- Words you type are no longer swallowed. With autosave on, trimmed whitespace, a final newline, or a formatter such as Prettier, the file is rewritten shortly after you stop typing, and the editor used to replace its content with the rewrite and drop the latest words. A rewrite that only changes formatting now leaves the editor, your cursor, and your typing alone.
- After another program changes the file, such as a Git checkout or an undo in the text editor, the cursor stays where it was.
- Markdown files open in NotionDown for users whose `workbench.editorAssociations` setting sent `*.md` to the text editor: NotionDown now asks whether to remove that entry.
- A `#hashtag` typed at the start of a line is saved as typed, not as `\#hashtag`.
- **Open in NotionDown** replaces the text editor tab instead of opening a second tab for the same file.
- The question about making NotionDown the default comes back in up to two later sessions if its notification was ignored, and when you click the rocket.

### Changed

- The title-bar button is the rocket icon from VS Code's built-in icon set instead of a pencil. It needs a recent VS Code to show.

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
