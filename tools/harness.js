/**
 * Browser harness for the webview page.
 *
 * Why it exists: automated tests run under Node and cannot render Milkdown or Mermaid. This
 * server builds the real page with the extension's own `buildHtml`, replaces VS Code's
 * `acquireVsCodeApi` with a recorder, and serves `dist/webview` over HTTP, so the bundle can
 * be exercised in any browser. Usage: `node tools/harness.js [port] [markdown-file]`; add `?dark` to the URL for the dark theme.
 * The page records messages in `window.__posted`; `window.postMessage` simulates the host.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { install } = require("../test/helpers/fake-vscode");

install();
const { buildHtml, getNonce } = require("../src/extension");

const root = path.resolve(__dirname, "..");
const port = Number(process.argv[2]) || 4173;
const sampleFile = path.resolve(process.argv[3] || path.join(root, "examples/test.md"));
const origin = `http://localhost:${port}`;
const types = { ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png" };

/** Stand-ins for the theme variables VS Code injects, in its Light+ and Dark+ colors. */
const themes = {
	light: "--vscode-editor-background:#fff;--vscode-editor-foreground:#333;--vscode-editorWidget-background:#f3f3f3;--vscode-editorWidget-border:#c8c8c8;--vscode-sideBar-background:#f3f3f3;--vscode-descriptionForeground:#717171;--vscode-textLink-foreground:#006ab1;--vscode-editor-selectionBackground:#add6ff;--vscode-textPreformat-foreground:#a31515;--vscode-errorForeground:#a1260d;--vscode-list-hoverBackground:#e8e8e8;--vscode-list-activeSelectionBackground:#0060c0;--vscode-textCodeBlock-background:#f0f0f0",
	dark: "--vscode-editor-background:#1e1e1e;--vscode-editor-foreground:#d4d4d4;--vscode-editorWidget-background:#252526;--vscode-editorWidget-border:#454545;--vscode-sideBar-background:#252526;--vscode-descriptionForeground:#ccccccb3;--vscode-textLink-foreground:#3794ff;--vscode-editor-selectionBackground:#264f78;--vscode-textPreformat-foreground:#d7ba7d;--vscode-errorForeground:#f48771;--vscode-list-hoverBackground:#2a2d2e;--vscode-list-activeSelectionBackground:#04395e;--vscode-textCodeBlock-background:#2a2a2a",
};

/** Builds the harness page; the inline host stub carries the page's nonce. `theme` is "light" or "dark". */
function page(theme) {
	const nonce = getNonce();
	const sample = JSON.stringify(fs.readFileSync(sampleFile, "utf8")).replace(/</g, "\\u003c");
	const html = buildHtml({
		nonce,
		cspSource: origin,
		scriptUri: `${origin}/dist/webview/main.js`,
		styleUri: `${origin}/dist/webview/main.css`,
		baseUri: `${origin}/examples/`,
		publicPath: `${origin}/dist/webview/`,
	});
	const stub = `<script nonce="${nonce}">
window.__posted = [];
window.acquireVsCodeApi = () => ({ postMessage: (m) => {
	window.__posted.push(m);
	if (m.type === "ready") setTimeout(() => window.postMessage({ type: "init", text: ${sample} }, "*"));
} });
</script>`;
	const style = `<style>:root{${themes[theme]};--vscode-font-family:system-ui,sans-serif;--vscode-editor-font-family:Menlo,monospace}</style>`;
	// Function replacers: the sample text can contain `$&` or `$'`, which a string replacement would expand.
	return html.replace("</head>", () => `${style}${stub}</head>`).replace("<body>", () => `<body class="vscode-${theme}">`);
}

http.createServer((req, res) => {
	const [rawPath, query = ""] = req.url.split("?");
	const url = decodeURIComponent(rawPath);
	if (url === "/") {
		res.writeHead(200, { "Content-Type": "text/html" }).end(page(query.includes("dark") ? "dark" : "light"));
		return;
	}
	const file = path.join(root, url);
	if (!file.startsWith(path.join(root, "dist") + path.sep) && !file.startsWith(path.join(root, "examples") + path.sep)) {
		res.writeHead(404).end();
		return;
	}
	fs.readFile(file, (err, data) => {
		if (err) return res.writeHead(404).end();
		res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }).end(data);
	});
}).listen(port, () => console.log(`Harness at ${origin}`));
