/**
 * Runs the real Milkdown Crepe editor under jsdom, so Node tests can exercise the exact
 * parse and serialize pipeline that the page uses.
 *
 * Why it exists: a mock of the serializer would test the mock. The failures that matter here
 * (escaped characters, `<br />` placeholders, list markers) come from Milkdown itself.
 *
 * Invariant: call `open()` only after reading the limits below. jsdom has no layout, so
 * nothing here tests how the page looks, only what text the editor produces.
 */
const { JSDOM } = require("jsdom");
const sync = require("../../src/markdown-sync");
const { replaceContent } = require("../../src/editor-replace");

class NoopObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords() {
		return [];
	}
}

let installed = false;

/** Copies the jsdom window onto `globalThis`, once, and returns the root element for editors. */
function installDom() {
	if (installed) return;
	const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
	const { window } = dom;
	for (const key of Object.getOwnPropertyNames(window)) {
		if (!(key in globalThis)) {
			try {
				globalThis[key] = window[key];
			} catch {
				// Some window members are accessors that throw outside a browser; the editor does not need them.
			}
		}
	}
	// Node ships its own Event classes. Milkdown dispatches events on the jsdom window, which rejects them.
	for (const key of ["Event", "CustomEvent", "EventTarget", "AbortController", "AbortSignal"]) globalThis[key] = window[key];
	for (const key of ["addEventListener", "removeEventListener", "dispatchEvent"]) globalThis[key] = window[key].bind(window);
	for (const key of ["IntersectionObserver", "ResizeObserver"]) {
		globalThis[key] = NoopObserver;
		window[key] = NoopObserver;
	}
	globalThis.window = window;
	globalThis.document = window.document;
	Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
	installed = true;
}

/**
 * Opens a document in a real Crepe editor configured like the page.
 *
 * @param {string} markdown - File text; front matter is split off and kept out of the editor, as the page does
 * @param {{ features?: object }} [options] - Crepe feature flags to override
 * @returns {Promise<object>} Session helpers: `edit`, `serialize`, `save` (reconciles against the text given to `open`), `withTools`, `replaceBody`, `typeAtEnd`, `visibleText`, `selection`, `placeCursor`, `destroy`
 */
async function open(markdown, options = {}) {
	installDom();
	const { Crepe } = await import("@milkdown/crepe");
	const core = await import("@milkdown/kit/core");
	const utils = await import("@milkdown/kit/utils");
	const state = await import("@milkdown/kit/prose/state");
	const keys = {
		remarkCtx: core.remarkCtx,
		parserCtx: core.parserCtx,
		serializerCtx: core.serializerCtx,
		remarkStringifyOptionsCtx: core.remarkStringifyOptionsCtx,
	};
	const { front, body } = sync.splitFrontMatter(markdown);
	const root = globalThis.document.createElement("div");
	globalThis.document.body.appendChild(root);
	const crepe = new Crepe({
		root,
		defaultValue: body,
		features: { ...sync.FEATURES, ...(options.features || {}) },
	});
	crepe.editor.config((ctx) => sync.applyStringifyStyle(ctx, keys));
	await crepe.create();
	const cache = new Map();
	const view = () => crepe.editor.action((ctx) => ctx.get(core.editorViewCtx));
	return {
		crepe,
		/** The editor's DOM root, for assertions about what the user would see. */
		root,
		/** Replaces the document with `next` file text, as a burst of typing would. */
		edit(next) {
			crepe.editor.action(utils.replaceAll(sync.splitFrontMatter(next).body));
		},
		/** The editor's raw serialization. */
		serialize: () => crepe.getMarkdown(),
		/** Runs `use` with the parser access that markdown-sync and page-sync need. */
		withTools: (use) => crepe.editor.action((ctx) => use(sync.createTools(ctx, keys, cache))),
		/** Replaces the editor content with Markdown, as the page does for an external change. */
		replaceBody: (body) =>
			replaceContent(crepe.editor, body, {
				replaceAll: utils.replaceAll,
				editorViewCtx: core.editorViewCtx,
				Selection: state.Selection,
				TextSelection: state.TextSelection,
			}),
		/** The cursor, as document positions. */
		selection: () => {
			const { from, to } = view().state.selection;
			return { from, to };
		},
		/** Puts the cursor at `position` in the document, as a click would. */
		placeCursor(position) {
			const editorView = view();
			editorView.dispatch(editorView.state.tr.setSelection(state.TextSelection.create(editorView.state.doc, position)));
		},
		/** Types `text` at the end of the document, the way keystrokes arrive: one transaction, cursor after it. */
		typeAtEnd(text) {
			const editorView = view();
			const end = editorView.state.doc.content.size - 1;
			const selection = state.TextSelection.create(editorView.state.doc, end);
			editorView.dispatch(editorView.state.tr.setSelection(selection).insertText(text));
		},
		/** The text the user sees, without markup. */
		visibleText: () => view().state.doc.textContent,
		/** The file text the page would send to the host. */
		save: () =>
			front +
			crepe.editor.action((ctx) => sync.reconcileMarkdown(body, crepe.getMarkdown(), sync.createTools(ctx, keys, cache))),
		destroy: () => crepe.destroy(),
	};
}

module.exports = { open };
