/**
 * Models what VS Code does to a Markdown file after the page writes it: autosave, and the save
 * participants that rewrite the text while saving.
 *
 * Why it exists: a custom editor does not own its file. Formatters, whitespace trimming, and a
 * final newline all change the document behind the page's back, and the host reports each change
 * as an update. The bug that swallowed typed words came from such a rewrite. These setups let the
 * Node tests reproduce typical machines, including the maintainer's, without VS Code.
 *
 * Invariant: these are models. `tools/e2e` runs the same setups in a real VS Code with the real
 * Prettier, and that run is the proof; these keep the check fast and run in every `npm test`.
 */

/** Removes spaces and tabs at the end of every line (`files.trimTrailingWhitespace`). */
function trimTrailingWhitespace(text) {
	return text.replace(/[ \t]+$/gm, "");
}

/** Ends the file with exactly one newline (`files.insertFinalNewline` with `files.trimFinalNewlines`). */
function singleFinalNewline(text) {
	return text.length === 0 ? text : `${text.replace(/\n+$/, "")}\n`;
}

/**
 * A stand-in for Prettier's Markdown output on the constructs the tests use: `_` for emphasis,
 * `-` for bullets, at most one blank line between blocks, and no trailing spaces.
 */
function prettierLike(text) {
	return singleFinalNewline(
		trimTrailingWhitespace(
			text
				.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1_$2_")
				.replace(/^(\s*)\* /gm, "$1- ")
				.replace(/\n{3,}/g, "\n\n")
		)
	);
}

/** Typical machines, from no save-time rewriting to the maintainer's own settings. */
const SETUPS = [
	{ name: "VS Code defaults", autoSaveDelayMs: undefined, participants: [] },
	{ name: "autosave with whitespace cleanup", autoSaveDelayMs: 40, participants: [trimTrailingWhitespace, singleFinalNewline] },
	{
		name: "autosave with format on save (maintainer's settings)",
		autoSaveDelayMs: 40,
		participants: [prettierLike, trimTrailingWhitespace, singleFinalNewline],
	},
];

module.exports = { SETUPS, trimTrailingWhitespace, singleFinalNewline, prettierLike };
