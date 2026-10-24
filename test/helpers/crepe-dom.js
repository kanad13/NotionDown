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
 * @returns {Promise<{ edit: Function, serialize: Function, save: Function, destroy: Function }>} Session helpers; `save()` reconciles against the text given to `open`
 */
async function open(markdown, options = {}) {
	installDom();
	const { Crepe } = await import("@milkdown/crepe");
	const core = await import("@milkdown/kit/core");
	const utils = await import("@milkdown/kit/utils");
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
		features: { [Crepe.Feature.Latex]: false, [Crepe.Feature.ImageBlock]: false, ...(options.features || {}) },
	});
	crepe.editor.config((ctx) => sync.applyStringifyStyle(ctx, keys));
	await crepe.create();
	const cache = new Map();
	return {
		/** The editor's DOM root, for assertions about what the user would see. */
		root,
		/** Replaces the document with `next` file text, as a burst of typing would. */
		edit(next) {
			crepe.editor.action(utils.replaceAll(sync.splitFrontMatter(next).body));
		},
		/** The editor's raw serialization. */
		serialize: () => crepe.getMarkdown(),
		/** The file text the page would send to the host. */
		save: () =>
			front +
			crepe.editor.action((ctx) => sync.reconcileMarkdown(body, crepe.getMarkdown(), sync.createTools(ctx, keys, cache))),
		destroy: () => crepe.destroy(),
	};
}

module.exports = { open };
