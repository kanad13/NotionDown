/**
 * NotionDown extension host.
 *
 * Why this shape: the editor is a DOM application (Milkdown Crepe), so it runs in a webview
 * that VS Code hosts as a custom text editor. The host owns the document; the page owns the
 * rendering. The only things that cross the boundary are Markdown strings, in three messages:
 * `ready` and `edit` (page to host) and `init` and `update` (host to page).
 *
 * Invariants:
 * - The host never trusts message contents beyond "is this a string".
 * - Every page gets a new random nonce, and only that nonce may run scripts.
 * - A write the page caused is never sent back to it, or the cursor would jump on each key.
 */
const crypto = require("crypto");
const vscode = require("vscode");
const template = require("./webview.html");

const VIEW_TYPE = "notionDown.editor";
const COMMAND_OPEN = "notionDown.openEditor";
const COMMAND_SET_DEFAULT = "notionDown.setAsDefault";
const COMMAND_UNSET_DEFAULT = "notionDown.unsetAsDefault";

/** The file pattern that VS Code's `workbench.editorAssociations` setting maps to an editor. */
const DEFAULT_PATTERN = "*.md";
const PROMPTED_KEY = "notionDown.defaultPrompted";

/** Upper bound for remembered writes whose echo has not arrived; a leak guard, not a tuning knob. */
const MAX_PENDING_ECHOES = 64;

/**
 * Creates a random nonce for the Content Security Policy.
 *
 * @returns {string} A base64url string from the operating system's random source
 */
function getNonce() {
	return crypto.randomBytes(16).toString("base64url");
}

/**
 * Converts CRLF line endings to LF. The page works in LF only; the host restores the
 * document's own ending when it writes, so a CRLF file does not turn into one huge diff.
 *
 * @param {string} text - Text with any line endings
 * @returns {string} Text with LF endings
 */
function normalizeEol(text) {
	return text.replace(/\r\n/g, "\n");
}

/**
 * Escapes a value for use inside a double-quoted HTML attribute.
 *
 * @param {string} value - Raw value
 * @returns {string} Escaped value
 */
function escapeAttribute(value) {
	return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Fills the page template. Every value is attribute-escaped because file names reach it.
 *
 * @param {{ nonce: string, cspSource: string, scriptUri: string, styleUri: string, baseUri: string, publicPath: string }} values - Template values
 * @returns {string} Complete HTML document
 * @throws {Error} When a placeholder has no value, so a typo fails loudly instead of shipping `{{X}}`
 */
function buildHtml(values) {
	const byPlaceholder = {
		NONCE: values.nonce,
		CSP_SOURCE: values.cspSource,
		SCRIPT_URI: values.scriptUri,
		STYLE_URI: values.styleUri,
		BASE_URI: values.baseUri,
		PUBLIC_PATH: values.publicPath,
	};
	return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
		if (byPlaceholder[key] === undefined) throw new Error(`Template value missing: ${key}`);
		return escapeAttribute(byPlaceholder[key]);
	});
}

/**
 * Makes NotionDown the default editor for Markdown files, or removes that choice.
 *
 * Why this and not `priority: "default"` in the manifest: the manifest priority takes over every
 * Markdown file the moment the extension installs, with no consent and no way back except a
 * per-file override. The association below is the user's own setting, so it shows in settings.json
 * and can be edited or deleted there.
 *
 * @param {boolean} enabled - True to set NotionDown as the default, false to remove it
 * @returns {Promise<void>} Resolves when the user setting is written
 */
async function setAsDefault(enabled) {
	const config = vscode.workspace.getConfiguration("workbench");
	// Only the user-level value is rewritten; the merged value would copy workspace entries into it.
	const inspected = config.inspect("editorAssociations");
	const associations = { ...((inspected && inspected.globalValue) || {}) };
	if (enabled) {
		associations[DEFAULT_PATTERN] = VIEW_TYPE;
	} else if (associations[DEFAULT_PATTERN] === VIEW_TYPE) {
		delete associations[DEFAULT_PATTERN];
	}
	await config.update("editorAssociations", associations, vscode.ConfigurationTarget.Global);
}

/**
 * Asks once whether NotionDown should be the default Markdown editor.
 *
 * Why once, and why on first use: asking at install time needs a startup activation for every
 * VS Code launch, and asking repeatedly is a nag. The first time the user opens NotionDown is
 * the moment they know what they are choosing.
 *
 * @param {vscode.Memento} state - Persistent store that remembers the question was asked
 * @returns {Promise<void>} Resolves after the user answers, or at once if no question is needed
 */
async function offerDefault(state) {
	if (state.get(PROMPTED_KEY)) return;
	await state.update(PROMPTED_KEY, true);
	const inspected = vscode.workspace.getConfiguration("workbench").inspect("editorAssociations");
	const current = inspected && inspected.globalValue;
	if (current && current[DEFAULT_PATTERN] === VIEW_TYPE) return;
	const choice = await vscode.window.showInformationMessage(
		"Open all Markdown files in NotionDown by default?",
		"Make default",
		"Not now"
	);
	if (choice === "Make default") await setAsDefault(true);
}

/**
 * Creates the custom editor provider.
 *
 * @param {vscode.Uri} extensionUri - Root of the installed extension
 * @param {() => void} [onOpen] - Called when an editor opens, for the one-time default-editor question
 * @returns {{ resolveCustomTextEditor: Function }} Provider for `registerCustomEditorProvider`
 */
function createProvider(extensionUri, onOpen = () => {}) {
	/**
	 * Connects one document to one webview panel.
	 *
	 * @param {vscode.TextDocument} document - The Markdown file
	 * @param {vscode.WebviewPanel} panel - Panel that VS Code created for it
	 * @returns {Promise<void>} Resolves once the page is configured
	 */
	async function resolveCustomTextEditor(document, panel) {
		onOpen();
		const webview = panel.webview;
		const distUri = vscode.Uri.joinPath(extensionUri, "dist");
		const documentFolder = vscode.Uri.joinPath(document.uri, "..");
		const workspaceRoots = (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri);
		webview.options = { enableScripts: true, localResourceRoots: [distUri, documentFolder, ...workspaceRoots] };

		// Relative image paths in the Markdown resolve against the document's folder through <base>.
		const baseFolder = document.uri.scheme === "file" ? documentFolder : distUri;
		const webviewDist = vscode.Uri.joinPath(distUri, "webview");
		webview.html = buildHtml({
			nonce: getNonce(),
			cspSource: webview.cspSource,
			scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(webviewDist, "main.js")).toString(),
			styleUri: webview.asWebviewUri(vscode.Uri.joinPath(webviewDist, "main.css")).toString(),
			baseUri: webview.asWebviewUri(baseFolder).toString() + "/",
			publicPath: webview.asWebviewUri(webviewDist).toString() + "/",
		});

		/** Texts this panel wrote that the document-change event has not yet reported. */
		const pendingEchoes = new Set();
		let writeQueue = Promise.resolve();

		/**
		 * Replaces the document text with the page's Markdown, keeping the document's line endings.
		 *
		 * @param {string} text - Markdown from the page, LF endings
		 * @returns {Promise<void>} Resolves after the edit is applied or skipped
		 */
		async function applyEdit(text) {
			const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
			const next = eol === "\n" ? text : text.replace(/\n/g, eol);
			if (next === document.getText()) return;
			const echo = normalizeEol(next);
			if (pendingEchoes.size >= MAX_PENDING_ECHOES) pendingEchoes.clear();
			pendingEchoes.add(echo);
			const edit = new vscode.WorkspaceEdit();
			edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), next);
			const applied = await vscode.workspace.applyEdit(edit);
			if (!applied) pendingEchoes.delete(echo);
		}

		const messageSubscription = webview.onDidReceiveMessage((message) => {
			if (!message || typeof message.type !== "string") return;
			if (message.type === "ready") {
				webview.postMessage({ type: "init", text: normalizeEol(document.getText()) });
			} else if (message.type === "edit" && typeof message.text === "string") {
				// Edits apply in arrival order so a slow write cannot overwrite a newer one.
				writeQueue = writeQueue.then(() => applyEdit(message.text)).catch(() => {});
				return writeQueue;
			}
		});

		const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() !== document.uri.toString()) return;
			if (event.contentChanges.length === 0) return;
			const text = normalizeEol(document.getText());
			if (pendingEchoes.delete(text)) return;
			webview.postMessage({ type: "update", text });
		});

		panel.onDidDispose(() => {
			messageSubscription.dispose();
			changeSubscription.dispose();
		});
	}

	return { resolveCustomTextEditor };
}

/**
 * Finds the Markdown file the open command should act on.
 *
 * @param {vscode.Uri | undefined} uri - File passed by a menu, if any
 * @returns {vscode.Uri | undefined} The file, or undefined when none is Markdown
 */
function pickMarkdownUri(uri) {
	if (uri && typeof uri.scheme === "string") return uri;
	const editor = vscode.window.activeTextEditor;
	return editor && editor.document.languageId === "markdown" ? editor.document.uri : undefined;
}

/**
 * Activates the extension.
 *
 * @param {vscode.ExtensionContext} context - Extension context
 */
function activate(context) {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			VIEW_TYPE,
			createProvider(context.extensionUri, () => {
				// A failed question must never break the editor that is opening.
				offerDefault(context.globalState).catch(() => {});
			}),
			{ supportsMultipleEditorsPerDocument: false }
		),
		vscode.commands.registerCommand(COMMAND_SET_DEFAULT, () => setAsDefault(true)),
		vscode.commands.registerCommand(COMMAND_UNSET_DEFAULT, () => setAsDefault(false)),
		vscode.commands.registerCommand(COMMAND_OPEN, async (uri) => {
			const target = pickMarkdownUri(uri);
			if (!target) {
				vscode.window.showErrorMessage("NotionDown: open a Markdown file first.");
				return;
			}
			await vscode.commands.executeCommand("vscode.openWith", target, VIEW_TYPE);
		})
	);
}

/**
 * Deactivates the extension. VS Code disposes the subscriptions.
 */
function deactivate() {}

module.exports = { activate, deactivate, buildHtml, getNonce, normalizeEol, VIEW_TYPE };
