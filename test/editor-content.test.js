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

	it("renders inline and block math with KaTeX, and writes the source back unchanged", async () => {
		const original = "Inline $E=mc^2$ and a block:\n\n$$\na^2 + b^2\n$$\n";
		const { root, save } = await show(original);
		await new Promise((resolve) => setTimeout(resolve, 300));
		assert.ok(root.querySelectorAll(".katex").length >= 1, "no KaTeX output");
		assert.equal(save(), original);
	});

	it("keeps prices written with dollar signs intact when the paragraph is edited, though two of them display as math", async () => {
		const original = "It costs $5 and then $10 more.\n";
		const session = await show(original);
		assert.equal(session.save(), original);
		session.edit("It costs $5 and then $10 more, really.\n");
		assert.equal(session.save(), "It costs $5 and then $10 more, really.\n");
	});

	it("keeps raw HTML as text instead of running it", async () => {
		const { root } = await show('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n');
		assert.equal(root.querySelector("img[src]"), null);
		assert.equal(root.querySelector("script"), null);
	});
});
