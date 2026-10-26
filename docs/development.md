# Development Guide

This guide covers setup, the daily workflow, and the release procedure. [workflows.md](workflows.md) says which procedure fits a request, and [testing.md](testing.md) says how a change is verified.

## Setup

### Install the tools

Local development needs only Node and `npm ci`. Publishing to the Marketplace needs two command-line tools. Open VSX publishing runs in CI and needs no local tool:

```bash
npm install -g @vscode/vsce   # Visual Studio Marketplace
brew install gh               # GitHub CLI
```

### Authenticate for publishing

Local development needs no credentials. Never paste a token into a conversation, a file, or a commit.

- **Marketplace (`vsce`):**
  - Create a Personal Access Token with the scope `Marketplace > Manage`.
  - Run `vsce login KunalPathak`, then check with `vsce ls-publishers`.
  - If the token expires, run `vsce login KunalPathak` again with a new one.
- **Open VSX (CI):**
  - The release workflow publishes to Open VSX. It signs in with a short-lived OIDC token that Open VSX issues to the registered trusted publisher (repository `kanad13/NotionDown`, workflow `release.yml`), so no stored token is needed. The repository secret `OVSX_PAT` is a fallback: when it is set, the workflow uses it instead of OIDC. Delete it after a release has published through OIDC.
  - To publish by hand, export a token from https://open-vsx.org under **Settings > Access Tokens** as `OVSX_PAT`, check it with `npx ovsx verify-pat KunalPathak`, then run `npx ovsx publish <file>.vsix`.
- **GitHub (`gh`):**
  - Run `gh auth login`, then check with `gh auth status`.

> **Deadline:** Microsoft retires global Azure DevOps Personal Access Tokens on 2026-12-01. After that date, authenticate with Microsoft Entra ID and publish with `vsce publish --azure-credential`. Follow the [VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and update this section when the new credential is in place.

### Set up the repository

```bash
git clone https://github.com/kanad13/NotionDown.git
cd NotionDown
npm ci
npm test
```

- **`npm ci`, not `npm install`:**
  - `npm ci` installs the exact versions in `package-lock.json`, so builds are reproducible. Use it for setup and for fixing a broken `node_modules`.
  - Use `npm install` only to add or upgrade a dependency on purpose, and commit the updated lockfile.

## Daily Workflow

1. **Branch:**
   - Work on a feature branch and never commit to `main`: `git checkout -b feat/<name>`.
   - Use the prefixes `feat/`, `fix/`, `docs/`, and `refactor/`.
2. **Change:**
   - Press `F5` to start the Extension Development Host, open `examples/test.md`, and run **Open in NotionDown** from the editor title bar or the Command Palette.
   - Follow the [architecture rules](../AGENTS.md#architecture-rules) and the style rules below.
   - For changes under `src/webview/`, run `npm run build` and `node tools/harness.js` to see the page in a browser without the editor.
3. **Check:**
   - Run `npm test`. It builds the bundle, runs every automated test, and lints. [testing.md](testing.md) explains the suites and the manual smoke check.
   - Run `npm run package` to build the `.vsix`.
   - Run `npm run e2e` after a change to the host, `src/page-sync.js`, the manifest, or the save path. It runs scenarios in a real VS Code with a private profile and opens windows for about three minutes ([testing.md](testing.md#real-vs-code-checks)).
   - Install the build with **Extensions: Install from VSIX...**, or with `code --install-extension notiondown-X.Y.Z.vsix`, to test it in a real editor before the extension is on a registry.
4. **Commit:**
   - Keep commits atomic. Write a concise, imperative subject that says what changed, and add the reason in the body.
   - Add no attribution trailers.
5. **Merge:**
   - Merge into `main` with `git merge --no-ff` after the maintainer approves, then push. Confirm that the CI run on `main` passes.

### README screenshots

- **Regenerate:**
  - Run `node tools/e2e/screenshots.js` after a change to the page's look. It builds the package, opens a private VS Code in a light and a dark theme, and writes six images from [examples/showcase.md](../examples/showcase.md) to `assets/screenshots/`.
- **Check:**
  - Open each image before you commit it.
- **Addresses in the README:**
  - The package ships the images, because the Get Started walkthrough shows them (`contributes.walkthroughs`). The store pages cannot resolve relative paths, so the README names every image and link by absolute address: `https://raw.githubusercontent.com/kanad13/NotionDown/main/...` for images (a `github.com/.../blob/...` address returns a page, not an image) and `https://github.com/kanad13/NotionDown/blob/main/...` for documents. `test/docs.test.js` fails on a relative address or a target that does not exist.
  - The addresses point at `main`, so merge and push the images before you publish.

### Style

- **Enforced by ESLint** (`eslint.config.js`): tab indentation, double quotes, semicolons, `const` and `let` only.
- **`.prettierrc`:** it matches the ESLint rules for editors that format on save. The repository has no formatter script.
- **JSDoc:** every exported function states its purpose, parameters with types, return value, and side effects.
- **Comments:** explain why. Leave no `TODO` comments and no debugging output in shipped code.

### Dependencies

Avoid new npm dependencies, because every one ships in the `.vsix`. When a new one is unavoidable:

1. Justify the need in the change description.
2. Compare the size of `dist/` before and after (`npm run build`).
3. Load a large library on demand with a dynamic `import()`.
4. Choose the version with the rules in [dependencies.md](dependencies.md).

### High-risk areas

[architecture.md](architecture.md#requires-security-review) lists the areas that need a security review: the CSP, nonce generation, the page template, message handling, file access, and Mermaid configuration. Three mistakes recur there:

- **Nonce:**
  - Generate a new nonce with `crypto.randomBytes` on every render. A fixed or reused nonce defeats the CSP.
- **Echo:**
  - A write that the page caused must not return to the page as an `update`. The cursor would jump on every key.
- **Resource roots:**
  - Add a folder to `localResourceRoots` only when the page must read files from it.

## Release to Marketplace

Release only from `main`, only when the maintainer asks, and only after CI passes there. Replace `X.Y.Z` with the new version.

1. **Decide the version:**
   - Use semantic versioning: patch for fixes, minor for backward-compatible features, major for breaking changes.
   - Check that the icon is a PNG between 128 and 1024 pixels square, and that `git status` is clean.
2. **Bump the manifest:**
   - Run `npm version X.Y.Z --no-git-tag-version`. It updates `package.json` and `package-lock.json`, and the flag stops it from creating a tag.
3. **Update `CHANGELOG.md`:**
   - Add a section at the top with the header `## [X.Y.Z] - YYYY-MM-DD`.
   - Use the sections `Added`, `Changed`, and `Fixed`, and list user-facing changes only. Leave out refactors, tests, and build changes. Mention a dependency update only when it fixes a security problem.
4. **Verify from a clean state:**

   ```bash
   rm -rf node_modules
   npm ci
   npm test
   npm audit --omit=dev
   npm run package
   ```

   - Follow the [review procedure](dependencies.md#review-procedure) before each release.

5. **Commit and tag:**

   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore: bump version to X.Y.Z"
   git tag -a vX.Y.Z -m "Release version X.Y.Z"
   ```

   - Use an annotated tag. It must point at the version commit.

6. **Push:**

   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

   - The tag push starts `.github/workflows/release.yml`. It runs the tests, checks that the tag matches `package.json` and `CHANGELOG.md`, builds the `.vsix`, creates the GitHub release, and publishes to Open VSX.
   - If the run fails after the tag exists, fix the cause and start the workflow again from the Actions tab (**Release > Run workflow**, from `main`, with the tag). Open VSX ignores a version it already has, so repeating a run is safe.

7. **Publish to the Marketplace:**
   - Run `npm run publish`. The command builds first.
8. **Verify:**
   - The [Marketplace page](https://marketplace.visualstudio.com/items?itemName=KunalPathak.notiondown) shows the new version (allow 5 to 10 minutes).
   - The release workflow ends green, and its last step confirms the version on Open VSX. `npx ovsx show KunalPathak.notiondown` shows it too.
   - The GitHub release exists with the `.vsix` attached, and CI is green.
