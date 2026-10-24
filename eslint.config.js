const js = require("@eslint/js");

module.exports = [
	{
		ignores: ["node_modules/**", "dist/**"],
	},
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: 2020,
			sourceType: "commonjs",
			globals: {
				console: "readonly",
				process: "readonly",
				Buffer: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				exports: "writable",
				module: "writable",
				require: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
			},
		},
		rules: {
			...js.configs.recommended.rules,
			indent: ["error", "tab"],
			"linebreak-style": ["error", "unix"],
			quotes: ["error", "double", { avoidEscape: true }],
			semi: ["error", "always"],
			"no-unused-vars": ["warn"],
			"no-console": "off",
		},
	},
	{
		// The webview bundle is ES modules that run in a browser, not CommonJS in Node.
		files: ["src/webview/**/*.js"],
		languageOptions: {
			sourceType: "module",
			globals: {
				document: "readonly",
				window: "readonly",
				acquireVsCodeApi: "readonly",
				__webpack_public_path__: "writable",
				__webpack_nonce__: "writable",
			},
		},
	},
];
