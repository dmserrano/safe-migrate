import assert from "node:assert/strict";
import { test } from "node:test";
import { add, isEven } from "../src/math.js";

test("add sums two numbers", () => {
  assert.equal(add(2, 3), 5);
});

test("isEven detects even and odd", () => {
  assert.equal(isEven(4), true);
  assert.equal(isEven(3), false);
});
