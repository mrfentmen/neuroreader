"use strict";

const fs = require("fs");
const path = require("path");

const tag = process.argv[2] || "";
const version = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "extensions", "chrome", "manifest.json"), "utf8")).version;
const tagMatch = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
if (!tagMatch) throw new Error(`Release tag must look like v1.2.3, received: ${tag || "(missing)"}`);
if (tagMatch[1] !== version) throw new Error(`Release tag ${tag} does not match Chrome manifest version ${version}`);
console.log(`Release version verified: ${tag}`);
