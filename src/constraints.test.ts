import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConstraints, ConstraintId } from "./constraints.js";

test("a clean test passes with no violations", () => {
  const src = `
    import { render, screen } from '@testing-library/react';
    test('renders', () => {
      render(<Foo />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  `;
  const result = checkConstraints(src);
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("flags an Enzyme import", () => {
  const result = checkConstraints(`import { shallow } from 'enzyme';`);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.id === ConstraintId.NoEnzyme));
});

test("flags toMatchSnapshot", () => {
  const result = checkConstraints(`test('x', () => { expect(x).toMatchSnapshot(); });`);
  assert.ok(result.violations.some((v) => v.id === ConstraintId.NoSnapshots));
});

test("flags .state() and .instance() as internals", () => {
  const state = checkConstraints(`wrapper.state();`);
  const instance = checkConstraints(`wrapper.instance();`);
  assert.ok(state.violations.some((v) => v.id === ConstraintId.NoInternals));
  assert.ok(instance.violations.some((v) => v.id === ConstraintId.NoInternals));
});

test("flags jest.mock() of the module under test, by basename", () => {
  const result = checkConstraints(`jest.mock('../../src/utils/urls');`, { modulePath: "src/utils/urls.js" });
  assert.ok(result.violations.some((v) => v.id === ConstraintId.NoSelfMock));
});

test("does not flag jest.mock() of an unrelated module", () => {
  const result = checkConstraints(`jest.mock('../../src/utils/social');`, { modulePath: "src/utils/urls.js" });
  assert.equal(result.violations.some((v) => v.id === ConstraintId.NoSelfMock), false);
});

test("flags waitFor with an empty callback", () => {
  const result = checkConstraints(`test('x', async () => { await waitFor(() => {}); });`);
  assert.ok(result.violations.some((v) => v.id === ConstraintId.NoEmptyWaitFor));
});

test("does not flag waitFor with a real assertion inside", () => {
  const result = checkConstraints(`test('x', async () => { await waitFor(() => expect(x).toBe(1)); });`);
  assert.equal(result.violations.some((v) => v.id === ConstraintId.NoEmptyWaitFor), false);
});

test("a keyword inside a string or comment is not a false positive", () => {
  // Regression guard for the exact thing constraints.ts's own docstring warns about —
  // this is an AST pass, not regex, so these should never match.
  const result = checkConstraints(`
    // don't use enzyme here
    const msg = "please don't call .state() on this";
    test('x', () => { expect(1).toBe(1); });
  `);
  assert.equal(result.ok, true);
});

test("unparseable source reports a parse-error violation", () => {
  const result = checkConstraints(`this is not valid javascript {{{`);
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].id, ConstraintId.ParseError);
});
