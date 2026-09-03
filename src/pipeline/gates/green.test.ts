import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeToFile, globBaseDir } from "./green.js";

test("scopeToFile substitutes a literal glob match", () => {
  const scoped = scopeToFile('npx jest "test/**/*.js"', "test/**/*.js", "test/foo.generated.js");
  assert.equal(scoped, 'npx jest "test/foo.generated.js"');
});

test("scopeToFile appends the path when the glob isn't literally present", () => {
  const scoped = scopeToFile("npx jest", "test/**/*.js", "test/foo.generated.js");
  assert.equal(scoped, "npx jest test/foo.generated.js");
});

test("globBaseDir stops at the first wildcard segment", () => {
  assert.equal(globBaseDir("test/**/*.js"), "test");
  assert.equal(globBaseDir("src/components/**/*.test.tsx"), "src/components");
});

test("globBaseDir with no wildcard returns the whole path", () => {
  assert.equal(globBaseDir("test/utilities"), "test/utilities");
});

test("globBaseDir with a wildcard in the first segment falls back to '.'", () => {
  assert.equal(globBaseDir("*.test.js"), ".");
});
