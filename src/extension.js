/**
 * NotionDown extension host.
 *
 * Why this shape: the editor is a DOM application (Milkdown Crepe), so it runs in a webview
 * that VS Code hosts as a custom text editor. The host owns the document; the page owns the
 * rendering. The only things that cross the boundary are Markdown strings, in four messages:
 * `ready` and `edit` (page to host) and `init` and `update` (host to page). The host also
 * registers the commands that choose the default Markdown editor.
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
const COMMAND_USE_NOTIONDOWN = "notionDown.useAsDefault";
const COMMAND_USE_TEXT_EDITOR = "notionDown.useTextEditorAsDefault";
const COMMAND_OPEN_SOURCE = "notionDown.openSource";
const COMMAND_WALKTHROUGH = "notionDown.showWalkthrough";

/** The walkthrough that shows screenshots, as `openWalkthrough` names it: `publisher.name#id`. */
const WALKTHROUGH_ID = "KunalPathak.notiondown#notionDown.welcome";

/** The file pattern that VS Code's `workbench.editorAssociations` setting maps to an editor. */
const DEFAULT_PATTERN = "*.md";

/** The `workbench.editorAssociations` value that means VS Code's own text editor. */
const TEXT_EDITOR_VIEW_TYPE = "default";

/**
 * Global-state keys: how often the default-editor question went unanswered, and the answer once given.
 * Why state survives: VS Code keeps an extension's global state when it is uninstalled, so a
 * reinstall inherits it. Only "keep" is stored as an answer, because the user's own setting is
 * the truth after "use": if the text-editor entry comes back, the question may come back too.
 */
const ASKS_KEY = "notionDown.defaultAsks";
const ANSWER_KEY = "notionDown.defaultAnswer";

/** How many sessions may show the question before it stops on its own; a toast is easy to miss, so one is not enough. */
const MAX_UNANSWERED_ASKS = 3;

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
 * Chooses which editor opens Markdown files by default.
 *
 * Why an association and not an extension setting: the manifest makes NotionDown the default
 * (`priority: "default"`), and VS Code's own `workbench.editorAssociations` is the one place a
 * user overrides a default. A second switch inside the extension would have to fight it. This
 * writes that user setting, so the choice shows in settings.json and can be edited there.
 *
 * @param {boolean} notionDown - True to open Markdown in NotionDown, false for VS Code's text editor
 * @returns {Promise<void>} Resolves when the user setting is written
 */
async function chooseDefaultEditor(notionDown) {
	const config = vscode.workspace.getConfiguration("workbench");
	// Only the user-level value is rewritten; the merged value would copy workspace entries into it.
	const inspected = config.inspect("editorAssociations");
	const associations = { ...((inspected && inspected.globalValue) || {}) };
	if (notionDown) {
		// Dropping the entry hands the choice back to the manifest default, which is NotionDown.
		if (associations[DEFAULT_PATTERN] === TEXT_EDITOR_VIEW_TYPE || associations[DEFAULT_PATTERN] === VIEW_TYPE) {
			delete associations[DEFAULT_PATTERN];
		}
	} else {
		associations[DEFAULT_PATTERN] = TEXT_EDITOR_VIEW_TYPE;
	}
	await config.update("editorAssociations", associations, vscode.ConfigurationTarget.Global);
}

/**
 * Opens a Markdown file in one editor, in place of the tab that shows it in the other.
 *
 * Why close the old tab: `vscode.openWith` always adds a tab, so the user would see the file
 * twice and still be looking at the editor they meant to leave. The tab is closed only when it
 * is the active tab, which is the case of a click on the title-bar button; a right-click in the
 * Explorer leaves other tabs alone. The document stays open in the new editor, so closing the old
 * tab asks nothing, even when the file has unsaved edits.
 *
 * @param {vscode.Uri} target - The Markdown file
 * @param {string} viewType - The editor to open: `VIEW_TYPE` or `TEXT_EDITOR_VIEW_TYPE`
 * @returns {Promise<void>} Resolves once the file is open in the new editor
 */
async function showIn(target, viewType) {
	const group = vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup;
	const active = group && group.activeTab;
	const input = active && active.input;
	const showsFile = input && input.uri && input.uri.toString() === target.toString();
	const isLeaving = viewType === VIEW_TYPE ? input instanceof vscode.TabInputText : input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE;
	const replaced = showsFile && isLeaving ? active : undefined;
	await vscode.commands.executeCommand("vscode.openWith", target, viewType);
	if (replaced) await vscode.window.tabGroups.close(replaced);
}

/**
 * Opens a Markdown file in NotionDown in place of the text editor tab.
 *
 * @param {vscode.Uri} target - The Markdown file
 * @returns {Promise<void>} Resolves once the file is open in NotionDown
 */
function showInNotionDown(target) {
	return showIn(target, VIEW_TYPE);
}

/**
 * Opens the screenshot walkthrough, which also holds the buttons that choose the default editor.
 *
 * Why a walkthrough: a notification holds text and buttons only, and the question is easier to
 * answer after seeing the editor. VS Code's Get Started page renders images and command buttons
 * with no webview and no message of our own.
 *
 * @returns {Thenable<unknown>} Resolves when VS Code has opened the page
 */
function showWalkthrough() {
	return vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
}

/**
 * Asks whether NotionDown should replace the text editor as the Markdown default, when the
 * user's own `workbench.editorAssociations` keeps Markdown in the text editor.
 *
 * Why: the manifest makes NotionDown the default, but VS Code lets a user association win, and
 * many users have a `"*.md": "default"` entry from before. Without a question they would
 * install the extension and never see it, and the extension could not tell them, because it
 * never ran. The question appears only in that case, never when NotionDown already applies.
 *
 * Why it can repeat: a notification fades after a few seconds and a dismissed one looks the same
 * as an ignored one, so the question comes back, in up to three sessions, until a button is
 * pressed. Pressing "Keep Text Editor" ends it for good; the two commands stay available.
 * "Use NotionDown" stores nothing, because the user's setting is the record of that choice.
 * "See Screenshots" opens the walkthrough and counts as neither answer.
 *
 * Why only a user-level entry that names the text editor: a workspace entry is a project's choice,
 * and an entry for another editor is a choice this extension should not question.
 *
 * @param {vscode.Memento} state - Persistent store that remembers how often it was asked and the answer
 * @param {{ fromButton?: boolean }} [options] - `fromButton` asks even after unanswered sessions, because the user just chose to open NotionDown
 * @returns {Promise<void>} Resolves after the user answers, or at once when no question is needed
 */
async function offerDefaultEditor(state, { fromButton = false } = {}) {
	if (state.get(ANSWER_KEY) === "keep") return;
	const asks = state.get(ASKS_KEY) || 0;
	if (!fromButton && asks >= MAX_UNANSWERED_ASKS) return;
	const inspected = vscode.workspace.getConfiguration("workbench").inspect("editorAssociations");
	if (!inspected) return;
	const entryOf = (value) => (value && typeof value === "object" ? value[DEFAULT_PATTERN] : undefined);
	if (entryOf(inspected.globalValue) !== TEXT_EDITOR_VIEW_TYPE) return;
	if (entryOf(inspected.workspaceValue) !== undefined || entryOf(inspected.workspaceFolderValue) !== undefined) return;
	await state.update(ASKS_KEY, asks + 1);
	const choice = await vscode.window.showInformationMessage(
		"NotionDown is installed, but your editor associations open Markdown files in VS Code's text editor. Open them in NotionDown instead?",
		"Use NotionDown",
		"See Screenshots",
		"Keep Text Editor"
	);
	// Looking is not answering: the walkthrough has the buttons, and the question may return next session.
	if (choice === "See Screenshots") await showWalkthrough();
	if (choice === "Keep Text Editor") await state.update(ANSWER_KEY, "keep");
	if (choice !== "Use NotionDown") return;
	await chooseDefaultEditor(true);
	// The file that is open now stays in the text editor until it is reopened.
	const target = pickMarkdownUri();
	if (target) await showInNotionDown(target);
}

/**
 * Creates the custom editor provider.
 *
 * @param {vscode.Uri} extensionUri - Root of the installed extension
 * @returns {{ resolveCustomTextEditor: Function }} Provider for `registerCustomEditorProvider`
 */
function createProvider(extensionUri) {
	/**
	 * Connects one document to one webview panel.
	 *
	 * @param {vscode.TextDocument} document - The Markdown file
	 * @param {vscode.WebviewPanel} panel - Panel that VS Code created for it
	 * @returns {Promise<void>} Resolves once the page is configured
	 */
	async function resolveCustomTextEditor(document, panel) {
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
		/** How many of the page's edits this host has applied, as the page counted them; sent with every update. */
		let appliedEdits = 0;

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
				writeQueue = writeQueue
					.then(() => applyEdit(message.text))
					.then(() => message.save === true && !document.isUntitled && document.isDirty && document.save())
					.catch(() => {})
					.then(() => {
						if (Number.isSafeInteger(message.count)) appliedEdits = message.count;
					});
				return writeQueue;
			}
		});

		const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() !== document.uri.toString()) return;
			if (event.contentChanges.length === 0) return;
			const text = normalizeEol(document.getText());
			if (pendingEchoes.delete(text)) return;
			webview.postMessage({ type: "update", text, applied: appliedEdits });
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
	if (editor && editor.document.languageId === "markdown") return editor.document.uri;
	// A custom editor is not a text editor, so its file is found through the active tab.
	const group = vscode.window.tabGroups && vscode.window.tabGroups.activeTabGroup;
	const input = group && group.activeTab && group.activeTab.input;
	return input instanceof vscode.TabInputCustom && input.viewType === VIEW_TYPE ? input.uri : undefined;
}

/**
 * Activates the extension.
 *
 * @param {vscode.ExtensionContext} context - Extension context
 */
function activate(context) {
	// A failed question must never break the extension.
	offerDefaultEditor(context.globalState).catch(() => {});
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(VIEW_TYPE, createProvider(context.extensionUri), {
			supportsMultipleEditorsPerDocument: false,
		}),
		vscode.commands.registerCommand(COMMAND_USE_NOTIONDOWN, () => chooseDefaultEditor(true)),
		vscode.commands.registerCommand(COMMAND_USE_TEXT_EDITOR, () => chooseDefaultEditor(false)),
		vscode.commands.registerCommand(COMMAND_WALKTHROUGH, showWalkthrough),
		vscode.commands.registerCommand(COMMAND_OPEN_SOURCE, async (uri) => {
			const target = pickMarkdownUri(uri);
			if (!target) {
				vscode.window.showErrorMessage("NotionDown: open a Markdown file first.");
				return;
			}
			await showIn(target, TEXT_EDITOR_VIEW_TYPE);
		}),
		vscode.commands.registerCommand(COMMAND_OPEN, async (uri) => {
			const target = pickMarkdownUri(uri);
			if (!target) {
				vscode.window.showErrorMessage("NotionDown: open a Markdown file first.");
				return;
			}
			await showInNotionDown(target);
			// Choosing NotionDown by hand is the moment to ask about making it the default.
			offerDefaultEditor(context.globalState, { fromButton: true }).catch(() => {});
		})
	);
}

/**
 * Deactivates the extension. VS Code disposes the subscriptions.
 */
function deactivate() {}

module.exports = { activate, deactivate, buildHtml, getNonce, normalizeEol, VIEW_TYPE };
