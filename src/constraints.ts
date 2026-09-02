/**
 * Constraint rules enforced on generated tests.
 *
 * These exist because a test coupled to framework internals breaks during the migration
 * it was supposed to protect — worse than having no test at all.
 *
 * Checked statically BEFORE the test is ever run (cheap gate first).
 *
 * NOTE: regex is a placeholder. Replace with an AST pass (@babel/parser + traverse)
 * before M3 — regex will produce false positives on strings and comments.
 */
import type { Context } from "./types.js";

export interface Constraint {
  id: string;
  reason: string;
  test: (src: string, ctx?: Partial<Context>) => boolean;
}

export const CONSTRAINTS: Constraint[] = [
  {
    id: "no-enzyme",
    reason: "Enzyme has no React 18 support; breaks during the migration by construction.",
    test: (src) => /from ['"]enzyme['"]/.test(src),
  },
  {
    id: "no-snapshots",
    reason: "Snapshots break on any markup change, including harmless ones.",
    test: (src) => /toMatchSnapshot|toMatchInlineSnapshot/.test(src),
  },
  {
    id: "no-internals",
    reason: "Assertions on component internals are coupled to the framework version.",
    test: (src) => /\.(instance|state)\(\)/.test(src),
  },
  {
    id: "no-self-mock",
    reason: "Mocking the module under test means the test exercises the mock.",
    test: (src, ctx) =>
      ctx?.modulePath
        ? new RegExp(`jest\\.mock\\(['"].*${escape(ctx.modulePath)}`).test(src)
        : false,
  },
  {
    id: "no-empty-waitfor",
    reason: "waitFor without an assertion inside is a common false-pass.",
    test: (src) => /waitFor\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(src),
  },
];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkConstraints(
  src: string,
  ctx: Partial<Context> = {},
): { ok: boolean; violations: Array<{ id: string; reason: string }> } {
  const violations = CONSTRAINTS
    .filter((c) => c.test(src, ctx))
    .map(({ id, reason }) => ({ id, reason }));
  return { ok: violations.length === 0, violations };
}
