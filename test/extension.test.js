const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { install, handlers, registration, errors, executed, vscode, makeDoc, openEditor, reset } = require("./helpers/fake-vscode");

install();
const { activate, buildHtml, getNonce, normalizeEol, VIEW_TYPE } = require("../src/extension");

describe("pure helpers", () => {
	it("generates a distinct base64url nonce on every call", () => {
		const nonces = new Set(Array.from({ length: 50 }, getNonce));
		assert.equal(nonces.size, 50);
		for (const nonce of nonces) assert.match(nonce, /^[A-Za-z0-9_-]{22,}$/);
	});

	it("normalizes CRLF to LF", () => {
		assert.equal(normalizeEol("a\r\nb\nc"), "a\nb\nc");
	});

	it("builds a page with a nonce-only script policy and no unreplaced placeholders", () => {
		const html = buildHtml({
			nonce: "N0NCE",
			cspSource: "csp-src",
			scriptUri: "webview:/ext/dist/webview/main.js",
			styleUri: "webview:/ext/dist/webview/main.css",
			baseUri: "webview:/docs/",
			publicPath: "webview:/ext/dist/webview/",
		});
		assert.ok(html.startsWith("<!DOCTYPE html>"));
		assert.ok(html.includes("script-src 'nonce-N0NCE'"));
		assert.ok(html.includes('<script nonce="N0NCE" src="webview:/ext/dist/webview/main.js"'));
		assert.ok(!html.includes("unsafe-eval"));
		assert.ok(!/\{\{[A-Z_]+\}\}/.test(html));
	});

	it("escapes attribute values so a hostile file name cannot break out of the page", () => {
		const html = buildHtml({
			nonce: "n",
			cspSource: "c",
			scriptUri: "s",
			styleUri: "t",
			baseUri: 'webview:/docs/"><script>alert(1)</script>/',
			publicPath: "p",
		});
		assert.ok(!html.includes("<script>alert(1)"));
		assert.ok(html.includes("&quot;&gt;&lt;script&gt;"));
	});

	it("rejects a template value that has no placeholder", () => {
		assert.throws(() => buildHtml({ nonce: "n" }), /missing/i);
	});
});

describe("custom editor", () => {
	beforeEach(reset);

	it("registers the provider for the view type declared in the manifest", () => {
		activate({ extensionUri: { path: "/ext" }, subscriptions: [] });
		assert.equal(registration.viewType, VIEW_TYPE);
		assert.equal(VIEW_TYPE, require("../package.json").contributes.customEditors[0].viewType);
	});

	it("enables scripts and limits local resources to dist, the document folder, and workspace folders", async () => {
		vscode.workspace.workspaceFolders = [{ uri: { scheme: "file", path: "/work" } }];
		const panel = await openEditor(activate, makeDoc("/docs/guide.md", "# Hi"));
		assert.equal(panel.webview.options.enableScripts, true);
		const roots = panel.webview.options.localResourceRoots.map((u) => u.path);
		assert.deepEqual(roots, ["/ext/dist", "/docs", "/work"]);
	});

	it("generates a fresh nonce for every editor", async () => {
		const a = await openEditor(activate, makeDoc("/a.md", ""));
		const b = await openEditor(activate, makeDoc("/b.md", ""));
		const nonce = (p) => /script-src 'nonce-([^']+)'/.exec(p.webview.html)[1];
		assert.notEqual(nonce(a), nonce(b));
	});

	it("sends the document text, with LF endings, when the page reports ready", async () => {
		const panel = await openEditor(activate, makeDoc("/a.md", "one\r\ntwo", { eol: 2 }));
		assert.deepEqual(panel.posted, []);
		panel.receive({ type: "ready" });
		assert.deepEqual(panel.posted, [{ type: "init", text: "one\ntwo" }]);
	});

	it("writes an edit from the page into the document", async () => {
		const doc = makeDoc("/a.md", "old");
		const panel = await openEditor(activate, doc);
		await panel.receive({ type: "edit", text: "new" });
		assert.equal(doc.getText(), "new");
	});

	it("keeps CRLF line endings in a CRLF document", async () => {
		const doc = makeDoc("/a.md", "a\r\nb", { eol: 2 });
		const panel = await openEditor(activate, doc);
		await panel.receive({ type: "edit", text: "a\nb\nc" });
		assert.equal(doc.getText(), "a\r\nb\r\nc");
	});

	it("does not touch the document when the edit equals its text", async () => {
		const doc = makeDoc("/a.md", "same");
		const panel = await openEditor(activate, doc);
		let applied = 0;
		const original = vscode.workspace.applyEdit;
		vscode.workspace.applyEdit = async (edit) => (applied++, original(edit));
		await panel.receive({ type: "edit", text: "same" });
		vscode.workspace.applyEdit = original;
		assert.equal(applied, 0);
	});

	it("does not echo the page's own edit back to the page", async () => {
		const panel = await openEditor(activate, makeDoc("/a.md", "old"));
		await panel.receive({ type: "edit", text: "new" });
		assert.deepEqual(panel.posted, []);
	});

	it("does not echo any of several quick edits, then still forwards an external change to a repeated text", async () => {
		const doc = makeDoc("/a.md", "0");
		const panel = await openEditor(activate, doc);
		await Promise.all([panel.receive({ type: "edit", text: "A" }), panel.receive({ type: "edit", text: "B" })]);
		assert.deepEqual(panel.posted, []);
		doc.setText("X");
		handlers.docChange({ document: doc, contentChanges: [{ text: "X" }] });
		doc.setText("A");
		handlers.docChange({ document: doc, contentChanges: [{ text: "A" }] });
		assert.deepEqual(panel.posted, [
			{ type: "update", text: "X" },
			{ type: "update", text: "A" },
		]);
	});

	it("forwards an external change (another editor, undo, git checkout) to the page", async () => {
		const doc = makeDoc("/a.md", "old");
		const panel = await openEditor(activate, doc);
		doc.setText("changed\r\nelsewhere");
		handlers.docChange({ document: doc, contentChanges: [{ text: "x" }] });
		assert.deepEqual(panel.posted, [{ type: "update", text: "changed\nelsewhere" }]);
	});

	it("ignores changes to other documents and dirty-state events", async () => {
		const doc = makeDoc("/a.md", "old");
		const panel = await openEditor(activate, doc);
		handlers.docChange({ document: makeDoc("/other.md", "x"), contentChanges: [{ text: "x" }] });
		handlers.docChange({ document: doc, contentChanges: [] });
		assert.deepEqual(panel.posted, []);
	});

	it("stops listening after the panel closes", async () => {
		const panel = await openEditor(activate, makeDoc("/a.md", "old"));
		panel.dispose();
		assert.equal(handlers.docChange, undefined);
		assert.equal(panel.receive({ type: "ready" }), undefined);
	});

	it("allows a later write after a rejected one", async () => {
		const doc = makeDoc("/a.md", "old");
		const panel = await openEditor(activate, doc);
		vscode.workspace.applyEditResult = false;
		await panel.receive({ type: "edit", text: "lost" });
		vscode.workspace.applyEditResult = true;
		await panel.receive({ type: "edit", text: "kept" });
		assert.equal(doc.getText(), "kept");
	});

	it("ignores malformed messages", async () => {
		const doc = makeDoc("/a.md", "old");
		const panel = await openEditor(activate, doc);
		await panel.receive(undefined);
		await panel.receive({ type: "edit", text: 42 });
		await panel.receive({ type: "unknown" });
		assert.equal(doc.getText(), "old");
		assert.deepEqual(panel.posted, []);
	});
});

describe("open command", () => {
	beforeEach(reset);

	it("opens the given Markdown file in the editor", async () => {
		activate({ extensionUri: { path: "/ext" }, subscriptions: [] });
		const doc = makeDoc("/a.md", "x");
		await handlers["command:notionDown.openEditor"](doc.uri);
		assert.deepEqual(executed, [["vscode.openWith", doc.uri, VIEW_TYPE]]);
	});

	it("falls back to the active Markdown editor", async () => {
		activate({ extensionUri: { path: "/ext" }, subscriptions: [] });
		const doc = makeDoc("/a.md", "x");
		vscode.window.activeTextEditor = { document: doc };
		await handlers["command:notionDown.openEditor"]();
		assert.equal(executed[0][1], doc.uri);
	});

	it("reports an error when there is no Markdown file", async () => {
		activate({ extensionUri: { path: "/ext" }, subscriptions: [] });
		vscode.window.activeTextEditor = { document: makeDoc("/a.txt", "x", { languageId: "plaintext" }) };
		await handlers["command:notionDown.openEditor"]();
		assert.equal(executed.length, 0);
		assert.equal(errors.length, 1);
	});
});
