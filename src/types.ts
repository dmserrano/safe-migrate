/** Shared shapes across the pipeline. Config is user-authored (safemigrate.config.js)
 * and not itself migrated to TS — kept loose with an index signature rather than
 * pretending to fully pin down a schema that's still being discovered per-repo. */

export interface RuntimeConfig {
  image: string;
  [key: string]: unknown;
}

export interface MigrationConfig {
  upgrades: string[];
  [key: string]: unknown;
}

export interface AgentConfig {
  provider: string;
  [key: string]: unknown;
}

export interface GatesConfig {
  maxGenerationAttempts: number;
  stabilityRuns: number;
  mutationScoreThreshold: number;
  [key: string]: unknown;
}

export interface OutputConfig {
  reportDir?: string;
  rejectionLog?: string;
  [key: string]: unknown;
}

export interface SafeMigrateConfig {
  runtime: RuntimeConfig;
  migration: MigrationConfig;
  agent: AgentConfig;
  gates: GatesConfig;
  output?: OutputConfig;
  package?: string;
  testCommand?: string;
  [key: string]: unknown;
}

export interface Context {
  modulePath: string;
  source: string | null;
  imports: unknown[];
  conventions: unknown;
}

export interface GateResult {
  ok: boolean;
  detail?: string;
  violations?: Array<{ id: string; reason: string }>;
}

export interface GateFailure extends GateResult {
  gate: string;
}

export interface Attempt {
  source: string;
  tokens?: number;
  failure: GateFailure | null;
}

export type TargetStatus = "accepted" | "rejected";

export interface TargetResult {
  target: string;
  status: TargetStatus;
  source?: string;
  attempts: Attempt[];
  tokens?: number;
  reason?: GateFailure;
}

export type Gate = (
  source: string,
  ctx: Context,
  config: SafeMigrateConfig,
) => Promise<GateResult>;
