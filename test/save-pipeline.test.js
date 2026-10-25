/**
 * Runs the real host, page logic, and Crepe editor together with a model of VS Code's autosave
 * and save participants, and checks that nothing the user types is lost. One run per typical
 * machine; the maintainer's own settings are one of them.
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { SETUPS } = require("./helpers/vscode-setups");
const { startSession, until } = require("./helpers/session");
const { sameContent } = require("../src/markdown-sync");

/** A small seeded generator, so a failing run can be repeated exactly. */
function random(seed) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];

const sessions = [];
afterEach(() => {
	while (sessions.length) sessions.pop().stop();
});

/** Types the words with pauses between them: none, a split second, or long enough for a save. */
async function typeWords(session, seed, count = WORDS.length) {
	const next = random(seed);
	let expected = "";
	for (const word of WORDS.slice(0, count)) {
		session.type(` ${word}`);
		expected += ` ${word}`;
		assert.ok(session.page.visibleText().endsWith(expected), `after typing "${word}" the editor shows ${session.page.visibleText()}`);
		await session.sleep([0, 5, 15, 45, 90][Math.floor(next() * 5)]);
		assert.ok(
			session.page.visibleText().endsWith(expected),
			`a word was lost after "${word}": the editor shows "${session.page.visibleText()}"`
		);
	}
	return expected;
}

const DOCUMENT = "# Notes\n\nStart\n\n* one\n* two\n\nClosing line with *emphasis*  \n";

for (const setup of SETUPS) {
	describe(`typing on ${setup.name}`, () => {
		for (const seed of [1, 2, 3, 4, 5]) {
			it(`keeps every word and the file agrees with the editor (seed ${seed})`, async () => {
				const session = await startSession({ text: DOCUMENT, setup });
				sessions.push(session);
				const expected = await typeWords(session, seed);
				const typed = expected.trim().replace(/ +/g, " ");
				await until(() => session.doc.getText().includes(typed));
				await session.settle();
				await until(() => session.sync.text() === session.doc.getText());
				assert.ok(session.page.visibleText().endsWith(expected));
				const onDisk = session.doc.getText();
				assert.ok(onDisk.includes(typed), `the file lacks the typed words: ${JSON.stringify(onDisk)}`);
				const agree = session.page.withTools((tools) => sameContent(session.doc.getText(), session.sync.text(), tools));
				assert.ok(agree, "the editor and the file differ in content after the save pipeline finished");
				assert.equal(session.sync.text(), session.doc.getText(), "the page would still send a different text, which marks the file changed again");
			});
		}

		it("still shows a change made by another program", async () => {
			const session = await startSession({ text: DOCUMENT, setup });
			sessions.push(session);
			session.doc.setText("# Replaced by git\n");
			require("./helpers/fake-vscode").handlers.docChange({ document: session.doc, contentChanges: [{ text: "x" }] });
			await until(() => /Replaced by git/.test(session.page.visibleText()));
			assert.match(session.page.visibleText(), /Replaced by git/);
		});
	});
}

describe("Save pressed before the page's pause is over", () => {
	// Format on save with autosave off: only the explicit Save writes the file.
	const setup = { name: "explicit save with format on save", participants: SETUPS[SETUPS.length - 1].participants };
	// The page waits long, as in a real window, so the word is still unsent when Save is pressed.
	for (const [name, latencyMs, formatMs] of [
		["the edit lands while the formatter runs", 3, 40],
		["the edit lands after the save finished", 40, 3],
	]) {
		it(`saves the last word, leaves the file formatted and the tab clean (${name})`, async () => {
			const session = await startSession({ text: DOCUMENT, setup, sendDelayMs: 400, latencyMs, formatMs });
			sessions.push(session);
			session.type(" zulu");
			await session.pressSave();
			await until(() => !session.doc.isDirty && session.disk.includes("zulu"));
			await session.settle();
			assert.ok(session.disk.includes("zulu"), `the saved file lacks the last word: ${JSON.stringify(session.disk)}`);
			assert.equal(session.doc.isDirty, false, "the tab is marked changed after the save settled");
			assert.equal(session.disk, session.doc.getText(), "the document differs from what was saved");
			assert.equal(session.disk, setup.participants.reduce((text, participant) => participant(text), session.disk), "the formatter's result was overwritten by unformatted text");
			assert.ok(session.page.visibleText().endsWith(" zulu"), "the editor lost the word");
			assert.equal(session.replaced, 0, "the page replaced its content, which moves the cursor");
		});
	}

	it("keeps a space typed after Save was pressed", async () => {
		const session = await startSession({ text: DOCUMENT, setup, sendDelayMs: 400, latencyMs: 3, formatMs: 40 });
		sessions.push(session);
		session.type(" zulu");
		const done = session.pressSave();
		session.type(" ");
		await done;
		await session.settle();
		assert.ok(session.page.visibleText().endsWith(" zulu "), `the editor shows ${JSON.stringify(session.page.visibleText())}`);
	});

	it("does not save twice for an edit that is not a Save", async () => {
		const session = await startSession({ text: DOCUMENT, setup, sendDelayMs: 10 });
		sessions.push(session);
		session.type(" zulu");
		await until(() => session.doc.getText().includes("zulu"));
		await session.settle();
		assert.equal(session.saves, 0, "an edit without Save started a save");
	});

	it("shows the problem when the page does nothing on Save", async () => {
		const session = await startSession({ text: DOCUMENT, setup, sendDelayMs: 400, latencyMs: 3, formatMs: 15 });
		sessions.push(session);
		session.type(" zulu");
		await session.pressSave({ flush: false });
		await session.settle();
		assert.ok(!session.disk.includes("zulu"), "the harness should show the word missing from the saved file");
	});
});

describe("the harness itself", () => {
	it("reproduces the reported bug when the page replaces its content on every update", async () => {
		const setup = SETUPS[SETUPS.length - 1];
		let lost = 0;
		for (const seed of [1, 2, 3, 4, 5]) {
			const session = await startSession({ text: DOCUMENT, setup, naive: true });
			try {
				await typeWords(session, seed);
			} catch {
				lost++;
			} finally {
				session.stop();
			}
		}
		assert.ok(lost > 0, "the old update rule should lose a word on the maintainer's settings");
	});
});
