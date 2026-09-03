/**
 * Constraint rules for generated tests. AST-based, not regex — a constraint keyword
 * inside a string/comment shouldn't false-positive. Checked before the test ever runs.
 */
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { Context } from "./types.js";

// avoid typo-prone duplicate id strings
export const ConstraintId = {
  NoEnzyme: "no-enzyme",
  NoSnapshots: "no-snapshots",
  NoInternals: "no-internals",
  NoSelfMock: "no-self-mock",
  NoEmptyWaitFor: "no-empty-waitfor",
  ParseError: "parse-error", // not in CONSTRAINTS — synthetic, parse failure only
} as const;
export type ConstraintId = (typeof ConstraintId)[keyof typeof ConstraintId];

export interface ConstraintDef {
  id: ConstraintId;
  reason: string;
}

export const CONSTRAINTS: ConstraintDef[] = [
  {
    id: ConstraintId.NoEnzyme,
    reason: "Enzyme has no React 18 support; breaks during the migration by construction.",
  },
  {
    id: ConstraintId.NoSnapshots,
    reason: "Snapshots break on any markup change, including harmless ones.",
  },
  {
    id: ConstraintId.NoInternals,
    reason: "Assertions on component internals are coupled to the framework version.",
  },
  {
    id: ConstraintId.NoSelfMock,
    reason: "Mocking the module under test means the test exercises the mock.",
  },
  {
    id: ConstraintId.NoEmptyWaitFor,
    reason: "waitFor without an assertion inside is a common false-pass.",
  },
];

/** jest.mock() args are specifiers, not full paths — compare by basename. */
function moduleStem(modulePath: string): string {
  const base = modulePath.split("/").pop() ?? modulePath;
  return base.replace(/\.[jt]sx?$/, "");
}

export function checkConstraints(
  src: string,
  ctx: Partial<Context> = {},
): { ok: boolean; violations: ConstraintDef[] } {
  let ast: t.File;
  try {
    ast = parse(src, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
  } catch (err) {
    return {
      ok: false,
      violations: [{ id: ConstraintId.ParseError, reason: `Source failed to parse: ${(err as Error).message}` }],
    };
  }

  const violated = new Set<ConstraintId>();
  const modStem = ctx.modulePath ? moduleStem(ctx.modulePath) : null;

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value === "enzyme") violated.add(ConstraintId.NoEnzyme);
    },
    CallExpression(path) {
      const callee = path.node.callee;

      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        const prop = callee.property.name;
        if (prop === "toMatchSnapshot" || prop === "toMatchInlineSnapshot") {
          violated.add(ConstraintId.NoSnapshots);
        }
        if (prop === "state" || prop === "instance") {
          violated.add(ConstraintId.NoInternals);
        }
      }

      if (
        modStem &&
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object, { name: "jest" }) &&
        t.isIdentifier(callee.property, { name: "mock" })
      ) {
        const arg = path.node.arguments[0];
        if (t.isStringLiteral(arg) && arg.value.includes(modStem)) {
          violated.add(ConstraintId.NoSelfMock);
        }
      }

      if (t.isIdentifier(callee, { name: "waitFor" })) {
        const arg = path.node.arguments[0];
        if (
          arg &&
          (t.isArrowFunctionExpression(arg) || t.isFunctionExpression(arg)) &&
          t.isBlockStatement(arg.body) &&
          arg.body.body.length === 0
        ) {
          violated.add(ConstraintId.NoEmptyWaitFor);
        }
      }
    },
  });

  const violations = CONSTRAINTS.filter((c) => violated.has(c.id));
  return { ok: violations.length === 0, violations };
}
