/**
 * Takes the README screenshots in a real VS Code, in a light and a dark theme.
 *
 * Usage: node tools/e2e/screenshots.js [--vsix <file>] [--app <VS Code app>] [--out <folder>]
 *
 * Why it is a script and not a one-off: the images show the editor as users see it, so they go
 * stale when the page changes. Rerunning this regenerates all of them from `examples/showcase.md`
 * and the installed package, in a private profile.
 *
 * Invariant: the window size and the hidden chrome are fixed here, so two runs on different
 * machines give images of the same size and layout.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { locateApp, launch } = require("./app");
const { attach, sleep, waitFor } = require("./page");

const THEMES = [
	{ name: "light", theme: "Default Light Modern" },
	{ name: "dark", theme: "Default Dark Modern" },
];

/** Quiet the window so the image shows the editor, not the surroundings. */
const QUIET = {
	"workbench.statusBar.visible": false,
	"workbench.activityBar.location": "hidden",
	"workbench.layoutControl.enabled": false,
	"window.commandCenter": false,
	"breadcrumbs.enabled": false,
	"editor.minimap.enabled": false,
	"window.zoomLevel": 0,
};

function parseArguments(argv) {
	const options = {};
	for (let index = 0; index < argv.length; index += 2) options[argv[index].slice(2)] = argv[index + 1];
	return options;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const root = path.resolve(__dirname, "..", "..");
	const out = path.resolve(options.out || path.join(root, "assets", "screenshots"));
	const work = fs.mkdtempSync(path.join(os.tmpdir(), "notiondown-shots-"));
	const app = locateApp(options.app || process.env.VSCODE_PATH);
	let vsix = options.vsix && path.resolve(options.vsix);
	if (!vsix) {
		vsix = path.join(work, "notiondown-shots.vsix");
		for (const command of [["run", "build"], ["exec", "--", "vsce", "package", "--out", vsix]]) {
			const result = spawnSync("npm", command, { cwd: root, encoding: "utf8" });
			if (result.status !== 0) throw new Error(`npm ${command.join(" ")} failed:\n${result.stdout}${result.stderr}`);
		}
	}
	fs.mkdirSync(out, { recursive: true });
	const showcase = fs.readFileSync(path.join(root, "examples", "showcase.md"), "utf8");

	let port = 9700;
	for (const { name, theme } of THEMES) {
		const profile = launch({
			app,
			vsix,
			settings: { ...QUIET, "workbench.colorTheme": theme, "window.autoDetectColorScheme": false },
			port,
			root: path.join(work, name),
		});
		const win = await attach(port++);
		try {
			await win.ready();
			await sleep(2000);
			await win.resize(1280, 900);
			await win.toggleSideBar();

			const note = path.join(profile.workspace, "project-notes.md");
			fs.writeFileSync(note, showcase);
			profile.open(note);
			const editor = await win.editor("Project notes");
			await waitFor("the diagram", () => editor.has(".notiondown-mermaid svg"), 30000);
			await waitFor("the math", () => editor.has(".katex"), 30000);
			await sleep(1500);
			await win.screenshot(path.join(out, `overview-${name}.png`), ".editor-group-container");

			await editor.scrollTo("Math");
			await sleep(800);
			await win.screenshot(path.join(out, `details-${name}.png`), ".editor-group-container");

			await editor.scrollTo("Choosing a format");
			await sleep(800);
			await win.screenshot(path.join(out, `table-${name}.png`), ".editor-group-container");

			const slash = path.join(profile.workspace, "slash.md");
			fs.writeFileSync(slash, "# Meeting notes\n\nStart a new block with a slash.\n");
			profile.open(slash);
			const menu = await win.editor("Meeting notes");
			await menu.focusEnd();
			await menu.enter();
			await menu.type("/");
			await waitFor("the slash menu", () => menu.has(".milkdown-slash-menu"), 15000);
			await sleep(800);
			await win.screenshot(path.join(out, `slash-${name}.png`), ".editor-group-container");
		} finally {
			win.close();
			profile.stop();
			await sleep(1500);
		}
	}
	fs.rmSync(work, { recursive: true, force: true });
	console.log(`Wrote the screenshots to ${out}`);
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
