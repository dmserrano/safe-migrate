/**
 * Constraint rules enforced on generated tests.
 *
 * These exist because a test coupled to framework internals breaks during the migration
 * it was supposed to protect — worse than having no test at all.
 *
 * Checked statically BEFORE the test is ever run (cheap gate first). AST-based (not
 * regex) so a constraint keyword inside a string literal or comment doesn't
 * false-positive — e.g. a test asserting on the LITERAL STRING "toMatchSnapshot" should
 * not be rejected for using snapshots.
 */
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { Context } from "./types.js";

export interface ConstraintDef {
  id: string;
  reason: string;
}

export const CONSTRAINTS: ConstraintDef[] = [
  {
    id: "no-enzyme",
    reason: "Enzyme has no React 18 support; breaks during the migration by construction.",
  },
  {
    id: "no-snapshots",
    reason: "Snapshots break on any markup change, including harmless ones.",
  },
  {
    id: "no-internals",
    reason: "Assertions on component internals are coupled to the framework version.",
  },
  {
    id: "no-self-mock",
    reason: "Mocking the module under test means the test exercises the mock.",
  },
  {
    id: "no-empty-waitfor",
    reason: "waitFor without an assertion inside is a common false-pass.",
  },
];

/** jest.mock() args are import specifiers, not full repo-relative paths — compare by
 * basename (no extension), not exact-path equality against ctx.modulePath. */
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
      violations: [{ id: "parse-error", reason: `Source failed to parse: ${(err as Error).message}` }],
    };
  }

  const violated = new Set<string>();
  const modStem = ctx.modulePath ? moduleStem(ctx.modulePath) : null;

  traverse(ast, {
    ImportDeclaration(path) {
      if (path.node.source.value === "enzyme") violated.add("no-enzyme");
    },
    CallExpression(path) {
      const callee = path.node.callee;

      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        const prop = callee.property.name;
        if (prop === "toMatchSnapshot" || prop === "toMatchInlineSnapshot") {
          violated.add("no-snapshots");
        }
        if (prop === "state" || prop === "instance") {
          violated.add("no-internals");
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
          violated.add("no-self-mock");
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
          violated.add("no-empty-waitfor");
        }
      }
    },
  });

  const violations = CONSTRAINTS.filter((c) => violated.has(c.id));
  return { ok: violations.length === 0, violations };
}
