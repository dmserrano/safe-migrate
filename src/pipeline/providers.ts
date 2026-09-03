/**
 * Provider dispatch for the generate step. Every provider returns `{source, tokens}`,
 * no gate cares which one produced it. CLI over SDK for both (see PRD § Open
 * questions) — this step only needs prompt-in/text-out.
 *
 * Not symmetric, and that's load-bearing:
 *
 * - `claude-cli`: `--tools ""` alone isn't enough — on large prompts the model
 *   hallucinates tool use it doesn't have (fabricated `yarn mocha` output, invented
 *   "prompt injection" findings; found live, 2 of 4 real Winds modules). Fixed with
 *   `--append-system-prompt` stating flatly there are no tools. `--restricted` alone
 *   is also not enough — it doesn't strip Edit/Write.
 * - `copilot-cli` (`gh copilot`): agentic by design, writes output to a file rather
 *   than returning text — why generate.ts's own-test move-aside/restore is required,
 *   not defense in depth. Needs `--allow-all-tools` (no TTY to approve) and
 *   `--allow-all-paths` (else writes get silently skipped). The scratch path must be
 *   ABSOLUTE — a relative one resolves against the git repo ROOT, not this
 *   process's cwd (found live — wrote outside `target.package` entirely).
 */
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import type { SafeMigrateConfig } from "../types.js";

export interface ProviderResult {
  source: string;
  tokens?: number;
}

export async function runProvider(
  prompt: string,
  cwd: string,
  config: SafeMigrateConfig,
): Promise<ProviderResult> {
  switch (config.agent.provider) {
    case "claude-cli":
      return runClaudeCli(prompt, cwd);
    case "copilot-cli":
      return runCopilotCli(prompt, cwd);
    default:
      throw new Error(
        `Unknown agent.provider "${config.agent.provider}". Implemented: claude-cli, copilot-cli. ` +
          `claude-sdk/copilot-sdk are named in config types but not yet implemented.`,
      );
  }
}

const NO_TOOLS_SYSTEM_PROMPT =
  "You have NO tools available in this session, not even read-only ones. Do not " +
  "attempt to use any tool, run any command, or reference reading/writing any file. " +
  "Respond with ONLY the test file source code, wrapped in a single code block, and " +
  "nothing else.";

async function runClaudeCli(prompt: string, cwd: string): Promise<ProviderResult> {
  const { stdout } = await execa(
    "claude",
    ["-p", "--tools", "", "--append-system-prompt", NO_TOOLS_SYSTEM_PROMPT, "--output-format", "json", prompt],
    { cwd },
  );

  const parsed = JSON.parse(stdout) as {
    result?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const source = extractCodeBlock(parsed.result ?? "");
  const tokens = (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0);
  return { source, tokens: tokens || undefined };
}

async function runCopilotCli(prompt: string, cwd: string): Promise<ProviderResult> {
  const scratchAbs = path.join(cwd, `.safe-migrate-scratch-${Date.now()}-${Math.random().toString(36).slice(2)}.test.js`);

  const fullPrompt =
    `${prompt}\n\nWrite the complete test file content to a NEW file at exactly this ` +
    `ABSOLUTE path: ${scratchAbs}\n` +
    `Do not create, modify, or delete any other file.`;

  await execa("gh", ["copilot", "-p", fullPrompt, "--allow-all-tools", "--allow-all-paths"], { cwd });

  try {
    const source = await fs.readFile(scratchAbs, "utf8");
    // gh copilot does not expose token usage in non-interactive mode as of this
    // writing — tokens stays undefined rather than a fabricated number.
    return { source, tokens: undefined };
  } finally {
    await fs.rm(scratchAbs, { force: true });
  }
}

function extractCodeBlock(text: string): string {
  const match = text.match(/```(?:[a-z]*)\n([\s\S]*?)```/);
  return match ? match[1] : text.trim();
}
