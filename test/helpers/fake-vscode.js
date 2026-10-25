/**
 * Test double for the `vscode` module and the webpack `.html` loader.
 *
 * Why it exists: the extension runs inside VS Code and is bundled by webpack, so
 * neither `require("vscode")` nor `require("./webview.html")` resolves under plain
 * Node. This helper installs both shims and records what the extension registers,
 * so tests can open a custom editor, fire document events, and inspect the messages
 * that cross the webview boundary.
 *
 * Invariant: call `install()` before requiring the extension (source or bundle).
 */
const Module = require("module");
const fs = require("fs");
const path = require("path");

/** Callbacks registered by the extension, keyed by event name. Disposing removes the entry. */
const handlers = {};

/** The provider passed to `registerCustomEditorProvider`, and its registration arguments. */
const registration = { viewType: undefined, provider: undefined, options: undefined };

/** Messages passed to `showErrorMessage`, and `[command, ...args]` calls to `executeCommand`. */
const errors = [];
const executed = [];

/** Questions passed to `showInformationMessage`, and the button the fake user presses next. */
const prompts = [];
const userChoice = { next: undefined };

/** `workbench` settings by scope, so tests can see what the extension wrote and where. */
const settings = { global: {}, workspace: {}, writes: [] };

const disposableFor = (key, handler) => ({
	dispose: () => {
		if (handlers[key] === handler) delete handlers[key];
	},
});

/** Tabs the fake workbench shows in its one group, and the tabs the extension closed. */
const tabs = { open: [], closed: [], active: undefined };

const vscode = {
	TabInputText: class TabInputText {
		constructor(uri) {
			this.uri = uri;
		}
	},
	window: {
		activeTextEditor: undefined,
		tabGroups: {
			get activeTabGroup() {
				return { tabs: tabs.open, activeTab: tabs.active };
			},
			get all() {
				return [{ tabs: tabs.open, activeTab: tabs.active }];
			},
			close: async (tab) => {
				tabs.closed.push(tab);
				tabs.open = tabs.open.filter((t) => t !== tab);
				return true;
			},
		},
		showErrorMessage: (message) => errors.push(message),
		showInformationMessage: async (message, ...buttons) => {
			prompts.push({ message, buttons });
			return userChoice.next;
		},
		registerCustomEditorProvider: (viewType, provider, options) => {
			registration.viewType = viewType;
			registration.provider = provider;
			registration.options = options;
			return { dispose: () => {} };
		},
	},
	workspace: {
		workspaceFolders: undefined,
		onDidChangeTextDocument: (handler) => {
			handlers.docChange = handler;
			return disposableFor("docChange", handler);
		},
		/** Applies a WorkspaceEdit to the fake document it names, then fires the change event like VS Code. */
		applyEdit: async (edit) => {
			if (vscode.workspace.applyEditResult === false) return false;
			for (const { doc, text } of edit.replacements) {
				doc.setText(text);
				if (handlers.docChange) {
					handlers.docChange({ document: doc, contentChanges: [{ text }] });
				}
			}
			return true;
		},
		applyEditResult: true,
		getConfiguration: () => ({
			inspect: (key) => ({ globalValue: settings.global[key], workspaceValue: settings.workspace[key] }),
			update: async (key, value, target) => {
				settings.writes.push({ key, value, target });
				settings.global[key] = value;
			},
		}),
	},
	ConfigurationTarget: { Global: 1, Workspace: 2 },
	commands: {
		registerCommand: (id, handler) => {
			handlers[`command:${id}`] = handler;
			return { dispose: () => {} };
		},
		executeCommand: async (...args) => {
			executed.push(args);
		},
	},
	Uri: {
		joinPath: (base, ...parts) => ({ scheme: base.scheme, path: path.posix.join(base.path, ...parts) }),
	},
	Range: class Range {
		constructor(startLine, startCharacter, endLine, endCharacter) {
			Object.assign(this, { startLine, startCharacter, endLine, endCharacter });
		}
	},
	EndOfLine: { LF: 1, CRLF: 2 },
	WorkspaceEdit: class WorkspaceEdit {
		constructor() {
			this.replacements = [];
		}
		replace(uri, range, text) {
			this.replacements.push({ doc: uri.doc, range, text });
		}
	},
};

/**
 * Installs the `.html` loader and the `vscode` module shim.
 */
function install() {
	require.extensions[".html"] = function (module, filename) {
		module.exports = fs.readFileSync(filename, "utf-8");
	};

	const origResolve = Module._resolveFilename;
	Module._resolveFilename = function (request) {
		if (request === "vscode") return "vscode";
		return origResolve.apply(this, arguments);
	};
	require.cache["vscode"] = { id: "vscode", filename: "vscode", loaded: true, exports: vscode };
}

/**
 * Builds a fake text document whose text can change, as a real document does after an edit.
 *
 * @param {string} filePath - Absolute path such as "/docs/guide.md"
 * @param {string} text - Initial content
 * @param {{ languageId?: string, scheme?: string, eol?: number }} [options] - Language, URI scheme, line ending
 * @returns {object} A document with the members the extension reads, plus `setText`
 */
function makeDoc(filePath, text, { languageId = "markdown", scheme = "file", eol = 1 } = {}) {
	const doc = {
		languageId,
		eol,
		getText: () => text,
		get lineCount() {
			return text.split(/\r?\n/).length;
		},
		setText: (next) => {
			text = next;
		},
	};
	doc.uri = {
		scheme,
		path: filePath,
		doc,
		toString: () => `${scheme}://${filePath}`,
	};
	return doc;
}

/**
 * Builds a fake webview panel that records posted messages and lets tests send messages back.
 *
 * @returns {object} Panel with `webview.html`, `webview.options`, `posted`, `receive()` and `dispose()`
 */
function makePanel() {
	let onMessage;
	let onDispose;
	const panel = {
		posted: [],
		webview: {
			html: "",
			options: undefined,
			cspSource: "https://file+.vscode-resource.vscode-cdn.net",
			asWebviewUri: (uri) => ({ toString: () => `webview:${uri.path}` }),
			postMessage: async (message) => {
				panel.posted.push(message);
				return true;
			},
			onDidReceiveMessage: (callback) => {
				onMessage = callback;
				return { dispose: () => (onMessage = undefined) };
			},
		},
		onDidDispose: (callback) => {
			onDispose = callback;
			return { dispose: () => {} };
		},
		/** Delivers a message from the webview page to the extension. */
		receive: (message) => onMessage && onMessage(message),
		dispose: () => onDispose && onDispose(),
	};
	return panel;
}

/**
 * Activates the extension and opens a document in the custom editor.
 *
 * @param {(context: object) => void} activate - The `activate` export under test
 * @param {object} doc - Document from makeDoc()
 * @param {object} [state] - Extension global state from makeState(); a new one by default
 * @returns {Promise<object>} The fake panel, already resolved by the registered provider
 */
async function openEditor(activate, doc, state = makeState()) {
	activate(makeContext(state));
	const panel = makePanel();
	await registration.provider.resolveCustomTextEditor(doc, panel, { isCancellationRequested: false });
	return panel;
}

/**
 * Builds a fake `Memento`, the extension's persistent key-value store.
 *
 * @returns {{ get: Function, update: Function }} Store backed by a Map
 */
function makeState() {
	const values = new Map();
	return { get: (key) => values.get(key), update: async (key, value) => void values.set(key, value) };
}

/**
 * Builds an extension context like the one VS Code passes to `activate`.
 *
 * @param {object} [state] - Global state from makeState(); a new one by default
 * @returns {object} Context with the members the extension reads
 */
function makeContext(state = makeState()) {
	return { extensionUri: { scheme: "file", path: "/ext" }, subscriptions: [], globalState: state };
}

/**
 * Clears recorded state between tests.
 */
function reset() {
	prompts.length = 0;
	userChoice.next = undefined;
	settings.global = {};
	settings.workspace = {};
	settings.writes.length = 0;
	errors.length = 0;
	executed.length = 0;
	tabs.open = [];
	tabs.closed = [];
	tabs.active = undefined;
	for (const key of Object.keys(handlers)) delete handlers[key];
	vscode.workspace.workspaceFolders = undefined;
	vscode.workspace.applyEditResult = true;
	vscode.window.activeTextEditor = undefined;
}

module.exports = {
	install,
	handlers,
	registration,
	errors,
	executed,
	prompts,
	userChoice,
	settings,
	tabs,
	vscode,
	makeDoc,
	makePanel,
	makeState,
	makeContext,
	openEditor,
	reset,
};
