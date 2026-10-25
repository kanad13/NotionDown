/**
 * NotionDown page script, bundled by webpack for the webview.
 *
 * Why it is small: Milkdown Crepe provides the editor. This file only wires it to the
 * host's four-message protocol (see src/extension.js) and renders Mermaid code blocks. Math is
 * rendered by Crepe's Latex feature.
 *
 * Invariants:
 * - When to send and how to treat the host's updates is decided in page-sync.js, which Node
 *   tests run against the real editor. This file only connects it to the DOM and the host.
 * - Blocks the user did not edit keep their original text (see markdown-sync.js), so opening or
 *   saving a file never rewrites lines the user did not touch.
 * - Mermaid runs with `securityLevel: "strict"`, so diagram text cannot inject markup.
 */
import { Crepe } from "@milkdown/crepe";
import { editorViewCtx, parserCtx, remarkCtx, remarkStringifyOptionsCtx, serializerCtx } from "@milkdown/kit/core";
import { replaceAll } from "@milkdown/kit/utils";
import { Selection, TextSelection } from "@milkdown/kit/prose/state";
import { languages } from "@codemirror/language-data";
import { FEATURES, applyStringifyStyle, createTools, splitFrontMatter } from "../markdown-sync";
import { createPageSync, isSaveShortcut } from "../page-sync";
import { replaceContent } from "../editor-replace";
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

/** Milliseconds after opening at which the page precomputes block comparisons for the first edit. */
const WARM_UP_DELAY_MS = 500;

const vscode = acquireVsCodeApi();

const keys = { remarkCtx, parserCtx, serializerCtx, remarkStringifyOptionsCtx };
const normalizedBlocks = new Map();

let crepe;
let sync;
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
 * Creates the editor with the host's text.
 *
 * @param {string} text - Markdown from the host
 * @returns {Promise<void>} Resolves once the editor is mounted
 */
async function createEditor(text) {
	// Front matter is not content; the editor shows the body and the sync puts the front matter back.
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
	const session = createPageSync({
		post: (message) => vscode.postMessage(message),
		getMarkdown: () => crepe.getMarkdown(),
		withTools: (use) => crepe.editor.action((ctx) => use(createTools(ctx, keys, normalizedBlocks))),
		replaceEditor: (body) => replaceContent(crepe.editor, body, { replaceAll, editorViewCtx, Selection, TextSelection }),
	});
	session.start(text);
	crepe.on((listener) => listener.markdownUpdated(() => session.onEditorChange()));
	await crepe.create();
	// Messages that arrive while the editor mounts are ignored, so `sync` exists only once it can act on them.
	sync = session;
	// The first comparison parses and serializes every block. Doing it now, while the user reads,
	// keeps the first keystroke from stalling on a large file.
	setTimeout(() => sync && sync.warmUp(), WARM_UP_DELAY_MS);
}

window.addEventListener("message", async (event) => {
	const message = event.data;
	if (!message || typeof message.text !== "string") return;
	if (message.type === "init") {
		await createEditor(message.text);
	} else if (message.type === "update" && sync) {
		sync.onHostUpdate(message.text, message.applied);
	}
});

// Edits typed in the last moment before the tab hides or closes must still reach the host.
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "hidden" && sync) sync.flush();
});

// Save pressed inside the page's pause: send the pending text now (capture phase, before the editor handles the key).
document.addEventListener(
	"keydown",
	(event) => {
		if (sync && isSaveShortcut(event)) sync.flush({ save: true });
	},
	true
);

vscode.postMessage({ type: "ready" });
