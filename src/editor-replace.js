/**
 * Replaces the editor's content and puts the cursor back where it was.
 *
 * Why: the host reports the file again after a save rewrites it (a formatter, a final newline).
 * The text is the same to a reader, but replacing the content moves the cursor to the document
 * start, and the user would lose their place mid-sentence. Formatting changes leave the document
 * structure alone, so the old positions are still right; after a real change they are clamped.
 *
 * Plain CommonJS so the page and the Node tests run the same function. The caller passes the
 * Milkdown and ProseMirror pieces, because the page bundles them and the tests load them by
 * dynamic import.
 *
 * @param {object} editor - The Milkdown editor (`crepe.editor`)
 * @param {string} body - Markdown to show
 * @param {{ replaceAll: Function, editorViewCtx: object, Selection: object, TextSelection: object }} api - Milkdown and ProseMirror exports
 */
function replaceContent(editor, body, api) {
	const { replaceAll, editorViewCtx, Selection, TextSelection } = api;
	let from = 0;
	let to = 0;
	editor.action((ctx) => {
		const { selection } = ctx.get(editorViewCtx).state;
		from = selection.from;
		to = selection.to;
	});
	editor.action(replaceAll(body));
	editor.action((ctx) => {
		const view = ctx.get(editorViewCtx);
		const { doc } = view.state;
		const clamp = (position) => Math.max(0, Math.min(position, doc.content.size));
		try {
			const selection = TextSelection.between(doc.resolve(clamp(from)), doc.resolve(clamp(to)));
			view.dispatch(view.state.tr.setSelection(selection));
		} catch {
			view.dispatch(view.state.tr.setSelection(Selection.atStart(doc)));
		}
	});
}

module.exports = { replaceContent };
