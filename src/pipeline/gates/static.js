/** GATE 4 — constraint rules. Cheapest gate; runs first. Implemented. */
import { checkConstraints } from "../../constraints.js";

export async function gateStatic(source, ctx) {
  const { ok, violations } = checkConstraints(source, ctx);
  return ok
    ? { ok: true }
    : { ok: false, detail: violations.map((v) => `${v.id}: ${v.reason}`).join("; ") };
}
