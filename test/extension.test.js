/**
 * Tests the extension host against the fake `vscode` module: page generation, the message
 * protocol, document writes, line endings, echo suppression, disposal, and the default-editor commands.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
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
	makeContext,
	makeState,
	openEditor,
	reset,
} = require("./helpers/fake-vscode");

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
		activate(makeContext());
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

	it("saves again after applying an edit that came from a Save, and only then", async () => {
		const doc = makeDoc("/a.md", "old");
		let saves = 0;
		doc.save = async () => (saves++, true);
		const panel = await openEditor(activate, doc);
		await panel.receive({ type: "edit", text: "new" });
		assert.equal(saves, 0, "an ordinary edit started a save");
		await panel.receive({ type: "edit", text: "newer", save: true });
		assert.equal(saves, 1);
		assert.equal(doc.getText(), "newer");
	});

	it("does not save a clean document, an untitled one, or on a save flag that is not true", async () => {
		const doc = makeDoc("/a.md", "old");
		let saves = 0;
		doc.save = async () => (saves++, true);
		const panel = await openEditor(activate, doc);
		await panel.receive({ type: "edit", text: "old", save: true });
		doc.isDirty = false;
		await panel.receive({ type: "edit", text: "old", save: true });
		assert.equal(saves, 0, "a clean document was saved");
		doc.isUntitled = true;
		await panel.receive({ type: "edit", text: "other", save: true });
		await panel.receive({ type: "edit", text: "another", save: "yes" });
		assert.equal(saves, 0);
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
			{ type: "update", text: "X", applied: 0 },
			{ type: "update", text: "A", applied: 0 },
		]);
	});

	it("tells the page how many of its edits it had applied when the file changed", async () => {
		const doc = makeDoc("/a.md", "0");
		const panel = await openEditor(activate, doc);
		await panel.receive({ type: "edit", text: "A", count: 1 });
		await panel.receive({ type: "edit", text: "B", count: 2 });
		doc.setText("B formatted");
		handlers.docChange({ document: doc, contentChanges: [{ text: "x" }] });
		assert.deepEqual(panel.posted, [{ type: "update", text: "B formatted", applied: 2 }]);
	});

	it("counts an edit as applied only after its write finished, so a change that lands first reads as stale", async () => {
		const doc = makeDoc("/a.md", "0");
		const panel = await openEditor(activate, doc);
		const write = panel.receive({ type: "edit", text: "A", count: 1 });
		// A formatter's change event reaches the host before the write's promise settles.
		doc.setText("formatted");
		handlers.docChange({ document: doc, contentChanges: [{ text: "x" }] });
		await write;
		assert.deepEqual(panel.posted, [{ type: "update", text: "formatted", applied: 0 }]);
	});

	it("keeps counting edits the document already holds, and ignores a count that is not an integer", async () => {
		const doc = makeDoc("/a.md", "same");
		const panel = await openEditor(activate, doc);
		await panel.receive({ type: "edit", text: "same", count: 1 });
		await panel.receive({ type: "edit", text: "other", count: "2" });
		doc.setText("elsewhere");
		handlers.docChange({ document: doc, contentChanges: [{ text: "x" }] });
		assert.equal(panel.posted[0].applied, 1);
	});

	it("forwards an external change (another editor, undo, git checkout) to the page", async () => {
		const doc = makeDoc("/a.md", "old");
		const panel = await openEditor(activate, doc);
		doc.setText("changed\r\nelsewhere");
		handlers.docChange({ document: doc, contentChanges: [{ text: "x" }] });
		assert.deepEqual(panel.posted, [{ type: "update", text: "changed\nelsewhere", applied: 0 }]);
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
		activate(makeContext());
		const doc = makeDoc("/a.md", "x");
		await handlers["command:notionDown.openEditor"](doc.uri);
		assert.deepEqual(executed, [["vscode.openWith", doc.uri, VIEW_TYPE]]);
	});

	it("falls back to the active Markdown editor", async () => {
		activate(makeContext());
		const doc = makeDoc("/a.md", "x");
		vscode.window.activeTextEditor = { document: doc };
		await handlers["command:notionDown.openEditor"]();
		assert.equal(executed[0][1], doc.uri);
	});

	it("reports an error when there is no Markdown file", async () => {
		activate(makeContext());
		vscode.window.activeTextEditor = { document: makeDoc("/a.txt", "x", { languageId: "plaintext" }) };
		await handlers["command:notionDown.openEditor"]();
		assert.equal(executed.length, 0);
		assert.equal(errors.length, 1);
	});
});

describe("open command, tabs", () => {
	beforeEach(reset);

	const textTab = (doc) => ({ input: new vscode.TabInputText(doc.uri) });

	it("replaces the text editor tab that is showing the file", async () => {
		activate(makeContext());
		const doc = makeDoc("/a.md", "x");
		const tab = textTab(doc);
		tabs.open = [tab];
		tabs.active = tab;
		await handlers["command:notionDown.openEditor"](doc.uri);
		assert.deepEqual(tabs.closed, [tab]);
		assert.deepEqual(executed, [["vscode.openWith", doc.uri, VIEW_TYPE]]);
	});

	it("leaves other tabs alone when the file is opened from the Explorer", async () => {
		activate(makeContext());
		const doc = makeDoc("/a.md", "x");
		const other = textTab(makeDoc("/b.md", "y"));
		const background = textTab(doc);
		tabs.open = [other, background];
		tabs.active = other;
		await handlers["command:notionDown.openEditor"](doc.uri);
		assert.deepEqual(tabs.closed, []);
	});
});

describe("default editor", () => {
	beforeEach(reset);

	const association = (value) => ({ "*.md": value });
	const start = () => activate(makeContext());

	it("is the manifest default for Markdown, so it applies as soon as the extension installs", () => {
		const editor = require("../package.json").contributes.customEditors[0];
		assert.equal(editor.priority, "default");
		assert.deepEqual(editor.selector, [{ filenamePattern: "*.md" }]);
	});

	it("activates when a Markdown file opens, so it can speak up even when the text editor shows it", () => {
		assert.ok(require("../package.json").activationEvents.includes("onLanguage:markdown"));
	});

	describe("the question about replacing a text-editor association", () => {
		const later = () => new Promise((resolve) => setTimeout(resolve, 0));
		const ask = async (state = makeState()) => {
			activate(makeContext(state));
			await later();
			return state;
		};

		it("is asked once when the user's own setting keeps Markdown in the text editor", async () => {
			settings.global.editorAssociations = association("default");
			await ask();
			assert.equal(prompts.length, 1);
			assert.deepEqual(prompts[0].buttons, ["Use NotionDown", "See Screenshots", "Keep Text Editor"]);
		});

		it("removes the entry and opens the current Markdown file in NotionDown when the user agrees", async () => {
			settings.global.editorAssociations = { "*.png": "imagePreview.previewEditor", ...association("default") };
			const doc = makeDoc("/a.md", "x");
			vscode.window.activeTextEditor = { document: doc };
			userChoice.next = "Use NotionDown";
			await ask();
			assert.deepEqual(settings.global.editorAssociations, { "*.png": "imagePreview.previewEditor" });
			assert.deepEqual(executed, [["vscode.openWith", doc.uri, VIEW_TYPE]]);
		});

		it("asks again after yes when the text-editor entry has come back, for example on a reinstall", async () => {
			settings.global.editorAssociations = association("default");
			userChoice.next = "Use NotionDown";
			const state = await ask();
			assert.deepEqual(settings.global.editorAssociations, {});
			settings.global.editorAssociations = association("default");
			userChoice.next = undefined;
			await ask(state);
			assert.equal(prompts.length, 2);
		});

		it("opens the screenshot walkthrough on request, changes nothing, and asks again next session", async () => {
			settings.global.editorAssociations = association("default");
			userChoice.next = "See Screenshots";
			const state = await ask();
			assert.deepEqual(executed, [["workbench.action.openWalkthrough", "KunalPathak.notiondown#notionDown.welcome", false]]);
			assert.deepEqual(settings.writes, []);
			userChoice.next = undefined;
			await ask(state);
			assert.equal(prompts.length, 2);
		});

		it("changes nothing when the user keeps the text editor, and never asks again", async () => {
			settings.global.editorAssociations = association("default");
			userChoice.next = "Keep Text Editor";
			const state = await ask();
			await ask(state);
			assert.equal(prompts.length, 1);
			assert.deepEqual(settings.global.editorAssociations, association("default"));
		});

		it("comes back in the next sessions when the toast was ignored, and then stops", async () => {
			settings.global.editorAssociations = association("default");
			const state = makeState();
			for (let session = 0; session < 5; session++) await ask(state);
			assert.equal(prompts.length, 3);
			assert.deepEqual(settings.writes, []);
		});

		it("asks again when the user clicks the rocket, unless they already answered", async () => {
			settings.global.editorAssociations = association("default");
			const state = makeState();
			for (let session = 0; session < 4; session++) await ask(state);
			const doc = makeDoc("/a.md", "x");
			await handlers["command:notionDown.openEditor"](doc.uri);
			await later();
			assert.equal(prompts.length, 4);
			userChoice.next = "Keep Text Editor";
			await handlers["command:notionDown.openEditor"](doc.uri);
			await later();
			await handlers["command:notionDown.openEditor"](doc.uri);
			await later();
			assert.equal(prompts.length, 5);
		});

		it("stays quiet when nothing overrides the manifest default", async () => {
			await ask();
			settings.global.editorAssociations = { "*.png": "imagePreview.previewEditor" };
			await ask();
			assert.equal(prompts.length, 0);
		});

		it("stays quiet when the association already names NotionDown or another editor", async () => {
			settings.global.editorAssociations = association(VIEW_TYPE);
			await ask();
			settings.global.editorAssociations = association("vscode.markdown.preview.editor");
			await ask();
			assert.equal(prompts.length, 0);
		});

		it("stays quiet when a workspace sets the association, because that is the project's choice", async () => {
			settings.global.editorAssociations = association("default");
			settings.workspace.editorAssociations = association("default");
			await ask();
			assert.equal(prompts.length, 0);
		});

		it("does not break the extension when the question fails", async () => {
			settings.global.editorAssociations = association("default");
			const original = vscode.window.showInformationMessage;
			vscode.window.showInformationMessage = async () => {
				throw new Error("no window");
			};
			try {
				await ask();
			} finally {
				vscode.window.showInformationMessage = original;
			}
			assert.equal(typeof handlers["command:notionDown.openEditor"], "function");
		});
	});

	it("never asks the user a question when an editor opens", async () => {
		await openEditor(activate, makeDoc("/a.md", ""));
		assert.equal(prompts.length, 0);
	});

	it("switches to the text editor by writing the user setting, keeping other entries", async () => {
		settings.global.editorAssociations = { "*.png": "imagePreview.previewEditor" };
		start();
		await handlers["command:notionDown.useTextEditorAsDefault"]();
		assert.deepEqual(settings.global.editorAssociations, { "*.png": "imagePreview.previewEditor", ...association("default") });
		assert.equal(settings.writes[0].target, vscode.ConfigurationTarget.Global);
	});

	it("switches back by removing the text-editor entry, which restores the manifest default", async () => {
		settings.global.editorAssociations = { "*.png": "imagePreview.previewEditor", ...association("default") };
		start();
		await handlers["command:notionDown.useAsDefault"]();
		assert.deepEqual(settings.global.editorAssociations, { "*.png": "imagePreview.previewEditor" });
	});

	it("does not remove a *.md association that belongs to another editor", async () => {
		settings.global.editorAssociations = association("some.other.editor");
		start();
		await handlers["command:notionDown.useAsDefault"]();
		assert.deepEqual(settings.global.editorAssociations, association("some.other.editor"));
	});

	it("ignores workspace-level associations when it writes the user setting", async () => {
		settings.workspace.editorAssociations = { "*.txt": "workspace.only" };
		start();
		await handlers["command:notionDown.useTextEditorAsDefault"]();
		assert.deepEqual(settings.global.editorAssociations, association("default"));
	});

	it("uses a built-in codicon for the title-bar button, so the package ships no icon files for it", () => {
		const command = require("../package.json").contributes.commands.find((c) => c.command === "notionDown.openEditor");
		assert.equal(command.icon, "$(rocket-compact)");
	});

	it("declares both commands in the manifest", () => {
		const ids = require("../package.json").contributes.commands.map((c) => c.command);
		assert.ok(ids.includes("notionDown.useAsDefault") && ids.includes("notionDown.useTextEditorAsDefault"));
	});
});

describe("screenshot walkthrough", () => {
	beforeEach(reset);
	const manifest = require("../package.json");
	const walkthrough = manifest.contributes.walkthroughs.find((w) => w.id === "notionDown.welcome");
	const declared = manifest.contributes.commands.map((c) => c.command);

	it("opens from a command", async () => {
		activate(makeContext());
		await handlers["command:notionDown.showWalkthrough"]();
		assert.deepEqual(executed, [["workbench.action.openWalkthrough", "KunalPathak.notiondown#notionDown.welcome", false]]);
	});

	it("shows a screenshot in a light and a dark theme at every step that has one, each with a described alt text", () => {
		const shown = walkthrough.steps.filter((step) => step.media);
		assert.ok(shown.length >= 3);
		for (const { media } of shown) {
			assert.ok(media.altText.length >= 10);
			for (const key of ["dark", "light", "hc", "hcLight"]) {
				assert.ok(fs.existsSync(path.join(__dirname, "..", media.image[key])), `${media.image[key]} is missing`);
			}
		}
	});

	it("links only to commands the manifest declares, and lets the user choose the default editor in its last step", () => {
		const linked = walkthrough.steps.flatMap((step) => [...step.description.matchAll(/\(command:([\w.]+)\)/g)].map((m) => m[1]));
		for (const id of linked) assert.ok(declared.includes(id), `${id} is not declared`);
		assert.ok(linked.includes("notionDown.useAsDefault") && linked.includes("notionDown.useTextEditorAsDefault"));
	});

	it("packs the images it shows", () => {
		const ignore = fs.readFileSync(path.join(__dirname, "..", ".vscodeignore"), "utf8");
		assert.ok(!/^assets\/screenshots\/?$/m.test(ignore));
	});
});

describe("source command", () => {
	beforeEach(reset);
	const customTab = (doc) => ({ input: new vscode.TabInputCustom(doc.uri, VIEW_TYPE) });

	it("shows the file in VS Code's text editor in place of the NotionDown tab", async () => {
		activate(makeContext());
		const doc = makeDoc("/a.md", "x");
		const tab = customTab(doc);
		tabs.open = [tab];
		tabs.active = tab;
		await handlers["command:notionDown.openSource"](doc.uri);
		assert.deepEqual(executed, [["vscode.openWith", doc.uri, "default"]]);
		assert.deepEqual(tabs.closed, [tab]);
	});

	it("finds the file from the active tab when no file is passed", async () => {
		activate(makeContext());
		const doc = makeDoc("/a.md", "x");
		const tab = customTab(doc);
		tabs.open = [tab];
		tabs.active = tab;
		await handlers["command:notionDown.openSource"]();
		assert.equal(executed[0][1], doc.uri);
	});

	it("reports an error when no Markdown file is in front", async () => {
		activate(makeContext());
		await handlers["command:notionDown.openSource"]();
		assert.equal(executed.length, 0);
		assert.equal(errors.length, 1);
	});

	it("is offered only in the NotionDown tab", () => {
		const item = require("../package.json").contributes.menus["editor/title"].find((m) => m.command === "notionDown.openSource");
		assert.match(item.when, /activeCustomEditorId == notionDown\.editor/);
	});
});
