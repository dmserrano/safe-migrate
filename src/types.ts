/** Shared shapes across the pipeline. Config is user-authored (safemigrate.config.js)
 * and not itself migrated to TS — kept loose with an index signature rather than
 * pretending to fully pin down a schema that's still being discovered per-repo. */

/** Repo under test. All other config paths (testGlob, etc.) are relative to this root. */
export interface TargetConfig {
  root: string;
  package: string;
  testGlob: string;
  [key: string]: unknown;
}

export interface RuntimeConfig {
  image: string;
  services?: string[];
  install: string;
  testCommand: string;
  [key: string]: unknown;
}

export interface MigrationConfig {
  upgrades: string[];
  [key: string]: unknown;
}

export interface AgentConfig {
  provider: string;
  maxTokensPerModule?: number;
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
  target: TargetConfig;
  runtime: RuntimeConfig;
  migration: MigrationConfig;
  agent: AgentConfig;
  gates: GatesConfig;
  output?: OutputConfig;
  [key: string]: unknown;
}

export interface ImportSummary {
  specifier: string;
  exportsUsed: string[];
}

export interface Context {
  modulePath: string;
  source: string | null;
  imports: ImportSummary[];
  /** Content of a sibling test file, if one exists, as a conventions exemplar. */
  conventions: string | null;
  /** Path (relative to the package root) of the module's OWN existing test, if any.
   * Excluded from context by construction — see ticket 04's design note: this field
   * marks what to exclude, the caller of generateTest is responsible for also
   * physically moving it out of the working tree before invoking an agentic provider. */
  ownTestPath: string | null;
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
