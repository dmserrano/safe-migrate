/**
 * GATE 7 — is the test deterministic?
 *
 * Agent-generated tests are prone to async/timing flakiness. A flaky test is worse
 * than no test: it trains the team to ignore red.
 */
import type { Gate } from "../../types.js";

export const gateStable: Gate = async (source, ctx, config) => {
  // TODO(M2): run gateGreen config.gates.stabilityRuns times; require identical results.
  // Cheap to add once green works — do it at M2, not later.
  return { ok: true }; // no-op until M2
};
