/**
 * Tests the webpack output in `dist/`: the bundled host opens a document and serves a complete page,
 * and the page assets carry the styles and lazy chunks the editor needs.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { install, makeDoc, openEditor } = require("./helpers/fake-vscode");

install();

const dist = path.resolve(__dirname, "../dist");

// The source tests load webview.html through a test shim. This suite loads the webpack
// output instead, so it fails when the build stops inlining the template or drops the page assets.
describe("webpack bundle", () => {
	it("exists (run `npm run build` first)", () => {
		for (const file of ["extension.js", "webview/main.js", "webview/main.css"]) {
			assert.ok(fs.existsSync(path.join(dist, file)), `dist/${file} is missing`);
		}
	});

	it("opens a document through the bundled extension and serves a complete page", async () => {
		const bundle = require(path.join(dist, "extension.js"));
		const panel = await openEditor(bundle.activate, makeDoc("/docs/bundle.md", "# Bundle"));
		const html = panel.webview.html;

		assert.ok(html.startsWith("<!DOCTYPE html>"));
		assert.ok(html.includes("Content-Security-Policy"));
		assert.ok(html.includes("webview:/ext/dist/webview/main.js"));
		assert.ok(html.includes("webview:/ext/dist/webview/main.css"));
		assert.ok(html.includes('<base href="webview:/docs/"'));
		assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), "unreplaced template placeholder");
	});

	it("ships the editor styles that Crepe's side-effect-free package flag would otherwise drop", () => {
		const css = fs.readFileSync(path.join(dist, "webview/main.css"), "utf8");
		assert.ok(css.includes(".ProseMirror"), "Crepe CSS missing from main.css");
		assert.ok(css.includes("--vscode-editor-background"), "VS Code theme mapping missing from main.css");
	});

	it("keeps Mermaid out of the entry script, so it loads only when a diagram needs it", () => {
		const entry = fs.readFileSync(path.join(dist, "webview/main.js"), "utf8");
		assert.ok(!entry.includes("mermaidAPI"), "Mermaid is inlined into main.js");
		assert.ok(
			fs.readdirSync(path.join(dist, "webview")).some((f) => f.startsWith("mermaid.") && f.endsWith(".js")),
			"no mermaid chunk emitted"
		);
	});

	it("groups the code languages into one lazy file, so the package is not hundreds of script files", () => {
		// Unbundled, the CodeMirror languages emitted about 180 script files and drew a vsce bundling warning.
		const scripts = fs.readdirSync(path.join(dist, "webview")).filter((f) => f.endsWith(".js"));
		assert.ok(
			scripts.some((f) => f.startsWith("code-languages.")),
			"no code-languages chunk emitted"
		);
		assert.ok(scripts.length <= 100, `${scripts.length} script files in dist/webview`);
	});
});
