const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("./helpers/crepe-dom");

describe("what the editor shows for common Markdown (real Crepe editor)", () => {
	const sessions = [];
	after(() => Promise.all(sessions.map((s) => s.destroy())));

	async function show(markdown) {
		const session = await open(markdown);
		sessions.push(session);
		return session;
	}

	it("displays an image written in Markdown syntax, with its path unchanged for the page's <base>", async () => {
		const { root, save } = await show("![Alt text](images/pic.png)\n\nText ![inline](../up.png) here.\n");
		const sources = [...root.querySelectorAll("img[src]")].map((img) => img.getAttribute("src"));
		assert.deepEqual(sources, ["images/pic.png", "../up.png"]);
		assert.equal(save(), "![Alt text](images/pic.png)\n\nText ![inline](../up.png) here.\n");
	});

	it("keeps an image title and an https image", async () => {
		const original = '![Logo](https://example.com/logo.png "The title")\n';
		const { root, save } = await show(original);
		assert.equal(root.querySelector("img[src]").getAttribute("src"), "https://example.com/logo.png");
		assert.equal(save(), original);
	});

	it("shows dollar-delimited math as plain text, because the Latex feature is off", async () => {
		const { root, save } = await show("Inline $E=mc^2$ and a block:\n\n$$\na^2 + b^2\n$$\n");
		assert.ok(root.textContent.includes("$E=mc^2$"));
		assert.equal(root.querySelector(".katex"), null);
		assert.equal(save(), "Inline $E=mc^2$ and a block:\n\n$$\na^2 + b^2\n$$\n");
	});

	it("keeps raw HTML as text instead of running it", async () => {
		const { root } = await show('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n');
		assert.equal(root.querySelector("img[src]"), null);
		assert.equal(root.querySelector("script"), null);
	});
});
