/**
 * Runs the real host, page logic, and Crepe editor together with a model of VS Code's autosave
 * and save participants, and checks that nothing the user types is lost. One run per typical
 * machine; the maintainer's own settings are one of them.
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { SETUPS } = require("./helpers/vscode-setups");
const { startSession } = require("./helpers/session");
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
				await session.settle();
				assert.ok(session.page.visibleText().endsWith(expected));
				const onDisk = session.doc.getText();
				assert.ok(onDisk.includes(expected.trim().replace(/ +/g, " ")), `the file lacks the typed words: ${JSON.stringify(onDisk)}`);
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
			await session.sleep(30);
			assert.match(session.page.visibleText(), /Replaced by git/);
		});
	});
}

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
