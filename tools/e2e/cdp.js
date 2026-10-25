/**
 * A minimal Chrome DevTools Protocol client for the Electron window of a real VS Code.
 *
 * Why it exists: a webview cannot be driven from the extension host, and the typing bug lived in
 * the real page inside a real VS Code. VS Code started with `--remote-debugging-port` exposes the
 * workbench and its webviews over this protocol, which can type into the page and read it back.
 * Node ships `WebSocket` and `fetch`, so the client needs no dependency.
 *
 * Invariant: a session is one attached target. Commands on the wrong session fail quietly in the
 * protocol, so callers pick the session first (see page.js).
 */

/**
 * Connects to the browser endpoint of a VS Code started with `--remote-debugging-port`.
 *
 * @param {number} port - The debugging port
 * @param {number} [timeoutMs] - How long to wait for the endpoint to appear
 * @returns {Promise<{ send: Function, on: Function, close: Function }>} Client
 */
async function connect(port, timeoutMs = 60000) {
	const deadline = Date.now() + timeoutMs;
	let version;
	for (;;) {
		try {
			version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
			break;
		} catch (error) {
			if (Date.now() > deadline) throw new Error(`VS Code did not open debugging port ${port}: ${error.message}`, { cause: error });
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	const socket = new WebSocket(version.webSocketDebuggerUrl);
	let nextId = 0;
	const pending = new Map();
	const listeners = [];
	socket.onmessage = (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			pending.get(message.id)(message);
			pending.delete(message.id);
		} else {
			listeners.forEach((listener) => listener(message));
		}
	};
	await new Promise((resolve, reject) => {
		socket.onopen = resolve;
		socket.onerror = () => reject(new Error("The debugging socket failed to open"));
	});
	return {
		/** Sends a command, optionally to an attached session, and returns its result or throws its error. */
		send(method, params = {}, sessionId) {
			return new Promise((resolve, reject) => {
				const id = ++nextId;
				pending.set(id, (message) => (message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result)));
				socket.send(JSON.stringify({ id, method, params, sessionId }));
			});
		},
		/** Registers a listener for protocol events. */
		on: (listener) => listeners.push(listener),
		close: () => socket.close(),
	};
}

module.exports = { connect };
