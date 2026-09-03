/**
 * GATE 7 — is the test deterministic?
 *
 * Agent-generated tests are prone to async/timing flakiness. A flaky test is worse
 * than no test: it trains the team to ignore red.
 */
import { gateGreen } from "./green.js";
import type { Gate } from "../../types.js";

export const gateStable: Gate = async (source, ctx, config) => {
  for (let i = 0; i < config.gates.stabilityRuns; i++) {
    const result = await gateGreen(source, ctx, config);
    if (!result.ok) {
      return { ok: false, detail: `flaky: failed on run ${i + 1}/${config.gates.stabilityRuns}: ${result.detail}` };
    }
  }
  return { ok: true };
};
