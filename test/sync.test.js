const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { reconcileMarkdown, splitFrontMatter, matchBlocks } = require("../src/markdown-sync");
const { open } = require("./helpers/crepe-dom");

const root = path.resolve(__dirname, "..");

/** Blocks are runs of lines between blank lines. Enough for pure tests; the editor tests use the real parser. */
function parseBlocks(text) {
	const blocks = [];
	const pattern = /\S[^]*?(?=\n\s*\n|\s*$)/g;
	for (const match of text.matchAll(pattern)) blocks.push({ start: match.index, end: match.index + match[0].length });
	return blocks;
}

/** Mimics an editor that rewrites `*` bullets as `-`. */
const fakeTools = { parseBlocks, normalize: (text) => text.trim() };

describe("reconcileMarkdown (pure)", () => {
	it("returns the original text when nothing changed, whatever style the editor chose", () => {
		const original = "# Title\n\n* a\n* b\n\nText with '*'.\n";
		const edited = "# Title\n\n- a\n- b\n\nText with '\\*'.\n";
		// The paragraph differs only by the editor's escaping, which the fake normalizer does not know about.
		assert.equal(reconcileMarkdown(original, "# Title\n\n- a\n- b\n\nText with '*'.\n", fakeTools), original);
		assert.notEqual(reconcileMarkdown(original, edited, fakeTools), original);
	});

	it("rewrites only the block that changed and keeps the gaps between the others", () => {
		const original = "# Title\n\n\nOld text.\n\n* a\n\n\n\nTail.\n";
		const edited = "# Title\n\nNew text.\n\n- a\n\nTail.\n";
		assert.equal(reconcileMarkdown(original, edited, fakeTools), "# Title\n\n\nNew text.\n\n* a\n\n\n\nTail.\n");
	});

	it("keeps a moved block's original text", () => {
		const original = "* a\n\nSecond.\n\nThird.\n";
		const edited = "Third.\n\n- a\n\nSecond.\n";
		assert.equal(reconcileMarkdown(original, edited, fakeTools), "Third.\n\n* a\n\nSecond.\n");
	});

	it("drops the empty-paragraph placeholder that the editor adds", () => {
		const original = "One.\n\nTwo.\n";
		assert.equal(reconcileMarkdown(original, "One.\n\n<br />\n\nTwo.\n\n<br />\n", fakeTools), original);
	});

	it("keeps empty paragraphs that the file already has at its ends", () => {
		const original = "<br />\n\nBody.\n\n<br />\n";
		assert.equal(reconcileMarkdown(original, "Body.\n", fakeTools), original);
	});

	it("turns an empty list item's placeholder into a bare marker, and drops placeholder lines in a quote", () => {
		const edited = "- a\n  - <br />\n\n> note\n> <br />\n> more\n";
		assert.equal(reconcileMarkdown("", edited, fakeTools), "- a\n  -\n\n> note\n>\n> more\n");
	});

	it("leaves a <br /> line inside a code fence alone", () => {
		assert.equal(reconcileMarkdown("", "```html\n<br />\n```\n", fakeTools), "```html\n<br />\n```\n");
	});

	it("adds a new block with a blank line before it", () => {
		assert.equal(reconcileMarkdown("One.\n", "One.\n\nTwo.\n", fakeTools), "One.\n\nTwo.\n");
	});

	it("keeps the absence of a final newline", () => {
		assert.equal(reconcileMarkdown("One.", "One.\n\nTwo.\n", fakeTools), "One.\n\nTwo.");
	});

	it("fills an empty file", () => {
		assert.equal(reconcileMarkdown("", "# New\n", fakeTools), "# New\n");
	});
});

describe("splitFrontMatter", () => {
	it("splits a front matter block from the body", () => {
		assert.deepEqual(splitFrontMatter("---\na: 1\n---\n\nBody\n"), { front: "---\na: 1\n---\n", body: "\nBody\n" });
	});

	it("leaves a document that starts with a rule but has no closing rule alone", () => {
		assert.deepEqual(splitFrontMatter("---\n\nBody\n"), { front: "", body: "---\n\nBody\n" });
	});

	it("handles an empty front matter block", () => {
		assert.equal(splitFrontMatter("---\n---\nBody").front, "---\n---\n");
	});
});

describe("matchBlocks", () => {
	it("matches by order first, then by content for blocks that moved", () => {
		assert.deepEqual(matchBlocks(["a", "b", "c"], ["c", "a", "b"]), [2, 0, 1]);
	});

	it("leaves new blocks unmatched", () => {
		assert.deepEqual(matchBlocks(["a"], ["a", "new"]), [0, -1]);
	});
});

/** Every Markdown file in the repository, plus the fixtures for styles the editor rewrites. */
function corpus() {
	const files = ["readme.md", "AGENTS.md", "CHANGELOG.md", "examples/test.md"];
	for (const dir of ["docs", "test/fixtures/sync"]) {
		for (const name of fs.readdirSync(path.join(root, dir))) if (name.endsWith(".md")) files.push(`${dir}/${name}`);
	}
	return files;
}

describe("saving without an edit (real Crepe editor)", () => {
	const sessions = [];
	after(() => Promise.all(sessions.map((s) => s.destroy())));

	for (const file of corpus()) {
		it(`leaves ${file} byte-identical`, async () => {
			const original = fs.readFileSync(path.join(root, file), "utf8");
			const session = await open(original);
			sessions.push(session);
			assert.equal(session.save(), original);
		});
	}
});

describe("saving after an edit (real Crepe editor)", () => {
	const sessions = [];
	after(() => Promise.all(sessions.map((s) => s.destroy())));

	async function edited(original, change) {
		const session = await open(original);
		sessions.push(session);
		session.edit(change(original));
		return session.save();
	}

	it("changes only the edited line, and adds no <br /> and no escape, when the maintainer types at the end", async () => {
		const original = fs.readFileSync(path.join(root, "test/fixtures/sync/star-in-text.md"), "utf8");
		const typed = original.replace("2. Edit. Save as you would any file.", "2. Edit. Save as you would any file. Done.");
		assert.notEqual(typed, original);
		// An extra blank paragraph and a new heading, as the maintainer typed them.
		const saved = await edited(original, () => `${typed.trimEnd()}\n\n<br />\n\n# New heading\n\n<br />\n\ntext\n\n<br />\n`);
		assert.equal(saved, `${typed.trimEnd()}\n\n# New heading\n\ntext\n`);
		assert.ok(saved.includes("Configure default editor for '*.md'"), "line with * was rewritten");
	});

	it("writes no <br /> for an empty item at the end of a nested list, as the maintainer typed it", async () => {
		const original = "# Guide\n\nText.\n";
		const saved = await edited(original, () => `${original}\n- one\n- two\n  - three\n    - four\n    -\n`);
		assert.ok(!saved.includes("<br"), saved);
		assert.equal(saved, `${original}\n- one\n- two\n  - three\n    - four\n    -\n`);
	});

	it("keeps front matter, bullets, and rule styles outside the edited block", async () => {
		const original = fs.readFileSync(path.join(root, "test/fixtures/sync/front-matter.md"), "utf8");
		const saved = await edited(original, (text) => text.replace("Body text.", "Body text, edited."));
		assert.equal(saved, original.replace("Body text.", "Body text, edited."));
	});

	it("keeps unrelated blocks in a file full of non-default styles", async () => {
		const original = fs.readFileSync(path.join(root, "test/fixtures/sync/list-and-rule-styles.md"), "utf8");
		const saved = await edited(original, (text) => `${text.trimEnd()}\n\nAdded.\n`);
		assert.equal(saved, `${original.trimEnd()}\n\nAdded.\n`);
	});

	it("keeps a reordered block's original style", async () => {
		const original = "* star\n* bullets\n\nParagraph one.\n\nParagraph two.\n";
		const saved = await edited(original, () => "Paragraph two.\n\n- star\n- bullets\n\nParagraph one.\n");
		assert.equal(saved, "Paragraph two.\n\n* star\n* bullets\n\nParagraph one.\n");
	});

	it("returns the original text after an edit is undone", async () => {
		const original = "# Title\n\nText.\n";
		const session = await open(original);
		sessions.push(session);
		session.edit("# Title\n\nChanged.\n");
		assert.notEqual(session.save(), original);
		session.edit(original);
		assert.equal(session.save(), original);
	});
});
