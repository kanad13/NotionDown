/**
 * Tests the page's rules for the host's updates against the real Crepe editor under jsdom:
 * a change in formatting alone must never replace what the user sees or typed.
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { createPageSync } = require("../src/page-sync");
const { sameContent } = require("../src/markdown-sync");
const { open } = require("./helpers/crepe-dom");

const sessions = [];

/** Opens an editor and a sync with timers under the test's control. */
async function start(text) {
	const page = await open(text);
	const posted = [];
	const timers = [];
	let replaced = 0;
	const sync = createPageSync(
		{
			post: (message) => posted.push(message),
			getMarkdown: page.serialize,
			withTools: page.withTools,
			replaceEditor: (body) => {
				replaced++;
				page.replaceBody(body);
			},
		},
		{ setTimer: (fn) => timers.push(fn) - 1, clearTimer: () => {} }
	);
	sync.start(text);
	sessions.push(page);
	return {
		page,
		sync,
		posted,
		get replaced() {
			return replaced;
		},
		/** Types, then lets the debounced send run, as 200 ms of quiet would. */
		typeAndSend(typed) {
			page.typeAtEnd(typed);
			sync.flush();
		},
		type(typed) {
			page.typeAtEnd(typed);
		},
	};
}

afterEach(() => {
	while (sessions.length) sessions.pop().destroy();
});

describe("sameContent", () => {
	const tools = async (text) => (await open(text)).withTools;

	it("ignores formatting a save-time tool changes", async () => {
		const original = "# Title\n\n* one\n* two\n\nSome *emphasis* here.\n";
		const formatted = "# Title\n\n- one\n- two\n\nSome _emphasis_ here.\n";
		assert.equal((await tools(original))((t) => sameContent(original, formatted, t)), true);
	});

	it("ignores trailing whitespace, a final newline, and a padded table", async () => {
		const original = "Line with spaces   \n\n| a | b |\n|---|---|\n| 1 | 2 |";
		const formatted = "Line with spaces\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n";
		assert.equal((await tools(original))((t) => sameContent(original, formatted, t)), true);
	});

	it("sees a changed word, a moved block, and changed front matter", async () => {
		const original = "---\ntitle: A\n---\n\nOne\n\nTwo\n";
		const run = async (other) => (await tools(original))((t) => sameContent(original, other, t));
		assert.equal(await run("---\ntitle: A\n---\n\nOne\n\nTwo!\n"), false);
		assert.equal(await run("---\ntitle: A\n---\n\nTwo\n\nOne\n"), false);
		assert.equal(await run("---\ntitle: B\n---\n\nOne\n\nTwo\n"), false);
	});
});

describe("a host update that follows the page's own write", () => {
	it("keeps the words typed after the write when the update only reformats", async () => {
		const s = await start("* one\n* two\n\nIntro\n");
		s.typeAndSend(" alpha");
		s.type(" beta");
		const sent = s.posted[0].text;
		// The file was saved: the host holds the page's text, reformatted.
		s.sync.onHostUpdate(sent.replace("* one", "- one").replace("* two", "- two"), 0);
		assert.equal(s.replaced, 0);
		assert.match(s.page.visibleText(), /alpha beta/);
	});

	it("still sends the words typed after the update, against the reformatted file text", async () => {
		const s = await start("* one\n* two\n\nIntro\n");
		s.type(" alpha");
		s.sync.onHostUpdate("- one\n- two\n\nIntro\n", 0);
		s.sync.flush();
		assert.equal(s.posted.length, 1);
		assert.match(s.posted[0].text, /Intro alpha/);
		assert.match(s.posted[0].text, /- one\n- two/);
	});

	it("ignores an update that predates the page's newest edit", async () => {
		const s = await start("Hello\n");
		s.typeAndSend(" first");
		s.type(" second");
		s.sync.flush();
		assert.equal(s.posted.length, 2);
		// The host reports a change it made before it saw edit 2; edit 2 will overwrite it.
		s.sync.onHostUpdate("Hello first\n", 1);
		assert.equal(s.replaced, 0);
		assert.match(s.page.visibleText(), /first second/);
	});

	it("ignores an update that is identical to the text the page holds", async () => {
		const s = await start("Hello\n");
		s.typeAndSend(" there");
		s.sync.onHostUpdate(s.posted[0].text, 1);
		assert.equal(s.replaced, 0);
	});
});

describe("a host update that only reformats, when nothing is unsent", () => {
	it("leaves the editor and the cursor alone", async () => {
		const s = await start("* one\n* two\n\nIntro *emphasis* end\n");
		s.page.placeCursor(5);
		const before = s.page.selection();
		s.sync.onHostUpdate("- one\n- two\n\nIntro _emphasis_ end\n", 0);
		assert.equal(s.replaced, 0);
		assert.deepEqual(s.page.selection(), before);
	});

	it("keeps a space the user just typed, which the file's trimmed text lacks", async () => {
		const s = await start("Intro\n");
		s.typeAndSend(" alpha");
		s.type(" ");
		s.sync.onHostUpdate("Intro alpha\n", 1);
		assert.equal(s.page.visibleText(), "Intro alpha ");
	});

	it("does not send the old style back, so the file is not marked changed again", async () => {
		const s = await start("Intro *emphasis* end\n");
		s.typeAndSend(" more");
		const reformatted = s.posted[0].text.replace("*emphasis*", "_emphasis_");
		s.sync.onHostUpdate(reformatted, 1);
		s.sync.flush();
		assert.equal(s.posted.length, 1);
	});

	it("keeps the cursor where it was when another program edits a later paragraph", async () => {
		const s = await start("First paragraph\n\nSecond\n");
		s.page.placeCursor(5);
		s.sync.onHostUpdate("First paragraph\n\nSecond, changed in git\n", 0);
		assert.equal(s.replaced, 1);
		assert.deepEqual(s.page.selection(), { from: 5, to: 5 });
	});

	it("keeps the cursor in range when another program shortens the file", async () => {
		const s = await start("A long first paragraph\n\nAnother long paragraph\n");
		s.page.placeCursor(30);
		s.sync.onHostUpdate("Short\n", 0);
		const { from } = s.page.selection();
		assert.ok(from >= 0 && from <= 7, `cursor at ${from}`);
	});
});

describe("a host update that carries new content", () => {
	it("replaces the editor for a change made elsewhere", async () => {
		const s = await start("Hello\n");
		s.sync.onHostUpdate("# Other\n\nText from git\n", 0);
		assert.equal(s.replaced, 1);
		assert.match(s.page.visibleText(), /Text from git/);
	});

	it("does not send the replaced text back as an edit", async () => {
		const s = await start("Hello\n");
		s.sync.onHostUpdate("# Other\n", 0);
		s.sync.flush();
		assert.deepEqual(s.posted, []);
	});

	it("replaces the editor when the page has sent edits and the host has applied them all", async () => {
		const s = await start("Hello\n");
		s.typeAndSend(" there");
		s.sync.onHostUpdate("Rewritten\n", 1);
		assert.equal(s.replaced, 1);
	});

	it("accepts an update from a host that sends no edit count", async () => {
		const s = await start("Hello\n");
		s.typeAndSend(" there");
		s.sync.onHostUpdate("Rewritten\n");
		assert.equal(s.replaced, 1);
	});
});

describe("edits sent to the host", () => {
	it("numbers each edit, so the host can say how many it applied", async () => {
		const s = await start("Hello\n");
		s.typeAndSend(" a");
		s.typeAndSend(" b");
		assert.deepEqual(
			s.posted.map((message) => [message.type, message.count]),
			[
				["edit", 1],
				["edit", 2],
			]
		);
	});

	it("sends nothing when the text did not change", async () => {
		const s = await start("Hello\n");
		s.sync.flush();
		assert.deepEqual(s.posted, []);
	});
});
