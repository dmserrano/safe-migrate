/**
 * GATE 5 — does the test pass against current code?
 *
 * Runs inside the TARGET runtime container (config.runtime.image), not the
 * orchestrator's Node. The target runtime is a parameter because upgrading it is
 * itself one of the migrations.
 */
import type { Gate } from "../../types.js";

export const gateGreen: Gate = async (source, ctx, config) => {
  // TODO(M2):
  //   - write test to a temp path in the target repo
  //   - docker run --rm -v <root>:/app -w /app <config.runtime.image> <testCommand>
  //   - parse result; on failure return the error text so generate.js can feed it back
  throw new Error("gateGreen not implemented — M2");
};
