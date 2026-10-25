/**
 * The page's side of the sync with the host: when to send the user's edits, and what to do when
 * the host reports that the file changed.
 *
 * Why it is its own module: the rules below decide whether typed text survives. They used to sit
 * in the page script, where only a real browser could run them. Here they take the editor as a
 * set of functions, so Node tests run them against the real Crepe editor and a model of VS Code's
 * save pipeline.
 *
 * Invariants:
 * - `hostText` is the file text the host holds, as far as the page knows. The page sends text only
 *   when it differs from `hostText`.
 * - A host update replaces the editor's content only when it carries content the editor lacks. An
 *   update that differs in formatting alone (a formatter, trimmed whitespace, a final newline)
 *   changes `hostText` and nothing else, so the user's cursor, unsent typing, and the space they
 *   just typed stay. The next send compares blocks by what they say (see markdown-sync.js), so the
 *   editor's own style marks do not make a block look edited and the file is not changed again.
 * - An update the host made before it saw the page's latest edit is stale, because that edit is on
 *   its way to overwrite it. The edit counter in `edit` and `update` messages detects this.
 * - Plain CommonJS, like markdown-sync.js, so the page and the tests share one implementation.
 */
const { reconcileMarkdown, sameContent, splitFrontMatter } = require("./markdown-sync");

/** Milliseconds to wait after the last keystroke before sending the text to the host. */
const SEND_DELAY_MS = 200;

/** Upper bound for the adaptive delay, so a huge file still saves within a couple of seconds. */
const MAX_SEND_DELAY_MS = 2000;

/**
 * Creates the page's sync state machine.
 *
 * @param {object} deps - The editor and the environment, as functions
 * @param {(message: object) => void} deps.post - Sends a message to the host
 * @param {() => string} deps.getMarkdown - The editor's current serialization
 * @param {(use: (tools: object) => any) => any} deps.withTools - Runs `use` with the parser access that markdown-sync needs
 * @param {(body: string) => void} deps.replaceEditor - Replaces the editor content with Markdown (no front matter)
 * @param {{ sendDelayMs?: number, maxSendDelayMs?: number, now?: () => number, setTimer?: Function, clearTimer?: Function }} [options] - Timing, replaceable in tests
 * @returns {{ start: Function, onEditorChange: Function, flush: Function, onHostUpdate: Function, dispose: Function, warmUp: Function, text: Function }} Operations for the page script
 */
function createPageSync(deps, options = {}) {
	const baseDelay = options.sendDelayMs ?? SEND_DELAY_MS;
	const maxDelay = options.maxSendDelayMs ?? MAX_SEND_DELAY_MS;
	const now = options.now || (() => globalThis.performance.now());
	const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
	const clearTimer = options.clearTimer || ((id) => clearTimeout(id));

	let hostText = "";
	let sendTimer;
	let sendDelay = baseDelay;
	let sentCount = 0;
	let disposed = false;

	/**
	 * Builds the file text for the editor's current content.
	 *
	 * @returns {string} File text in which blocks the user did not edit keep their original text
	 */
	function currentText() {
		const { front, body } = splitFrontMatter(hostText);
		const edited = deps.getMarkdown();
		return front + deps.withTools((tools) => reconcileMarkdown(body, edited, tools));
	}

	/**
	 * Sends the current Markdown to the host if the user changed it.
	 *
	 * The work grows with the file, so the delay before the next send grows with how long this one
	 * took: typing in a very large file never spends more than about a fifth of its time here.
	 */
	function flush() {
		if (disposed) return;
		clearTimer(sendTimer);
		sendTimer = undefined;
		const started = now();
		const text = currentText();
		sendDelay = Math.min(maxDelay, Math.max(baseDelay, (now() - started) * 4));
		if (text === hostText) return;
		hostText = text;
		sentCount++;
		deps.post({ type: "edit", text, count: sentCount });
	}

	return {
		/**
		 * Records the text the editor was created from.
		 *
		 * @param {string} text - File text from the host
		 */
		start(text) {
			hostText = text;
			sentCount = 0;
		},

		/** Schedules a send after a pause in typing. Call on every editor change. */
		onEditorChange() {
			clearTimer(sendTimer);
			sendTimer = setTimer(flush, sendDelay);
		},

		flush,

		/**
		 * Handles the host's report that the file changed.
		 *
		 * @param {string} text - File text now
		 * @param {number} [applied] - How many of the page's edits the host had applied when the file changed
		 */
		onHostUpdate(text, applied) {
			// The host has not seen our newest edit. That edit will overwrite this change, so applying it would only undo what the user just typed.
			if (typeof applied === "number" && applied < sentCount) return;
			if (text === hostText) return;
			if (deps.withTools((tools) => sameContent(hostText, text, tools))) {
				hostText = text;
				return;
			}
			clearTimer(sendTimer);
			sendTimer = undefined;
			hostText = text;
			deps.replaceEditor(splitFrontMatter(text).body);
		},

		/** Stops the pending send, so a closed editor is never read. */
		dispose() {
			disposed = true;
			clearTimer(sendTimer);
			sendTimer = undefined;
		},

		/** Computes the first comparison while the user reads, so the first keystroke does not stall on a large file. */
		warmUp() {
			currentText();
		},

		/** @returns {string} The file text for the editor's current content */
		text: currentText,
	};
}

module.exports = { createPageSync, SEND_DELAY_MS, MAX_SEND_DELAY_MS };
