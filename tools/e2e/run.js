/**
 * Runs the end-to-end scenarios in a real VS Code.
 *
 * Usage: node tools/e2e/run.js [--vsix <file>] [--app <VS Code app>] [--only <text>] [--keep] [--port <n>]
 *
 * Why it is not part of `npm test`: it opens real VS Code windows, takes about a minute, and needs
 * a desktop. Run it before a release and after any change to the host, the page's sync, or the
 * manifest. Without `--vsix` it builds the package first, so the run tests what would ship.
 *
 * Invariants:
 * - The run uses a private profile in a temporary folder and never reads or writes the user's own
 *   VS Code settings or extensions.
 * - Exit code 0 means every scenario that ran passed; a skipped scenario is printed and counted.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { locateApp, findInstalledExtension, launch } = require("./app");
const { attach, sleep } = require("./page");
const { SCENARIOS } = require("./scenarios");

/** Reads `--name value` and `--flag` options. */
function parseArguments(argv) {
	const options = { keep: false };
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--keep") options.keep = true;
		else if (argument.startsWith("--")) options[argument.slice(2)] = argv[++index];
	}
	return options;
}

/** Builds the `.vsix` into a temporary file and returns its path. */
function buildPackage(root, directory) {
	const output = path.join(directory, "notiondown-e2e.vsix");
	for (const command of [["run", "build"], ["exec", "--", "vsce", "package", "--out", output]]) {
		const result = spawnSync("npm", command, { cwd: root, encoding: "utf8" });
		if (result.status !== 0) throw new Error(`npm ${command.join(" ")} failed:\n${result.stdout}${result.stderr}`);
	}
	return output;
}

async function main() {
	const options = parseArguments(process.argv.slice(2));
	const root = path.resolve(__dirname, "..", "..");
	const work = fs.mkdtempSync(path.join(os.tmpdir(), "notiondown-e2e-"));
	const app = locateApp(options.app || process.env.VSCODE_PATH);
	const vsix = options.vsix ? path.resolve(options.vsix) : buildPackage(root, work);
	const prettier = findInstalledExtension("esbenp.prettier-vscode");
	console.log(`VS Code: ${app.name}\nPackage: ${vsix}\nPrettier: ${prettier || "not found"}\n`);

	const chosen = SCENARIOS.filter((scenario) => !options.only || scenario.name.includes(options.only));
	const results = [];
	let port = Number(options.port) || 9400;
	for (const scenario of chosen) {
		if (scenario.needsPrettier && !prettier) {
			results.push({ name: scenario.name, status: "SKIP", note: "the Prettier extension is not installed on this machine" });
			continue;
		}
		const started = Date.now();
		let profile;
		let win;
		try {
			profile = launch({
				app,
				vsix,
				settings: scenario.settings,
				copyExtensions: scenario.needsPrettier ? [prettier] : [],
				port,
				root: path.join(work, `scenario-${results.length}`),
			});
			win = await attach(port);
			await win.ready();
			await sleep(2500);
			await scenario.run({ profile, win });
			results.push({ name: scenario.name, status: "PASS", note: `${Math.round((Date.now() - started) / 1000)} s` });
		} catch (error) {
			results.push({ name: scenario.name, status: "FAIL", note: error.message });
		} finally {
			if (win) win.close();
			if (profile) profile.stop();
			port++;
			await sleep(1500);
		}
	}

	for (const result of results) console.log(`${result.status.padEnd(5)} ${result.name}\n      ${result.note.split("\n").join("\n      ")}`);
	const failed = results.filter((result) => result.status === "FAIL").length;
	const skipped = results.filter((result) => result.status === "SKIP").length;
	console.log(`\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
	if (!options.keep) fs.rmSync(work, { recursive: true, force: true });
	else console.log(`Kept ${work}`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
