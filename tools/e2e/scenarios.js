/**
 * The end-to-end scenarios: each starts a real VS Code with one kind of user profile, uses the
 * installed extension the way a person does, and checks what the page shows and what lands on disk.
 *
 * Why these: every one is a way the extension meets a user's own settings. The typing scenarios
 * cover the bug where autosave or a save-time rewrite swallowed the latest word. The two
 * association scenarios cover the default-editor question. `external` covers the one case where
 * replacing the page's content is right.
 *
 * Invariant: a scenario proves its own setup. The typing scenarios check that the file on disk
 * was rewritten by VS Code's save participants, because a run in which nothing rewrote the file
 * would pass without testing anything.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const { sleep, waitFor } = require("./page");

const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet", "kilo", "lima"];

/** A seeded generator, so a failing run repeats exactly. */
function random(seed) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

/** The document every typing run starts from. It has the constructs that Prettier and whitespace cleanup rewrite. */
function startText(marker) {
	return `# Notes ${marker}\n\nTrailing spaces here   \n\n* one\n* two\n\nClosing line with *emphasis* text`;
}

const MAINTAINER = {
	"files.autoSave": "afterDelay",
	"files.autoSaveDelay": 300,
	"files.trimTrailingWhitespace": true,
	"files.trimFinalNewlines": true,
	"files.insertFinalNewline": true,
	"editor.formatOnSave": true,
	"[markdown]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
};

/**
 * Types a run of words with uneven pauses and checks that none disappears.
 *
 * @param {object} context - Scenario context
 * @param {{ seed: number, explicitSave: boolean, saveAfterMs: number, pauses: number[] }} run - One typing run
 * @returns {Promise<{ expected: string, onDisk: string }>} What was typed and what the file holds afterwards
 */
async function typeRun(context, { seed, explicitSave, saveAfterMs, pauses }) {
	const { profile, win } = context;
	const marker = `Marker${seed}`;
	const file = path.join(profile.workspace, `typing-${seed}.md`);
	fs.writeFileSync(file, startText(marker));
	profile.open(file);
	const editor = await win.editor(marker);
	assert.ok(await editor.focusEnd(), "the page did not get the focus");

	const next = random(seed);
	let expected = "";
	for (const word of WORDS) {
		// A trailing space is how people type: the word, then the space that starts the next one.
		await editor.type(`${word} `);
		expected += `${word} `;
		// Look many times during the pause: a replaced page can restore itself later and hide the loss.
		const pause = pauses[Math.floor(next() * pauses.length)];
		// Save pressed the moment the last key is released: no observation pause after the last word.
		if (explicitSave && saveAfterMs === 0 && word === WORDS[WORDS.length - 1]) break;
		const until = Date.now() + pause;
		do {
			const shown = await editor.text();
			assert.ok(shown.trimEnd().endsWith(expected.trim()), `after typing "${word}" the page shows ...${JSON.stringify(shown.slice(-70))}`);
			await sleep(20);
		} while (Date.now() < until);
	}
	if (explicitSave) {
		await sleep(saveAfterMs);
		await win.save();
	}
	// Autosave and Save finish on VS Code's schedule, so wait for the words to reach the file instead of guessing a time.
	const arrived = Date.now() + 8000;
	while (Date.now() < arrived && !fs.readFileSync(file, "utf8").includes(expected.trim())) await sleep(200);
	await sleep(1500);
	// After a save the file must stay saved. A page that wrote its own style back over the formatter's would mark it changed again.
	if (explicitSave) assert.equal(await win.isDirty(), false, `the file is marked changed again after Save (seed ${seed})`);
	const shown = await editor.text();
	assert.ok(shown.trimEnd().endsWith(expected.trim()), `at the end the page shows ...${JSON.stringify(shown.slice(-70))}`);
	return { expected, onDisk: fs.readFileSync(file, "utf8") };
}

/** A typing scenario for one machine setup. */
function typing({ name, settings, needsPrettier = false, explicitSave = false, saveAfterMs = 1500, expectRewritten }) {
	return {
		name,
		settings,
		needsPrettier,
		async run(context) {
			let sawRewrite = false;
			for (const seed of [1, 2, 3]) {
				const { expected, onDisk } = await typeRun(context, { seed, explicitSave, saveAfterMs, pauses: [0, 30, 150, 350, 700] });
				assert.ok(onDisk.includes(expected.trim()), `the file lacks the typed words: ${JSON.stringify(onDisk.slice(-120))}`);
				if (expectRewritten(onDisk)) sawRewrite = true;
			}
			assert.ok(sawRewrite, "VS Code never rewrote the file, so this run did not exercise the save pipeline");
		},
	};
}

const SCENARIOS = [
	typing({
		name: "typing, VS Code defaults, explicit save",
		settings: {},
		explicitSave: true,
		expectRewritten: () => true,
	}),
	typing({
		name: "typing, autosave with whitespace cleanup and final newline",
		settings: {
			"files.autoSave": "afterDelay",
			"files.autoSaveDelay": 300,
			"files.trimTrailingWhitespace": true,
			"files.trimFinalNewlines": true,
			"files.insertFinalNewline": true,
		},
		expectRewritten: (text) => text.endsWith("\n") && !/[ \t]+\n/.test(text.split("Closing")[0].replace(/^# .*\n/, "")),
	}),
	typing({
		// VS Code does not run Prettier on an autosave; the whitespace and final newline steps do run.
		name: "typing, autosave with Prettier on save (the maintainer's settings)",
		settings: MAINTAINER,
		needsPrettier: true,
		expectRewritten: (text) => text.endsWith("\n"),
	}),
	typing({
		name: "typing, Prettier on explicit save while typing",
		settings: { "editor.formatOnSave": true, "[markdown]": { "editor.defaultFormatter": "esbenp.prettier-vscode" } },
		needsPrettier: true,
		explicitSave: true,
		expectRewritten: (text) => text.includes("_emphasis_") && text.includes("- one"),
	}),
	typing({
		name: "typing, Prettier on Save pressed the moment the last key is released",
		settings: { "editor.formatOnSave": true, "[markdown]": { "editor.defaultFormatter": "esbenp.prettier-vscode" } },
		needsPrettier: true,
		explicitSave: true,
		saveAfterMs: 0,
		expectRewritten: (text) => text.includes("_emphasis_") && text.includes("- one"),
	}),
	{
		name: "a typed #hashtag at the start of a line is saved without a backslash",
		settings: {},
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "hash.md");
			fs.writeFileSync(file, "# Hash MarkerH\n\nStart\n");
			profile.open(file);
			const editor = await win.editor("MarkerH");
			await editor.focusEnd();
			await editor.enter();
			await editor.type("#asdas");
			await sleep(1500);
			await win.save();
			await waitFor("the file to hold the new line", async () => fs.readFileSync(file, "utf8").includes("asdas"), 10000);
			const onDisk = fs.readFileSync(file, "utf8");
			assert.ok(/^#asdas$/m.test(onDisk), `the file holds ${JSON.stringify(onDisk)}`);
		},
	},
	{
		name: "the rocket replaces the text editor tab instead of adding a second one",
		settings: { "workbench.editorAssociations": { "*.md": "default" } },
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "rocket.md");
			fs.writeFileSync(file, "# Rocket MarkerR\n");
			profile.open(file);
			await waitFor("the question", async () => (await win.notifications()).some((n) => n.buttons.includes("Keep Text Editor")), 30000);
			await win.clickNotificationButton("Keep Text Editor");
			await waitFor("the rocket button", () => win.clickTitleAction("Open in NotionDown"), 15000);
			await win.editor("MarkerR");
			await waitFor("one tab for the file", async () => (await win.tabs()).filter((t) => t.startsWith("rocket.md")).length === 1, 10000);
			assert.deepEqual(await win.notifications(), [], "a question appeared after the user kept the text editor");
		},
	},
	{
		name: "See Screenshots opens the walkthrough and leaves the setting alone",
		settings: { "workbench.editorAssociations": { "*.md": "default" } },
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "shots.md");
			fs.writeFileSync(file, "# Shots\n");
			profile.open(file);
			await waitFor("the question", async () => (await win.notifications()).some((n) => n.buttons.includes("See Screenshots")), 30000);
			await win.clickNotificationButton("See Screenshots");
			// The walkthrough opens inside the Welcome tab, so the step titles prove that VS Code found its id.
			await waitFor("the walkthrough steps", () => win.inWorkbench("document.querySelector('.gettingStartedContainer')?.innerText.includes('Choose your default Markdown editor')"), 15000);
			const current = JSON.parse(fs.readFileSync(profile.settingsPath, "utf8").replace(/^\s*\/\/.*$/gm, ""));
			assert.equal(current["workbench.editorAssociations"]["*.md"], "default", "looking at screenshots changed the setting");
		},
	},
	{
		name: "the source button replaces the NotionDown tab with the text editor",
		settings: {},
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "source.md");
			fs.writeFileSync(file, "# Source MarkerS\n");
			profile.open(file);
			await win.editor("MarkerS");
			await waitFor("the source button", () => win.clickTitleAction("Show Markdown Source in the Text Editor"), 15000);
			await waitFor("one tab for the file", async () => (await win.tabs()).filter((t) => t.startsWith("source.md")).length === 1, 10000);
		},
	},
	{
		name: "a broken Mermaid diagram shows an error note, leaves no debris, and the next diagram still draws",
		settings: {},
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "mermaid.md");
			fs.writeFileSync(file, "# Mermaid MarkerM\n\n```mermaid\ngraph TD\n  A --> \n  B[[[\n```\n\n```mermaid\ngraph LR\n  X --> Y\n```\n");
			profile.open(file);
			const editor = await win.editor("MarkerM");
			await waitFor("the second diagram", () => editor.has(".notiondown-mermaid:not(.notiondown-mermaid-error) svg"), 30000);
			assert.ok(await editor.has(".notiondown-mermaid-error"), "the broken diagram shows no error note");
			assert.equal(await editor.has('body > [id^="dnotiondown-mermaid"]'), false, "Mermaid left its error drawing in the page");
		},
	},
	{
		name: "a change made outside the editor appears in the page",
		settings: {},
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "external.md");
			fs.writeFileSync(file, "# External MarkerX\n\nBefore\n");
			profile.open(file);
			const editor = await win.editor("MarkerX");
			fs.writeFileSync(file, "# External MarkerX\n\nChanged by git checkout\n");
			await waitFor("the page to show the outside change", async () => (await editor.text()).includes("Changed by git checkout"), 15000);
		},
	},
	{
		name: "Markdown opens in NotionDown with no association set",
		settings: {},
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "fresh.md");
			fs.writeFileSync(file, "# Fresh MarkerF\n");
			profile.open(file);
			await win.editor("MarkerF");
			await sleep(1500);
			assert.deepEqual(await win.notifications(), [], "a question appeared although nothing overrides the default");
		},
	},
	{
		name: "a text-editor association gets one question, and yes switches the file to NotionDown",
		settings: { "workbench.editorAssociations": { "*.md": "default", "*.png": "imagePreview.previewEditor" } },
		async run({ profile, win }) {
			const file = path.join(profile.workspace, "assoc.md");
			fs.writeFileSync(file, "# Association MarkerA\n");
			profile.open(file);
			const toast = await waitFor(
				"the question about the default editor",
				async () => (await win.notifications()).find((n) => n.buttons.includes("Use NotionDown")),
				30000
			);
			assert.deepEqual(toast.buttons, ["Use NotionDown", "See Screenshots", "Keep Text Editor"]);
			await win.clickNotificationButton("Use NotionDown");
			const settings = await waitFor(
				"the setting to change",
				async () => {
					const current = JSON.parse(fs.readFileSync(profile.settingsPath, "utf8").replace(/^\s*\/\/.*$/gm, ""));
					return !("*.md" in (current["workbench.editorAssociations"] || {})) && current;
				},
				15000
			);
			assert.equal(settings["workbench.editorAssociations"]["*.png"], "imagePreview.previewEditor", "another association was removed");
			await win.editor("MarkerA");
		},
	},
];

module.exports = { SCENARIOS };
