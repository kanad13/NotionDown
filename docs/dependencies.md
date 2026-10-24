# Dependency Management Policy

This page sets the rules for choosing, configuring, and reviewing dependencies. It contains policies only. The files named below record which versions are in use, and [CHANGELOG.md](../CHANGELOG.md) and Git record the history of changes.

## Where Versions Are Defined

Version numbers live only in the files in this table. Documentation refers to the files and never repeats the numbers.

| Kind                           | Examples                                          | Defined in                                                                   |
| :----------------------------- | :------------------------------------------------ | :--------------------------------------------------------------------------- |
| Bundled webview package        | Milkdown Crepe, Mermaid, CodeMirror language data | `dependencies` in `package.json`; resolved version in `package-lock.json`    |
| Build, test, and release tools | webpack, ESLint, `@vscode/vsce`, type packages    | `devDependencies` in `package.json`; resolved version in `package-lock.json` |
| Runtime and editor floors      | Node, VS Code                                     | `engines` in `package.json`                                                  |

The kinds differ in consequence:

- **Bundled package:**
  - Runs in the webview under the Content Security Policy.
  - Parses and renders untrusted Markdown and diagram text.
  - Ships inside the `.vsix`, so there is no network fetch and no CDN.
- **Tool:**
  - Runs only on a developer machine or in CI.

## Version Selection Policy

A version qualifies only if it meets every rule below. Apply the rules the same way to every dependency.

- **Stable channel:**
  - Alpha, beta, rc, canary, `next`, and nightly releases do not qualify.
- **Supported line:**
  - Use the newest major line that still receives fixes.
  - Treat a line with no release for 12 months as abandoned, unless the project declares it feature-complete.
- **Soak time:**
  - A new major version qualifies 30 days after its `.0` release.
  - A minor or patch version qualifies 14 days after its release.
  - The lockfile holds the qualifying version. `npm install <package>@<version>` installs a qualifying version when a newer one has not yet soaked.
- **No known advisories:**
  - `npm audit --omit=dev` reports 0 for the shipped tree.
- **Support policy:**
  - The version runs on the current stable VS Code, on the floor in the Editor Support Policy, and on the Node release in `engines.node`.
  - Confirm by rendering `examples/test.md` and by reading the release notes for browser-baseline changes.
- **Ranges and the lockfile:**
  - npm packages use a caret range, and `package-lock.json` fixes the resolved version.
- **Stable tool majors:**
  - Build tools stay on their current major version.
  - An advisory or an engine requirement is the only reason to change a tool's major version.

## Editor Support Policy

The extension targets the current stable release of VS Code and carries no compatibility code for older editors.

- **Test target:**
  - The current stable VS Code release.
  - Insiders builds are not a target.
- **Floor:**
  - `engines.vscode` names the newest VS Code release that is at least 12 months old.
  - A floor that follows the calendar keeps the extension from depending on legacy editors.
  - A 12-month window still reaches editors that update slowly.
- **Forks:**
  - Cursor, Windsurf, and other forks run an older VS Code base than upstream.
  - A fork refuses to install an extension whose `engines.vscode` is above its base.
  - Check the fork's base version in its About dialog before you raise the floor.
- **Moving the floor:**
  - At each quarterly review, raise `engines.vscode` and the exact `@types/vscode` pin together.
  - Move both to the newest release that is at least 12 months old.
- **Release dates:**
  - Run `npm view @types/vscode time` to list VS Code release dates.

## Node Floor Policy

- **Floor:**
  - `engines.node` names the lowest Node release that every tool in `devDependencies` supports and that still receives security fixes.
  - CI runs `npm test` on exactly that release.
- **Moving the floor:**
  - Raise it when a tool or the Node release schedule requires it, and change the two `node-version` entries in `.github/workflows` in the same commit.

## Configuration Policy

- **Library defaults:**
  - Configure a library with its defaults.
  - Override a setting only for security (for example Mermaid `securityLevel`), for matching the VS Code theme, or for keeping Markdown output stable in Git (for example the list marker and rule style).
  - Never override visual defaults such as diagram layout and look.
- **Browser baseline:**
  - A library qualifies only when its documented browser baseline is met by the Chromium in the floor VS Code release.
  - Read the release notes for baseline changes at every major upgrade.
- **Type package:**
  - Pin `@types/vscode` to the exact version of `engines.vscode`, so the types cannot suggest an API the floor lacks.
  - `vsce` refuses a type version above the engine.
- **Overrides:**
  - Add an `overrides` entry in `package.json` only when no upgrade path clears an advisory.
  - At each review, remove each override, run `npm install` and `npm audit`, and keep the entry only if the audit then reports advisories.
  - Choose the override target by the Version Selection Policy, and check the library that receives it still renders `examples/test.md`.
- **Tool advisories:**
  - An advisory in a tool that does not ship in the `.vsix` does not block a change. Record it in the review report and clear it when an upstream release allows.
- **Content Security Policy:**
  - Keep the CSP strict.
  - Do not add a directive to silence a library's console message.

## Review Procedure

Run the review before every release and at least once per quarter.

```bash
npm audit --omit=dev    # shipped dependencies; must report 0 vulnerabilities
npm audit               # whole tree, including build tools
npm outdated            # candidates to compare against the selection policy
```

1. Run `npm update` for in-range tool updates, then `npm audit fix` for remaining advisories.
2. For each bundled package, run `npm view <package> time` to read recent versions and dates, then apply the selection policy.
3. Rebuild, open the harness described in [testing.md](testing.md#manual-smoke-check), and render `examples/test.md` in a light and a dark theme. Check the slash menu, tables, code blocks, and Mermaid diagrams.
4. Read the release notes before you cross a major version.
5. Apply the Editor Support Policy and the Node Floor Policy, and check whether a floor moves.
6. Run `npm test`, which includes lint and the bundle tests.

## Adding a Dependency

- **Justify it:**
  - [development.md](development.md#dependencies) requires a justification for any new npm dependency.
- **Choose the version:**
  - Apply the selection policy.
  - Check the size of `dist/` after `npm run build`.
- **Keep it out of the entry script:**
  - Load a large library on demand with a dynamic `import()`, as the page does for Mermaid, so the editor opens without parsing it.

## Security Controls and Their Limits

- **Local bundle:**
  - Every script the page runs ships in the `.vsix`, and the Content Security Policy allows only scripts that carry the per-render nonce.
  - The page makes no network request for code.
- **Lockfile:**
  - `package-lock.json` pins the resolved version and its integrity hash, and `npm ci` verifies them.
- **Supply chain:**
  - The bundle trusts the npm registry at install time. `npm audit` reports known advisories and cannot see an unpublished compromise.
- **Remote images:**
  - A document that links an `https` image makes the page fetch it. The Content Security Policy allows `https` images for that reason.
