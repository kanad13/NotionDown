//@ts-check

"use strict";

const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

/** @type {import("webpack").Configuration} */
const extensionConfig = {
	name: "extension",
	target: "node",
	mode: "production",
	entry: "./src/extension.js",
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "extension.js",
		libraryTarget: "commonjs2",
		devtoolModuleFilenameTemplate: "../../[resource-path]",
	},
	externals: {
		vscode: "commonjs vscode",
	},
	resolve: {
		extensions: [".js"],
	},
	module: {
		rules: [
			{
				test: /\.html$/,
				type: "asset/source",
			},
		],
	},
	devtool: "nosources-source-map",
	infrastructureLogging: {
		level: "log",
	},
};

// The page cannot load from a CDN: the editor has no CDN build, and a local bundle keeps the
// Content Security Policy free of remote script sources. Lazy chunks (Mermaid, CodeMirror
// languages) load on demand from the same folder; main.js sets the public path at run time.
/** @type {import("webpack").Configuration} */
const webviewConfig = {
	name: "webview",
	target: "web",
	mode: "production",
	entry: "./src/webview/main.js",
	output: {
		path: path.resolve(__dirname, "dist/webview"),
		filename: "main.js",
		chunkFilename: "[name].[contenthash:8].js",
		publicPath: "",
		assetModuleFilename: "assets/[name].[contenthash:8][ext]",
		clean: true,
	},
	resolve: {
		extensions: [".js"],
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				// Crepe marks its package side-effect free, which makes webpack drop its CSS imports.
				sideEffects: true,
				use: [
					MiniCssExtractPlugin.loader,
					{
						loader: "css-loader",
						// KaTeX lists woff2, woff, and ttf for each font. Every Chromium that runs VS Code
						// takes woff2, so the other two would only add about 800 KB to the package.
						options: { url: { filter: (url) => !/\.(woff|ttf)$/.test(url) } },
					},
				],
			},
			{
				test: /\.(woff2?|ttf|eot|svg|png)$/,
				type: "asset/resource",
			},
		],
	},
	optimization: {
		splitChunks: {
			// CodeMirror ships each of its ~140 languages as a separate lazy module. Left alone, webpack
			// emits one file per language and `vsce` warns that the package is not bundled. One shared
			// file keeps every language, and a page loads it only when a code block names a language.
			cacheGroups: {
				codeLanguages: {
					test: /[\\/]node_modules[\\/]@codemirror[\\/](lang-|legacy-modes)/,
					name: "code-languages",
					chunks: "async",
					enforce: true,
				},
			},
		},
	},
	plugins: [new MiniCssExtractPlugin({ filename: "main.css" })],
	performance: { hints: false },
	devtool: false,
	infrastructureLogging: {
		level: "log",
	},
};

module.exports = [extensionConfig, webviewConfig];
