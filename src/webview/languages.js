/**
 * The code-block languages that get syntax highlighting.
 *
 * Why it exists: `@codemirror/language-data` lists about 140 languages, and webpack turns each
 * into its own lazy file, so the package held 180 script files and drew a Marketplace warning.
 * Importing only the languages people write in Markdown keeps the file count and the package
 * size down. Any other language still renders as plain, editable text.
 *
 * The entries are copied from `@codemirror/language-data` so names, aliases and file extensions
 * stay identical. To add a language, copy its entry from that package's `dist/index.js`.
 */
import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";

function legacy(parser) {
	return new LanguageSupport(StreamLanguage.define(parser));
}

function sql(dialectName) {
	return import("@codemirror/lang-sql").then((m) => m.sql({ dialect: m[dialectName] }));
}

export const languages = [
	LanguageDescription.of({
		name: "C",
		extensions: ["c", "h", "ino"],
		load() {
			return import("@codemirror/lang-cpp").then((m) => m.cpp());
		},
	}),
	LanguageDescription.of({
		name: "C++",
		alias: ["cpp"],
		extensions: ["cpp", "c++", "cc", "cxx", "hpp", "h++", "hh", "hxx"],
		load() {
			return import("@codemirror/lang-cpp").then((m) => m.cpp());
		},
	}),
	LanguageDescription.of({
		name: "CSS",
		extensions: ["css"],
		load() {
			return import("@codemirror/lang-css").then((m) => m.css());
		},
	}),
	LanguageDescription.of({
		name: "Go",
		extensions: ["go"],
		load() {
			return import("@codemirror/lang-go").then((m) => m.go());
		},
	}),
	LanguageDescription.of({
		name: "HTML",
		alias: ["xhtml"],
		extensions: ["html", "htm", "handlebars", "hbs"],
		load() {
			return import("@codemirror/lang-html").then((m) => m.html());
		},
	}),
	LanguageDescription.of({
		name: "Java",
		extensions: ["java"],
		load() {
			return import("@codemirror/lang-java").then((m) => m.java());
		},
	}),
	LanguageDescription.of({
		name: "JavaScript",
		alias: ["ecmascript", "js", "node"],
		extensions: ["js", "mjs", "cjs"],
		load() {
			return import("@codemirror/lang-javascript").then((m) => m.javascript());
		},
	}),
	LanguageDescription.of({
		name: "JSON",
		alias: ["json5"],
		extensions: ["json", "map"],
		load() {
			return import("@codemirror/lang-json").then((m) => m.json());
		},
	}),
	LanguageDescription.of({
		name: "JSX",
		extensions: ["jsx"],
		load() {
			return import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true }));
		},
	}),
	LanguageDescription.of({
		name: "Markdown",
		extensions: ["md", "markdown", "mkd"],
		load() {
			return import("@codemirror/lang-markdown").then((m) => m.markdown());
		},
	}),
	LanguageDescription.of({
		name: "PHP",
		extensions: ["php", "php3", "php4", "php5", "php7", "phtml"],
		load() {
			return import("@codemirror/lang-php").then((m) => m.php());
		},
	}),
	LanguageDescription.of({
		name: "Python",
		extensions: ["BUILD", "bzl", "py", "pyw"],
		filename: /^(BUCK|BUILD)$/,
		load() {
			return import("@codemirror/lang-python").then((m) => m.python());
		},
	}),
	LanguageDescription.of({
		name: "Rust",
		extensions: ["rs"],
		load() {
			return import("@codemirror/lang-rust").then((m) => m.rust());
		},
	}),
	LanguageDescription.of({
		name: "SCSS",
		extensions: ["scss"],
		load() {
			return import("@codemirror/lang-sass").then((m) => m.sass());
		},
	}),
	LanguageDescription.of({
		name: "SQL",
		extensions: ["sql"],
		load() {
			return sql("StandardSQL");
		},
	}),
	LanguageDescription.of({
		name: "TSX",
		extensions: ["tsx"],
		load() {
			return import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true, typescript: true }));
		},
	}),
	LanguageDescription.of({
		name: "TypeScript",
		alias: ["ts"],
		extensions: ["ts", "mts", "cts"],
		load() {
			return import("@codemirror/lang-javascript").then((m) => m.javascript({ typescript: true }));
		},
	}),
	LanguageDescription.of({
		name: "XML",
		alias: ["rss", "wsdl", "xsd"],
		extensions: ["xml", "xsl", "xsd", "svg"],
		load() {
			return import("@codemirror/lang-xml").then((m) => m.xml());
		},
	}),
	LanguageDescription.of({
		name: "YAML",
		alias: ["yml"],
		extensions: ["yaml", "yml"],
		load() {
			return import("@codemirror/lang-yaml").then((m) => m.yaml());
		},
	}),
	LanguageDescription.of({
		name: "C#",
		alias: ["csharp", "cs"],
		extensions: ["cs"],
		load() {
			return import("@codemirror/legacy-modes/mode/clike").then((m) => legacy(m.csharp));
		},
	}),
	LanguageDescription.of({
		name: "diff",
		extensions: ["diff", "patch"],
		load() {
			return import("@codemirror/legacy-modes/mode/diff").then((m) => legacy(m.diff));
		},
	}),
	LanguageDescription.of({
		name: "Dockerfile",
		filename: /^Dockerfile$/,
		load() {
			return import("@codemirror/legacy-modes/mode/dockerfile").then((m) => legacy(m.dockerFile));
		},
	}),
	LanguageDescription.of({
		name: "Kotlin",
		extensions: ["kt", "kts"],
		load() {
			return import("@codemirror/legacy-modes/mode/clike").then((m) => legacy(m.kotlin));
		},
	}),
	LanguageDescription.of({
		name: "Lua",
		extensions: ["lua"],
		load() {
			return import("@codemirror/legacy-modes/mode/lua").then((m) => legacy(m.lua));
		},
	}),
	LanguageDescription.of({
		name: "PowerShell",
		extensions: ["ps1", "psd1", "psm1"],
		load() {
			return import("@codemirror/legacy-modes/mode/powershell").then((m) => legacy(m.powerShell));
		},
	}),
	LanguageDescription.of({
		name: "Ruby",
		alias: ["jruby", "macruby", "rake", "rb", "rbx"],
		extensions: ["rb"],
		filename: /^(Gemfile|Rakefile)$/,
		load() {
			return import("@codemirror/legacy-modes/mode/ruby").then((m) => legacy(m.ruby));
		},
	}),
	LanguageDescription.of({
		name: "Shell",
		alias: ["bash", "sh", "zsh"],
		extensions: ["sh", "ksh", "bash"],
		filename: /^PKGBUILD$/,
		load() {
			return import("@codemirror/legacy-modes/mode/shell").then((m) => legacy(m.shell));
		},
	}),
	LanguageDescription.of({
		name: "Swift",
		extensions: ["swift"],
		load() {
			return import("@codemirror/legacy-modes/mode/swift").then((m) => legacy(m.swift));
		},
	}),
	LanguageDescription.of({
		name: "TOML",
		extensions: ["toml"],
		load() {
			return import("@codemirror/legacy-modes/mode/toml").then((m) => legacy(m.toml));
		},
	}),
];
