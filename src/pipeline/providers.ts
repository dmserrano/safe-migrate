/**
 * Provider dispatch for the generate step. Provider-agnostic by construction: every
 * provider returns `{source, tokens}`, no gate cares which one produced it.
 *
 * Two providers implemented at M2 — CLI over SDK for both, decided at implementation
 * time (see PRD § Open questions): a CLI is zero extra dependency and this step only
 * ever needs "prompt in, text out," which an SDK's finer context control doesn't buy
 * anything for here.
 *
 * The two are NOT symmetric, and that's load-bearing, not an oversight:
 *
 * - `claude-cli` runs with `--restricted` (no Bash/file-write tools) and
 *   `--output-format json`, so it's a genuinely text-in/text-out call — it cannot see
 *   the filesystem beyond what's in the prompt, so no move-aside step is needed for it.
 * - `copilot-cli` (`gh copilot`) requires `--allow-all-tools` to run non-interactively
 *   at all (no TTY to approve tool use otherwise — see NOTES.md) and, observed directly
 *   during the M1 hand-driven pass, writes its output to a file rather than returning
 *   text. It is unavoidably agentic: it can and will explore the filesystem on its own
 *   initiative, which is exactly why the own-test move-aside/restore in generate.ts is
 *   required for this provider (see ticket 04's design note) and load-bearing, not
 *   defense in depth.
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

async function runClaudeCli(prompt: string, cwd: string): Promise<ProviderResult> {
  const { stdout } = await execa(
    "claude",
    ["-p", "--restricted", "--output-format", "json", prompt],
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
  const scratchRelative = `.safe-migrate-scratch-${Date.now()}-${Math.random().toString(36).slice(2)}.test.js`;
  const scratchAbs = path.join(cwd, scratchRelative);

  const fullPrompt =
    `${prompt}\n\nWrite the complete test file content to a NEW file at exactly this ` +
    `path, relative to the repo root you are running in: ${scratchRelative}\n` +
    `Do not create, modify, or delete any other file.`;

  await execa("gh", ["copilot", "-p", fullPrompt, "--allow-all-tools"], { cwd });

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
