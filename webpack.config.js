const path = require("path");
const PROD = process.env.NODE_ENV === "production";
const LEGACY = process.env.LEGACY === "true";
const MINIMIZE = process.env.MINIMIZE === "true";
const hostname = "localhost";
const port = 8080;

let filename = "[name]";
if (LEGACY) filename += ".legacy";
if (MINIMIZE) filename += ".min";
filename += ".js";
let sourceMapFilename = filename + ".map";

module.exports = {
	mode: process.env.NODE_ENV,
	entry: {
		epub: "./src/epub.js",
	},
	devtool: MINIMIZE ? false : "source-map",
	output: {
		path: path.resolve("./dist"),
		filename: filename,
		sourceMapFilename: sourceMapFilename,
		library: "ePub",
		libraryTarget: "umd",
		libraryExport: "default",
		publicPath: "/dist/",
	},
	optimization: {
		minimize: MINIMIZE,
	},
	externals: {
		"jszip/dist/jszip": "JSZip",
		xmldom: "xmldom",
	},
	plugins: [],
	resolve: {
		alias: {
			path: "path-webpack",
		},
	},
	devServer: {
		host: hostname,
		port: port,
		inline: true,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET,PUT,POST,DELETE",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: "babel-loader",
					options: {
						presets: [
							[
								"@babel/preset-env",
								{
									targets: LEGACY
										? "defaults"
										: "last 2 Chrome versions, last 2 Safari versions, last 2 ChromeAndroid versions, last 2 iOS versions, last 2 Firefox versions, last 2 Edge versions",
									corejs: 3,
									useBuiltIns: "usage",
									bugfixes: true,
									modules: false,
								},
							],
						],
					},
				},
			},
		],
	},
	performance: {
		hints: false,
	},
};
