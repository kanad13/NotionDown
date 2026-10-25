/**
 * Keeps the Markdown file byte-identical wherever the user did not edit.
 *
 * Why it exists: a block editor re-serializes the whole document, and its serializer picks its
 * own style: `*` escapes, `<br />` for empty paragraphs, `*` bullets, padded tables. Writing that
 * output back would change lines the user never touched. This module compares the file's
 * top-level blocks with the editor's output, block by block, and keeps the original text of
 * every block whose content did not change.
 *
 * Design notes:
 * - "Did not change" means the block equals the editor's serialization of the original block,
 *   so the comparison ignores the editor's style choices and sees only real edits.
 * - The module is plain CommonJS and takes the editor's parser as an argument, so Node tests run
 *   it against the real Milkdown pipeline under jsdom and the page uses the same code.
 * - Front matter is not Markdown content; it passes through untouched.
 */

/**
 * Crepe features the page turns on or off from its defaults. The page and the tests share this,
 * so the tests run the editor the user gets. Image insertion stays off by decision; images in the
 * Markdown still display. Math is on.
 */
const FEATURES = { latex: true, "image-block": false };

/** Style choices that match most Markdown files, so blocks the user does edit stay close to the original. */
const STRINGIFY_STYLE = { bullet: "-", rule: "-" };

const FRONT_MATTER = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** The serializer writes an empty paragraph as `<br />` so it survives a round trip; it is noise on disk. */
const EMPTY_LINE_PLACEHOLDER = /^<br\s*\/?\s*>$/i;

/** Above this many cells, the order-preserving match is skipped and blocks match by content only. */
const MAX_LCS_CELLS = 4000000;

/**
 * Splits leading YAML front matter from the Markdown body.
 *
 * @param {string} text - Whole file text
 * @returns {{ front: string, body: string }} Front matter including its delimiters, and the rest
 */
function splitFrontMatter(text) {
	const match = FRONT_MATTER.exec(text);
	return match ? { front: match[0], body: text.slice(match[0].length) } : { front: "", body: text };
}

/**
 * Reduces a block to what its content is, ignoring style the serializer varies with context.
 *
 * Why: next to another list, the serializer swaps `-` for `*` so the lists stay separate, and it
 * writes an empty paragraph as `<br />`. Neither is a change the user made.
 *
 * @param {string} text - Block text, original (normalized) or edited
 * @returns {string} Comparison key
 */
function keyOf(text) {
	const trimmed = text.trim();
	if (EMPTY_LINE_PLACEHOLDER.test(trimmed)) return "";
	let fenced = false;
	return trimmed
		.split("\n")
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
			return fenced ? line : line.replace(/^(\s*)[*+](\s)/, "$1-$2");
		})
		.join("\n");
}

/**
 * Removes empty-paragraph placeholders that sit inside a block the user edited: an empty list
 * item (`- <br />`) becomes a bare marker, and a placeholder line elsewhere is dropped.
 *
 * @param {string} text - Text of an edited block
 * @returns {string} Text without placeholders, outside code fences
 */
function stripPlaceholders(text) {
	let fenced = false;
	const lines = [];
	for (const line of text.split("\n")) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		if (fenced) {
			lines.push(line);
			continue;
		}
		const item = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)]))\s+<br\s*\/?\s*>\s*$/.exec(line);
		if (item) {
			lines.push(item[1]);
			continue;
		}
		const quoted = /^(\s*(?:>\s*)+)<br\s*\/?\s*>\s*$/.exec(line);
		if (quoted) {
			lines.push(quoted[1].trimEnd());
			continue;
		}
		if (!EMPTY_LINE_PLACEHOLDER.test(line.trim())) lines.push(line);
	}
	return lines.join("\n");
}

/**
 * Pairs each edited block with an original block of the same content.
 *
 * @param {string[]} originalKeys - Normalized original blocks
 * @param {string[]} editedKeys - Edited blocks
 * @returns {number[]} For each edited block, the index of its original block, or -1
 */
function matchBlocks(originalKeys, editedKeys) {
	const match = new Array(editedKeys.length).fill(-1);
	let head = 0;
	while (head < originalKeys.length && head < editedKeys.length && originalKeys[head] === editedKeys[head]) {
		match[head] = head;
		head++;
	}
	let oEnd = originalKeys.length;
	let eEnd = editedKeys.length;
	while (oEnd > head && eEnd > head && originalKeys[oEnd - 1] === editedKeys[eEnd - 1]) {
		oEnd--;
		eEnd--;
		match[eEnd] = oEnd;
	}

	const rows = oEnd - head;
	const cols = eEnd - head;
	if (rows > 0 && cols > 0 && rows * cols <= MAX_LCS_CELLS) {
		const table = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
		for (let r = rows - 1; r >= 0; r--) {
			for (let c = cols - 1; c >= 0; c--) {
				table[r][c] =
					originalKeys[head + r] === editedKeys[head + c]
						? table[r + 1][c + 1] + 1
						: Math.max(table[r + 1][c], table[r][c + 1]);
			}
		}
		let r = 0;
		let c = 0;
		while (r < rows && c < cols) {
			if (originalKeys[head + r] === editedKeys[head + c]) {
				match[head + c] = head + r;
				r++;
				c++;
			} else if (table[r + 1][c] >= table[r][c + 1]) {
				r++;
			} else {
				c++;
			}
		}
	}

	// A block the user dragged elsewhere still keeps its original text.
	const used = new Set(match.filter((index) => index >= 0));
	const unused = new Map();
	originalKeys.forEach((key, index) => {
		if (used.has(index)) return;
		if (!unused.has(key)) unused.set(key, []);
		unused.get(key).push(index);
	});
	editedKeys.forEach((key, index) => {
		const candidates = match[index] === -1 && unused.get(key);
		if (candidates && candidates.length > 0) match[index] = candidates.shift();
	});
	return match;
}

/**
 * Cuts a document into its top-level blocks.
 *
 * @param {string} text - Markdown
 * @param {(text: string) => { type?: string, start: number, end: number }[]} parseBlocks - Offsets and mdast type of each top-level block
 * @returns {{ type?: string, start: number, end: number, text: string }[]} Blocks with their source text
 */
function cutBlocks(text, parseBlocks) {
	return parseBlocks(text).map((block) => ({ ...block, text: text.slice(block.start, block.end) }));
}

/**
 * Chooses the text between two output blocks. A changed block sits where an original block was, so
 * it inherits that gap, and two original neighbors keep theirs; anything else gets one blank line.
 *
 * @param {string} original - Original body
 * @param {{ start: number, end: number }[]} blocks - Original blocks
 * @param {number} before - Original index of the block before the gap, or -1 if it is new
 * @param {number} after - Original index of the block after the gap, or -1 if it is new
 * @returns {string} Separator text
 */
function gapBetween(original, blocks, before, after) {
	if (before >= 0 && before + 1 < blocks.length) return original.slice(blocks[before].end, blocks[before + 1].start);
	if (after > 0) return original.slice(blocks[after - 1].end, blocks[after].start);
	return "\n\n";
}

/**
 * Tells whether two file texts say the same thing, whatever their formatting.
 *
 * Why: other tools rewrite the file after the page wrote it: a formatter on save, trimmed
 * whitespace, a final newline. Those changes carry no new content, so the page must keep what it
 * shows instead of replacing it, or it would drop what the user typed in the meantime. The
 * comparison is on the parsed document, not on text: `*a*` and `_a_` parse alike, and so do a
 * padded and an unpadded table. The editor's serializer keeps the emphasis marker it read, so
 * comparing its output would call those two different.
 *
 * @param {string} a - File text
 * @param {string} b - File text
 * @param {{ canonicalBlocks: (text: string) => string[] }} tools - Parser access; see createTools
 * @returns {boolean} True when the texts differ at most in formatting
 */
function sameContent(a, b, tools) {
	const one = splitFrontMatter(a);
	const two = splitFrontMatter(b);
	if (trimLineEnds(one.front).trim() !== trimLineEnds(two.front).trim()) return false;
	const left = tools.canonicalBlocks(one.body);
	const right = tools.canonicalBlocks(two.body);
	return left.length === right.length && left.every((block, index) => block === right[index]);
}

/**
 * Removes spaces and tabs at the end of every line.
 *
 * @param {string} text - Any text
 * @returns {string} Text without trailing spaces or tabs
 */
function trimLineEnds(text) {
	return text.replace(/[ \t]+$/gm, "");
}

/**
 * Reduces a parsed node to a string that is equal for equal content: no positions, and no
 * trailing spaces in text, which a save-time tool may trim.
 *
 * @param {object} node - mdast node from the editor's parser
 * @returns {string} Canonical JSON for the node
 */
function canonicalNode(node) {
	return JSON.stringify(node, (key, value) => {
		if (key === "position") return undefined;
		return typeof value === "string" ? trimLineEnds(value) : value;
	});
}

/**
 * Builds the file text for an edited document.
 *
 * @param {string} original - The file's Markdown body (no front matter), as the host holds it
 * @param {string} edited - The editor's serialization of the document now
 * @param {{ parseBlocks: Function, normalize: (text: string) => string }} tools - Parser access; see createTools
 * @returns {string} Markdown body in which every unchanged block keeps its original text
 */
function reconcileMarkdown(original, edited, tools) {
	const originalBlocks = cutBlocks(original, tools.parseBlocks);
	const editedBlocks = cutBlocks(edited, tools.parseBlocks);
	// Link definitions (`[ref]: url`) travel with every block, because the editor resolves a
	// reference link only when it sees its definition.
	const definitions = originalBlocks.filter((block) => block.type === "definition").map((block) => block.text);
	const originalKeys = originalBlocks.map((block) =>
		keyOf(tools.normalize(block.type === "definition" ? block.text : [block.text, ...definitions].join("\n\n")))
	);
	const editedKeys = editedBlocks.map((block) => keyOf(block.text));
	const match = matchBlocks(originalKeys, editedKeys);

	// The editor drops empty paragraphs at either end of a document, so those stay as the file has them.
	const filled = originalKeys.map((key, index) => (key === "" ? -1 : index)).filter((index) => index >= 0);
	const first = filled.length ? filled[0] : 0;
	const last = filled.length ? filled[filled.length - 1] : -1;

	const parts = [];
	editedBlocks.forEach((block, index) => {
		if (match[index] >= 0) {
			if (filled.length > 0 && (match[index] < first || match[index] > last)) return;
			parts.push({ text: originalBlocks[match[index]].text, index: match[index] });
		} else if (editedKeys[index] !== "") {
			parts.push({ text: stripPlaceholders(block.text), index: -1 });
		}
	});

	let body = "";
	parts.forEach((part, position) => {
		if (position > 0) {
			const previous = parts[position - 1];
			body += gapBetween(original, originalBlocks, previous.index, part.index);
		}
		body += part.text;
	});

	if (filled.length === 0) return parts.length === 0 ? original : `${body}\n`;
	const prefix = original.slice(0, originalBlocks[first].start);
	const suffix = original.slice(originalBlocks[last].end);
	return body === "" ? prefix + suffix.replace(/^\s+/, "") : prefix + body + suffix;
}

/**
 * Creates the parser access that reconcileMarkdown needs, from a Milkdown editor context.
 *
 * @param {object} ctx - Milkdown context, from `editor.action((ctx) => ...)`
 * @param {{ remarkCtx: object, parserCtx: object, serializerCtx: object }} keys - Context slices from `@milkdown/kit/core`
 * @param {Map<string, string>} cache - Memo of normalized blocks; the caller owns its lifetime
 * @returns {{ parseBlocks: Function, normalize: Function, canonicalBlocks: Function }} Tools for reconcileMarkdown and sameContent
 */
function createTools(ctx, keys, cache = new Map()) {
	return {
		canonicalBlocks(text) {
			return ctx
				.get(keys.remarkCtx)
				.parse(text)
				.children.filter((node) => !(node.type === "html" && EMPTY_LINE_PLACEHOLDER.test(node.value.trim())))
				.map(canonicalNode);
		},
		parseBlocks(text) {
			return ctx
				.get(keys.remarkCtx)
				.parse(text)
				.children.filter((node) => node.position)
				.map((node) => ({ type: node.type, start: node.position.start.offset, end: node.position.end.offset }));
		},
		normalize(text) {
			if (cache.has(text)) return cache.get(text);
			let normalized;
			try {
				normalized = ctx.get(keys.serializerCtx)(ctx.get(keys.parserCtx)(text)).trim();
			} catch {
				// A block the editor cannot parse never equals an edited block, so it is rewritten, not kept.
				normalized = `\u0000${text}`;
			}
			if (cache.size > 5000) cache.clear();
			cache.set(text, normalized);
			return normalized;
		},
	};
}

/**
 * Sets the serializer style for blocks the user edits.
 *
 * @param {object} ctx - Milkdown context, from an `editor.config((ctx) => ...)` callback
 * @param {{ remarkStringifyOptionsCtx: object }} keys - Context slices from `@milkdown/kit/core`
 */
function applyStringifyStyle(ctx, keys) {
	ctx.update(keys.remarkStringifyOptionsCtx, (options) => ({ ...options, ...STRINGIFY_STYLE }));
}

module.exports = {
	FEATURES,
	applyStringifyStyle,
	splitFrontMatter,
	matchBlocks,
	reconcileMarkdown,
	sameContent,
	createTools,
};
