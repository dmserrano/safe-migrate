import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore, type MutantResult } from "./mutation.js";

function mutant(status: string, id = "0"): MutantResult {
  return { id, status, mutatorName: "Test", location: { start: { line: 1, column: 1 } } };
}

test("all killed scores 1", () => {
  const result = computeScore([mutant("Killed"), mutant("Timeout")]);
  assert.equal(result.score, 1);
  assert.equal(result.covered, 2);
  assert.equal(result.killed, 2);
});

test("all survived scores 0", () => {
  const result = computeScore([mutant("Survived"), mutant("Survived")]);
  assert.equal(result.score, 0);
  assert.equal(result.survived.length, 2);
});

test("mixed results score the fraction killed", () => {
  const result = computeScore([mutant("Killed"), mutant("Survived"), mutant("Survived"), mutant("Survived")]);
  assert.equal(result.score, 0.25);
  assert.equal(result.covered, 4);
  assert.equal(result.killed, 1);
});

test("no mutants scores 0, not NaN", () => {
  assert.equal(computeScore([]).score, 0);
});

test("Ignored mutants are dropped from the denominator", () => {
  const result = computeScore([mutant("Killed"), mutant("Ignored"), mutant("Ignored")]);
  assert.equal(result.covered, 1);
  assert.equal(result.score, 1);
});

test("NoCoverage is dropped from the covered denominator but still reported as survived", () => {
  // The command test runner never actually emits NoCoverage (see mutation.ts's
  // comment) — this locks in the intended behavior in case that changes.
  const result = computeScore([mutant("Killed"), mutant("NoCoverage")]);
  assert.equal(result.covered, 1);
  assert.equal(result.survived.length, 1);
});
