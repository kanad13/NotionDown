/**
 * NotionDown page script, bundled by webpack for the webview.
 *
 * Why it is small: Milkdown Crepe provides the editor. This file only wires it to the
 * host's three-message protocol (see src/extension.js) and renders Mermaid code blocks.
 *
 * Invariants:
 * - `baseline` is the page's own serialization of the text the host holds. An editor event
 *   equal to it carries no user change and is not sent, so opening a file never rewrites it.
 * - Mermaid runs with `securityLevel: "strict"`, so diagram text cannot inject markup.
 */
import { Crepe } from "@milkdown/crepe";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { replaceAll } from "@milkdown/kit/utils";
import { languages } from "@codemirror/language-data";
// Individual files instead of common/style.css: the bundle ships without the Latex, AI, top-bar
// and image-block features, and their styles (KaTeX fonts are 1 MB) would load for nothing.
import "@milkdown/crepe/theme/common/prosemirror.css";
import "@milkdown/crepe/theme/common/reset.css";
import "@milkdown/crepe/theme/common/block-edit.css";
import "@milkdown/crepe/theme/common/code-mirror.css";
import "@milkdown/crepe/theme/common/cursor.css";
import "@milkdown/crepe/theme/common/link-tooltip.css";
import "@milkdown/crepe/theme/common/list-item.css";
import "@milkdown/crepe/theme/common/placeholder.css";
import "@milkdown/crepe/theme/common/toolbar.css";
import "@milkdown/crepe/theme/common/table.css";
import "@milkdown/crepe/theme/frame.css";
import "./theme.css";

// The loader sets these before any lazy chunk (Mermaid, CodeMirror languages) is requested.
// Webpack reads them as globals, so they must exist before the first dynamic import.
const script = document.currentScript;
__webpack_public_path__ = script.dataset.publicPath;
__webpack_nonce__ = script.nonce;

/** Milliseconds to wait after the last keystroke before sending the text to the host. */
const SEND_DELAY_MS = 200;

const vscode = acquireVsCodeApi();

let crepe;
let baseline = "";
let sendTimer;
let mermaidRuns = 0;

/**
 * Renders Mermaid source to an element, or to an error note when the source is invalid.
 *
 * @param {string} source - Mermaid diagram text
 * @returns {Promise<HTMLElement>} Element for the code block's preview slot
 */
async function renderMermaid(source) {
	const element = document.createElement("div");
	element.className = "notiondown-mermaid";
	try {
		const { default: mermaid } = await import(/* webpackChunkName: "mermaid" */ "mermaid");
		const dark = document.body.classList.contains("vscode-dark") || document.body.classList.contains("vscode-high-contrast");
		mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
		const { svg } = await mermaid.render(`notiondown-mermaid-${mermaidRuns++}`, source);
		element.innerHTML = svg;
	} catch (error) {
		element.classList.add("notiondown-mermaid-error");
		element.textContent = `Mermaid: ${error && error.message ? error.message : "invalid diagram"}`;
	}
	return element;
}

/**
 * Sends the current Markdown to the host if the user changed it.
 */
function flush() {
	clearTimeout(sendTimer);
	const text = crepe.getMarkdown();
	if (text === baseline) return;
	baseline = text;
	vscode.postMessage({ type: "edit", text });
}

/**
 * Creates the editor with the host's text.
 *
 * @param {string} text - Markdown from the host
 * @returns {Promise<void>} Resolves once the editor is mounted
 */
async function createEditor(text) {
	crepe = new Crepe({
		root: document.getElementById("editor"),
		defaultValue: text,
		features: { [Crepe.Feature.Latex]: false, [Crepe.Feature.ImageBlock]: false },
		featureConfigs: {
			[Crepe.Feature.CodeMirror]: {
				languages,
				previewToggleText: () => "Preview",
				renderPreview: (language, content, applyPreview) => {
					if (language.toLowerCase() !== "mermaid" || !content.trim()) return null;
					renderMermaid(content).then(applyPreview);
				},
			},
		},
	});
	// Write the styles most Markdown files already use, so the first edit does not turn every
	// "-" bullet and "---" rule into "*" and "***" in Git.
	crepe.editor.config((ctx) => ctx.update(remarkStringifyOptionsCtx, (options) => ({ ...options, bullet: "-", rule: "-" })));
	crepe.on((listener) =>
		listener.markdownUpdated((_ctx, markdown) => {
			if (markdown === baseline) return;
			clearTimeout(sendTimer);
			sendTimer = setTimeout(flush, SEND_DELAY_MS);
		})
	);
	await crepe.create();
	baseline = crepe.getMarkdown();
}

window.addEventListener("message", async (event) => {
	const message = event.data;
	if (!message || typeof message.text !== "string") return;
	if (message.type === "init") {
		await createEditor(message.text);
	} else if (message.type === "update" && crepe) {
		clearTimeout(sendTimer);
		crepe.editor.action(replaceAll(message.text));
		baseline = crepe.getMarkdown();
	}
});

// Edits typed in the last moment before the tab hides or closes must still reach the host.
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "hidden" && crepe) flush();
});

vscode.postMessage({ type: "ready" });
