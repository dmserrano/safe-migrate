/**
 * Runs commands inside the TARGET runtime (config.runtime.image), not the
 * orchestrator's own Node.
 *
 * config.runtime.services share the RUNNER's network namespace (Docker's --network
 * container:<id>) rather than a bridge network reachable by container name — some
 * target repos hardcode service URLs to "localhost" with no env-var override, which
 * only namespace-sharing satisfies. Undocumented on testcontainers' side but verified
 * empirically: withNetworkMode is a thin pass-through to Docker's own NetworkMode.
 *
 * node_modules is a separate volume layered over the bind-mounted repo, not the
 * host's own node_modules — those are built against the orchestrator's Node ABI, not
 * the target's, and break on native modules. Volume persists per-package across gate
 * calls so repeat installs are fast.
 *
 * Known limitation: service readiness is a fixed grace period, not a health check —
 * config.runtime.services is a generic image list with no structured readiness hint.
 * Revisit with a per-service healthcheck config field if this causes flaky runs.
 */
import crypto from "node:crypto";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import type { SafeMigrateConfig } from "../types.js";

const SERVICE_GRACE_PERIOD_MS = 4000;
// Internal container mount point — not derived from the target repo's own layout.
export const CONTAINER_WORKDIR = "/app";
// Network-namespace anchor only — never runs target code, so not config.runtime.image
// and not config-driven. Small and stable is all that matters here.
const HOLDER_IMAGE = "alpine:3.19";

export interface RuntimeResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

export interface TargetRuntimeSession {
  /** Docker container ID of the runner — usable for `docker exec` from outside this process. */
  containerId: string;
  /** Runs a command in the already-installed runner container. No install prefix. */
  exec(command: string): Promise<RuntimeResult>;
  stop(): Promise<void>;
}

// Starts holder+services+runner and installs once, then stays alive for repeated
// exec() — avoids paying boot+grace+install per command (mutation gate: per mutant).
// Caller must call stop().
export async function startTargetRuntime(
  cwd: string,
  config: SafeMigrateConfig,
): Promise<TargetRuntimeSession> {
  const holder = await new GenericContainer(HOLDER_IMAGE).withCommand(["sleep", "infinity"]).start();
  const netMode = `container:${holder.getId()}`;

  const serviceContainers = await Promise.all(
    (config.runtime.services ?? []).map((image) =>
      new GenericContainer(image).withNetworkMode(netMode).start(),
    ),
  );

  if (serviceContainers.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, SERVICE_GRACE_PERIOD_MS));
  }

  const volumeName = `safe-migrate-node-modules-${hash(cwd)}`;
  const runner = await new GenericContainer(config.runtime.image)
    .withNetworkMode(netMode)
    .withBindMounts([
      { source: cwd, target: CONTAINER_WORKDIR },
      { source: volumeName, target: `${CONTAINER_WORKDIR}/node_modules` },
    ])
    .withWorkingDir(CONTAINER_WORKDIR)
    .withCommand(["sleep", "infinity"])
    .start();

  await exec(runner, config.runtime.install);

  return {
    containerId: runner.getId(),
    exec: (command) => exec(runner, command),
    stop: async () => {
      await runner.stop();
      await Promise.all(serviceContainers.map((c) => c.stop()));
      await holder.stop();
    },
  };
}

// One-shot convenience for gates that only need a single command (green, stable).
export async function runInTargetRuntime(
  command: string,
  cwd: string,
  config: SafeMigrateConfig,
): Promise<RuntimeResult> {
  const session = await startTargetRuntime(cwd, config);
  try {
    return await session.exec(command);
  } finally {
    await session.stop();
  }
}

async function exec(runner: StartedTestContainer, command: string): Promise<RuntimeResult> {
  const result = await runner.exec(["sh", "-c", command]);
  return { ok: result.exitCode === 0, exitCode: result.exitCode, output: result.output };
}

export function hash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}
