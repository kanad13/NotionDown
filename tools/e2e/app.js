/**
 * Starts a real VS Code with a private profile, so a run never touches the maintainer's settings
 * or extensions.
 *
 * Why it exists: the failures this tool looks for depend on user settings (autosave, format on
 * save, editor associations). Each scenario writes the settings it needs into a fresh user-data
 * directory, installs the packaged `.vsix`, and starts VS Code against it.
 *
 * Invariants:
 * - Only the process this module started is ever stopped, and only by its process id.
 * - The extension under test is installed from the `.vsix`, the artifact users get, not loaded
 *   from the source folder, so a missing file in the package fails here.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

/** Settings that keep a clean profile quiet and deterministic, whatever the scenario adds. */
const BASE_SETTINGS = {
	"workbench.startupEditor": "none",
	"window.restoreWindows": "none",
	"window.newWindowDimensions": "maximized",
	"telemetry.telemetryLevel": "off",
	"update.mode": "none",
	"extensions.autoUpdate": false,
	"extensions.autoCheckUpdates": false,
	"extensions.ignoreRecommendations": true,
	"security.workspace.trust.enabled": false,
	"workbench.enableExperiments": false,
	"workbench.tips.enabled": false,
	"workbench.welcomePage.walkthroughs.openOnInstall": false,
	"git.enabled": false,
	"chat.disableAIFeatures": true,
	"editor.minimap.enabled": false,
};

const MAC_APPS = ["Visual Studio Code - Insiders", "Visual Studio Code"];

/**
 * Finds the VS Code to test with.
 *
 * @param {string} [explicit] - A path given by `--app` or `VSCODE_PATH`
 * @returns {{ executable: string, cli: string, name: string }} The Electron binary and the command-line launcher
 * @throws {Error} When no VS Code is found
 */
function locateApp(explicit) {
	const candidates = [];
	if (explicit) candidates.push(explicit);
	if (process.platform === "darwin") {
		for (const name of MAC_APPS) candidates.push(`/Applications/${name}.app`);
	} else if (process.platform === "linux") {
		candidates.push("/usr/share/code", "/usr/share/code-insiders", "/opt/visual-studio-code");
	}
	for (const candidate of candidates) {
		if (process.platform === "darwin" && candidate.endsWith(".app")) {
			const macos = path.join(candidate, "Contents", "MacOS");
			if (!fs.existsSync(macos)) continue;
			const executable = path.join(macos, fs.readdirSync(macos)[0]);
			const bin = path.join(candidate, "Contents", "Resources", "app", "bin");
			const cli = path.join(bin, fs.readdirSync(bin).find((file) => file.startsWith("code")));
			return { executable, cli, name: path.basename(candidate, ".app") };
		}
		const executable = path.join(candidate, fs.readdirSync(candidate).find((file) => file === "code" || file === "code-insiders") || "code");
		if (fs.existsSync(executable)) return { executable, cli: executable, name: path.basename(candidate) };
	}
	throw new Error("No VS Code found. Pass --app <path to the VS Code app> or set VSCODE_PATH.");
}

/**
 * Finds an installed copy of an extension to reuse, so a scenario can use the real one.
 *
 * @param {string} id - Extension id prefix such as "esbenp.prettier-vscode"
 * @returns {string | undefined} Folder of the newest installed copy
 */
function findInstalledExtension(id) {
	const roots = [".vscode-insiders", ".vscode"].map((dir) => path.join(os.homedir(), dir, "extensions"));
	const found = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
		for (const entry of fs.readdirSync(root)) if (entry.startsWith(`${id}-`)) found.push(path.join(root, entry));
	}
	return found.sort().pop();
}

/**
 * Creates a profile and starts VS Code on a folder.
 *
 * @param {object} options - Launch options
 * @param {{ executable: string, cli: string }} options.app - From locateApp
 * @param {string} options.vsix - Path of the packaged extension
 * @param {object} options.settings - Settings for this scenario, added to BASE_SETTINGS
 * @param {string[]} [options.copyExtensions] - Folders of installed extensions to copy into the profile
 * @param {number} options.port - Debugging port
 * @param {string} options.root - Directory that holds the profile and the workspace
 * @returns {{ workspace: string, userDir: string, extensionsDir: string, child: object, open: Function, stop: Function, settingsPath: string }} The running profile
 */
function launch({ app, vsix, settings, copyExtensions = [], port, root }) {
	const userDir = path.join(root, "user");
	const extensionsDir = path.join(root, "extensions");
	const workspace = path.join(root, "workspace");
	fs.mkdirSync(path.join(userDir, "User"), { recursive: true });
	fs.mkdirSync(extensionsDir, { recursive: true });
	fs.mkdirSync(workspace, { recursive: true });
	const settingsPath = path.join(userDir, "User", "settings.json");
	fs.writeFileSync(settingsPath, JSON.stringify({ ...BASE_SETTINGS, ...settings }, null, 2));
	for (const folder of copyExtensions) fs.cpSync(folder, path.join(extensionsDir, path.basename(folder)), { recursive: true });

	const common = [`--user-data-dir=${userDir}`, `--extensions-dir=${extensionsDir}`];
	const install = spawnSync(app.cli, [...common, "--install-extension", vsix, "--force"], { encoding: "utf8" });
	if (install.status !== 0) throw new Error(`Installing the .vsix failed: ${install.stdout}${install.stderr}`);

	const child = spawn(app.executable, [...common, `--remote-debugging-port=${port}`, "--new-window", "--disable-workspace-trust", "--skip-release-notes", workspace], {
		stdio: "ignore",
	});
	return {
		workspace,
		userDir,
		extensionsDir,
		settingsPath,
		child,
		/** Opens a file in the running window the way `code file` does after startup. */
		open(file) {
			spawnSync(app.executable, [...common, "--reuse-window", file], { stdio: "ignore" });
		},
		stop() {
			try {
				child.kill("SIGTERM");
			} catch {
				// The process already exited.
			}
		},
	};
}

module.exports = { locateApp, findInstalledExtension, launch };
