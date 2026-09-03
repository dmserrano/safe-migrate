import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "./runtime.js";

test("hash is deterministic", () => {
  assert.equal(hash("/some/path"), hash("/some/path"));
});

test("hash differs for different inputs", () => {
  assert.notEqual(hash("/some/path"), hash("/some/other/path"));
});

test("hash is a short hex string (safe for a docker volume name)", () => {
  assert.match(hash("/some/path"), /^[0-9a-f]{12}$/);
});
