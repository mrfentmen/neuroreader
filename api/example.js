"use strict";

const NeuroReaderAPI = require("./neuroreader-api.js");

const input = "NeuroReader helps readers keep their place. Try the gradient option!";
const html = NeuroReaderAPI.transform(input, {
  gradient: true,
  complexity: true,
  sentence: true,
  color: "#dc2626",
});

console.log(html);
