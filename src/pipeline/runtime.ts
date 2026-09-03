/**
 * Runs a command inside the TARGET runtime (config.runtime.image), not the
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
import { GenericContainer } from "testcontainers";
import type { SafeMigrateConfig } from "../types.js";

const SERVICE_GRACE_PERIOD_MS = 4000;
// Internal container mount point — not derived from the target repo's own layout.
const CONTAINER_WORKDIR = "/app";

export interface RuntimeResult {
  ok: boolean;
  exitCode: number;
  output: string;
}

export async function runInTargetRuntime(
  command: string,
  cwd: string,
  config: SafeMigrateConfig,
): Promise<RuntimeResult> {
  const holder = await new GenericContainer("alpine:3.19").withCommand(["sleep", "infinity"]).start();
  const netMode = `container:${holder.getId()}`;

  const serviceContainers = await Promise.all(
    (config.runtime.services ?? []).map((image) =>
      new GenericContainer(image).withNetworkMode(netMode).start(),
    ),
  );

  try {
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

    try {
      const result = await runner.exec(["sh", "-c", `${config.runtime.install} && ${command}`]);
      return { ok: result.exitCode === 0, exitCode: result.exitCode, output: result.output };
    } finally {
      await runner.stop();
    }
  } finally {
    await Promise.all(serviceContainers.map((c) => c.stop()));
    await holder.stop();
  }
}

function hash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}
