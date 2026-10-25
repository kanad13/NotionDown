/**
 * Runs the real host, the real page logic, and the real Crepe editor together, with a model of
 * VS Code's autosave in between and a delay on every message.
 *
 * Why it exists: the typing bug lived between three parts that each passed their own tests. The
 * host skipped the page's own writes, the page replaced its content on any other change, and
 * VS Code changed the file after saving. Only the three together, with timing, can show it.
 *
 * Invariants:
 * - Delays are real timers, kept to a few milliseconds, so a session lasts well under a second.
 * - `naive: true` swaps in the page's old rule (replace the editor on every update), so a test can
 *   show that this harness does catch the bug it was built for.
 */
const { handlers, install, makeDoc, openEditor, reset, vscode } = require("./fake-vscode");

install();
const { activate } = require("../../src/extension");
const { createPageSync } = require("../../src/page-sync");
const { open } = require("./crepe-dom");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits until a condition holds, for as long as a slow machine needs.
 *
 * Why: a fixed pause passes on a fast laptop and fails on a loaded CI runner, so the tests wait for
 * the outcome they check and fail only when it never arrives.
 *
 * @param {() => boolean} condition - Checked every few milliseconds
 * @param {number} [timeoutMs] - Longest wait
 * @returns {Promise<boolean>} True when the condition held before the timeout
 */
async function until(condition, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (condition()) return true;
		await sleep(10);
	}
	return condition();
}

/**
 * Opens a document with a page, a host, and a save pipeline.
 *
 * @param {object} options - Session options
 * @param {string} options.text - File text on disk
 * @param {{ autoSaveDelayMs?: number, participants: Function[] }} [options.setup] - From vscode-setups.js
 * @param {number} [options.latencyMs] - One-way message delay between the page and the host
 * @param {number} [options.sendDelayMs] - The page's pause after the last keystroke before it sends
 * @param {boolean} [options.naive] - Use the old update rule
 * @returns {Promise<object>} The session: `type`, `settle`, `doc`, `page`, `sync`, `replaced`, `stop`
 */
async function startSession({ text, setup = { participants: [] }, latencyMs = 3, sendDelayMs = 10, naive = false }) {
	reset();
	const doc = makeDoc("/work/note.md", text);
	const panel = await openEditor(activate, doc);
	const page = await open(text);

	let replaced = 0;
	let stopped = false;
	const sync = createPageSync(
		{
			post: (message) => setTimeout(() => !stopped && panel.receive(message), latencyMs),
			getMarkdown: page.serialize,
			withTools: page.withTools,
			replaceEditor: (body) => {
				replaced++;
				page.replaceBody(body);
			},
		},
		{ sendDelayMs }
	);
	sync.start(text);

	panel.webview.postMessage = async (message) => {
		panel.posted.push(message);
		setTimeout(() => {
			if (stopped || message.type !== "update") return;
			if (naive) page.replaceBody(message.text);
			else sync.onHostUpdate(message.text, message.applied);
		}, latencyMs);
		return true;
	};

	// VS Code saves some time after the last change and runs its save participants on the text.
	let saveTimer;
	const applyEdit = vscode.workspace.applyEdit;
	vscode.workspace.applyEdit = async (edit) => {
		const result = await applyEdit(edit);
		if (setup.autoSaveDelayMs !== undefined) {
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				const next = setup.participants.reduce((current, participant) => participant(current), doc.getText());
				if (next === doc.getText()) return;
				doc.setText(next);
				handlers.docChange({ document: doc, contentChanges: [{ text: next }] });
			}, setup.autoSaveDelayMs);
		}
		return result;
	};

	return {
		doc,
		page,
		sync,
		panel,
		/** Types at the end of the document and tells the page, as the editor's change listener does. */
		type(typed) {
			page.typeAtEnd(typed);
			sync.onEditorChange();
		},
		/** Waits long enough for sends, writes, autosave, and the resulting updates to finish. */
		settle: () => sleep(setup.autoSaveDelayMs === undefined ? 80 : setup.autoSaveDelayMs * 4 + 80),
		sleep,
		/** How many times the editor content was replaced from the host. */
		get replaced() {
			return replaced;
		},
		stop() {
			stopped = true;
			clearTimeout(saveTimer);
			vscode.workspace.applyEdit = applyEdit;
			page.destroy();
		},
	};
}

module.exports = { startSession, sleep, until };
