/**
 * Drives the workbench and the NotionDown webview of a running VS Code through the DevTools protocol.
 *
 * Why it exists: scenarios need three things a test inside the extension host cannot do: type into
 * the page like a user, read what the page shows, and read VS Code's notifications.
 *
 * Invariants:
 * - Typing goes through `Input.insertText` on the webview's own session, so it reaches the real
 *   ProseMirror editor and fires the same events as the keyboard's text input.
 * - A webview is found by its content, never by position: earlier tabs keep their webviews.
 */
const { connect } = require("./cdp");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `check` until it returns a truthy value or the time runs out. */
async function waitFor(description, check, timeoutMs = 30000, intervalMs = 150) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await check();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
		await sleep(intervalMs);
	}
}

/**
 * Attaches to the workbench window of the VS Code on `port`.
 *
 * @param {number} port - The debugging port
 * @returns {Promise<object>} Driver for the window
 */
async function attach(port) {
	const client = await connect(port);
	const workbench = await waitFor("the workbench window", async () => {
		const { targetInfos: infos } = await client.send("Target.getTargets");
		return infos.find((info) => info.type === "page" && info.url.includes("workbench"));
	});
	const { sessionId } = await client.send("Target.attachToTarget", { targetId: workbench.targetId, flatten: true });
	const webviewSessions = new Set();
	client.on((message) => {
		if (message.method === "Target.attachedToTarget" && message.params.targetInfo.type === "iframe") webviewSessions.add(message.params.sessionId);
		if (message.method === "Target.detachedFromTarget") webviewSessions.delete(message.params.sessionId);
	});
	await client.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId);

	/** Evaluates an expression in the workbench. */
	async function inWorkbench(expression) {
		const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
		if (result.exceptionDetails) throw new Error(`Workbench script failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description || ""}`);
		return result.result.value;
	}

	const inner = "document.querySelector('iframe#active-frame').contentDocument";

	/** Evaluates an expression in one webview's inner document, or undefined when the frame is not ready. */
	async function inWebview(session, expression) {
		try {
			const result = await client.send(
				"Runtime.evaluate",
				{ expression: `(() => { const d = ${inner}; return d ? (${expression}) : undefined; })()`, returnByValue: true },
				session
			);
			return result.exceptionDetails ? undefined : result.result.value;
		} catch {
			return undefined;
		}
	}

	return {
		client,
		inWorkbench,
		sleep,
		waitFor,

		/** Waits until VS Code has finished starting and the Explorer shows the workspace. */
		ready: () => waitFor("the workbench to load", () => inWorkbench("!!document.querySelector('.monaco-workbench .part.editor')"), 60000),

		/** Titles of the open editor tabs, the active one marked with `*`. */
		tabs: () =>
			inWorkbench(
				"[...document.querySelectorAll('.tabs-container .tab')].map((tab) => tab.getAttribute('aria-label') + (tab.classList.contains('active') ? '*' : ''))"
			),

		/** True when the active editor tab shows the unsaved marker. */
		isDirty: () => inWorkbench("!!document.querySelector('.tabs-container .tab.active.dirty')"),

		/** Clicks a button in the editor title bar by its label; false when it is not shown. */
		clickTitleAction: (label) =>
			inWorkbench(
				`(() => { const a = [...document.querySelectorAll('.editor-actions .action-label')].find((x) => x.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!a) return false; a.click(); return true; })()`
			),

		/** Visible notification toasts as `{ text, buttons }`. */
		notifications: () =>
			inWorkbench(
				"[...document.querySelectorAll('.notification-toast')].map((toast) => ({ text: toast.querySelector('.notification-list-item-message')?.innerText || '', buttons: [...toast.querySelectorAll('.monaco-button')].map((b) => b.innerText.trim()) }))"
			),

		/** Clicks a button on a notification toast. */
		clickNotificationButton: (label) =>
			inWorkbench(
				`(() => { const b = [...document.querySelectorAll('.notification-toast .monaco-button')].find((x) => x.innerText.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`
			),

		/** Presses Save, as the keyboard shortcut does. */
		async save() {
			const modifiers = process.platform === "darwin" ? 4 : 2;
			for (const type of ["rawKeyDown", "keyUp"]) {
				await client.send("Input.dispatchKeyEvent", { type, modifiers, key: "s", code: "KeyS", windowsVirtualKeyCode: 83 }, sessionId);
			}
		},

		/**
		 * Finds the webview that shows `marker` and returns a handle for it.
		 *
		 * @param {string} marker - Text that only this document's page contains
		 * @returns {Promise<{ text: Function, type: Function, focusEnd: Function }>} Handle for the page
		 */
		async editor(marker) {
			const session = await waitFor(`a NotionDown page that shows "${marker}"`, async () => {
				for (const candidate of webviewSessions) {
					const text = await inWebview(candidate, "d.querySelector('.ProseMirror')?.innerText");
					if (typeof text === "string" && text.includes(marker)) return candidate;
				}
				return undefined;
			});
			return {
				/** The text the page shows. */
				text: () => inWebview(session, "d.querySelector('.ProseMirror').innerText"),
				/** Puts the cursor at the end of the document and gives the page the focus. */
				focusEnd: () =>
					inWebview(session, "(() => { const e = d.querySelector('.ProseMirror'); e.focus(); const s = d.getSelection(); s.selectAllChildren(e); s.collapseToEnd(); return d.hasFocus(); })()"),
				/** Presses Enter, which starts a new paragraph. */
				async enter() {
					for (const type of ["rawKeyDown", "keyUp"]) {
						await client.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: type === "rawKeyDown" ? "\r" : undefined }, session);
					}
				},
				/** Types text as the keyboard's text input does. */
				type: (text) => client.send("Input.insertText", { text }, session),
			};
		},

		close: () => client.close(),
	};
}

module.exports = { attach, sleep, waitFor };
