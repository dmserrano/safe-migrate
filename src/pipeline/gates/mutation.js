/**
 * GATE 6 — does the test actually CATCH anything?
 *
 * THE differentiating gate. Coverage measures lines executed; mutation testing
 * measures defects detected. An agent can trivially produce 200 passing tests that
 * catch nothing, and coverage will not tell you.
 *
 * Scope Stryker to the single module under test. Whole-repo mutation testing is
 * prohibitively slow.
 *
 * M3. This is the milestone that makes the project worth showing.
 */
export async function gateMutation(source, ctx, config) {
  // TODO(M3):
  //   - stryker run --mutate <ctx.modulePath> --testRunner jest
  //   - parse mutation score
  //   - compare against config.gates.mutationScoreThreshold
  //   - on reject, record WHICH mutants survived — that detail is the interesting part
  //     of the write-up and the thing that proves the gate is real
  throw new Error("gateMutation not implemented — M3");
}
