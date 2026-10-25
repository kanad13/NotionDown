/**
 * NotionDown page script, bundled by webpack for the webview.
 *
 * Why it is small: Milkdown Crepe provides the editor. This file only wires it to the
 * host's four-message protocol (see src/extension.js) and renders Mermaid code blocks. Math is
 * rendered by Crepe's Latex feature.
 *
 * Invariants:
 * - `hostText` is the file text the host holds. The page sends text only when it differs from
 *   `hostText`, and blocks the user did not edit keep their original text (see markdown-sync.js),
 *   so opening or saving a file never rewrites lines the user did not touch.
 * - Mermaid runs with `securityLevel: "strict"`, so diagram text cannot inject markup.
 */
import { Crepe } from "@milkdown/crepe";
import { parserCtx, remarkCtx, remarkStringifyOptionsCtx, serializerCtx } from "@milkdown/kit/core";
import { replaceAll } from "@milkdown/kit/utils";
import { languages } from "./languages";
import { FEATURES, applyStringifyStyle, createTools, reconcileMarkdown, splitFrontMatter } from "../markdown-sync";
// Individual files instead of common/style.css: the bundle ships without the AI, top-bar and
// image-block features, and their styles would load for nothing.
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
import "@milkdown/crepe/theme/common/latex.css";
import "@milkdown/crepe/theme/frame.css";
import "./theme.css";

// The loader sets these before any lazy chunk (Mermaid, CodeMirror languages) is requested.
// Webpack reads them as globals, so they must exist before the first dynamic import.
const script = document.currentScript;
__webpack_public_path__ = script.dataset.publicPath;
__webpack_nonce__ = script.nonce;

/** Milliseconds to wait after the last keystroke before sending the text to the host. */
const SEND_DELAY_MS = 200;

/** Upper bound for the adaptive delay, so a huge file still saves within a couple of seconds. */
const MAX_SEND_DELAY_MS = 2000;

/** Milliseconds after opening at which the page precomputes block comparisons for the first edit. */
const WARM_UP_DELAY_MS = 500;

const vscode = acquireVsCodeApi();

const keys = { remarkCtx, parserCtx, serializerCtx, remarkStringifyOptionsCtx };
const normalizedBlocks = new Map();

let crepe;
let hostText = "";
let sendTimer;
let sendDelay = SEND_DELAY_MS;
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
 * Builds the file text for the editor's current content.
 *
 * @returns {string} File text in which blocks the user did not edit keep their original text
 */
function currentText() {
	const { front, body } = splitFrontMatter(hostText);
	const edited = crepe.getMarkdown();
	return front + crepe.editor.action((ctx) => reconcileMarkdown(body, edited, createTools(ctx, keys, normalizedBlocks)));
}

/**
 * Sends the current Markdown to the host if the user changed it.
 *
 * The work grows with the file, so the delay before the next send grows with how long this one
 * took: typing in a very large file never spends more than about a fifth of its time here.
 */
function flush() {
	clearTimeout(sendTimer);
	const started = performance.now();
	const text = currentText();
	sendDelay = Math.min(MAX_SEND_DELAY_MS, Math.max(SEND_DELAY_MS, (performance.now() - started) * 4));
	if (text === hostText) return;
	hostText = text;
	vscode.postMessage({ type: "edit", text });
}

/**
 * Creates the editor with the host's text.
 *
 * @param {string} text - Markdown from the host
 * @returns {Promise<void>} Resolves once the editor is mounted
 */
async function createEditor(text) {
	hostText = text;
	// Front matter is not content; the editor shows the body and `flush` puts the front matter back.
	crepe = new Crepe({
		root: document.getElementById("editor"),
		defaultValue: splitFrontMatter(text).body,
		features: FEATURES,
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
	crepe.editor.config((ctx) => applyStringifyStyle(ctx, keys));
	crepe.on((listener) =>
		listener.markdownUpdated(() => {
			clearTimeout(sendTimer);
			sendTimer = setTimeout(flush, sendDelay);
		})
	);
	await crepe.create();
	// The first comparison parses and serializes every block. Doing it now, while the user reads,
	// keeps the first keystroke from stalling on a large file.
	setTimeout(() => crepe && currentText(), WARM_UP_DELAY_MS);
}

window.addEventListener("message", async (event) => {
	const message = event.data;
	if (!message || typeof message.text !== "string") return;
	if (message.type === "init") {
		await createEditor(message.text);
	} else if (message.type === "update" && crepe) {
		clearTimeout(sendTimer);
		hostText = message.text;
		crepe.editor.action(replaceAll(splitFrontMatter(message.text).body));
	}
});

// Edits typed in the last moment before the tab hides or closes must still reach the host.
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "hidden" && crepe) flush();
});

vscode.postMessage({ type: "ready" });
