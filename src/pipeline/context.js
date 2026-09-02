/**
 * STEP 2 — Context assembly. Retrieval, not generation.
 *
 * Quality of generated tests depends more on this than on prompt wording.
 * Under-supplying context is the most likely cause of bad output at M1/M2.
 */
export async function assembleContext(modulePath, config) {
  // TODO(M2):
  //   - module source
  //   - direct imports (signatures, not full bodies — watch the context budget)
  //   - existing test conventions in the repo, if any (Winds has none; supply an exemplar)
  //   - available fixtures / test utils
  //   - framework versions currently in play (matters: React 16 idioms != React 18)
  return { modulePath, source: null, imports: [], conventions: null };
}
