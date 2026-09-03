import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleStem } from "./paths.js";

test("moduleStem strips extension and dir", () => {
  assert.equal(moduleStem("src/utils/urls.js"), "urls");
  assert.equal(moduleStem("a/b/c/Article.tsx"), "Article");
  assert.equal(moduleStem("index.ts"), "index");
});

test("moduleStem leaves non-JS-like names alone", () => {
  assert.equal(moduleStem("README.md"), "README.md");
});
