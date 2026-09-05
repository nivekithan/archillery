import { Archil, ArchilApiError, type Sandbox } from "disk";
import { DurableObject } from "cloudflare:workers";
import z from "zod";

import { requestGitGateway } from "./git-gateway";

const SERVICE_READY_TIMEOUT_MS = 30_000;
const SERVICE_READY_POLL_INTERVAL_MS = 250;

const GitGatewaySchema = z.object({
  hostname: z.string().nonempty(),
});

const SandboxStateSchema = z.object({
  sandboxId: z.string().nonempty(),
  hostname: z.string().nonempty(),
  verifiedAt: z.number().int().nonnegative().optional(),
});

const RepositoryConfigSchema = z.object({
  diskId: z.string().nonempty(),
  mountToken: z.string().nonempty(),
  repoName: z.string().nonempty(),
  repoUsername: z.string().nonempty(),
});

export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>;

const CREATE_GIT_GATEWAY_COMMAND = [
  "archil-sandbox services create",
  '--env ARCHIL_DISK_ID="$ARCHIL_DISK_ID"',
  '--env ARCHIL_MOUNT_TOKEN="$ARCHIL_MOUNT_TOKEN"',
  '--env ARCHIL_REGION="$ARCHIL_REGION"',
  '--env ORIGIN_TOKEN="$ORIGIN_TOKEN"',
  '--env REPO_NAME="$REPO_NAME"',
  '--env REPO_USERNAME="$REPO_USERNAME"',
  "--tcp-port 3000",
  "git -- /usr/local/bin/git-container-entrypoint",
].join(" ");

export class GitRepository extends DurableObject<CloudflareBindings> {
  private static readonly MAX_TTL = 60 * 60 * 8;
  private static readonly ACTIVITY_WRITE_INTERVAL_MS = 30 * 1000;
  private static readonly SANDBOX_VERIFICATION_TTL_MS = 10 * 60 * 1000;
  private static readonly REPOSITORY_CONFIG_KEY = "REPOSITORY_CONFIG";
  private static readonly SANDBOX_STATE_KEY = "SANDBOX_STATE";
  private static readonly LAST_PING_KEY = "LAST_PING";

  private readonly archil: Archil;
  private readonly idleTimeoutMs: number;
  private pendingGitGateway: Promise<string> | null;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    this.archil = new Archil({
      apiKey: env.ARCHIL_API_KEY,
      region: env.ARCHIL_REGION,
    });
    this.idleTimeoutMs = env.GIT_IDLE_TIMEOUT_SECONDS * 1000;
    this.pendingGitGateway = null;
  }

  initializeRepository(config: RepositoryConfig) {
    const parsedConfig = RepositoryConfigSchema.parse(config);
    this.ctx.storage.kv.put(
      GitRepository.REPOSITORY_CONFIG_KEY,
      JSON.stringify(parsedConfig),
    );
  }

  getRepositoryConfig() {
    return this.readRepositoryConfig();
  }

  async getGitGatewayHost() {
    const config = this.readRepositoryConfig();
    if (!config) return null;

    const { diskId, repoName, repoUsername } = config;
    console.info("Resolving Git sandbox", { diskId, repoName, repoUsername });
    const pendingGitGateway = (this.pendingGitGateway ??=
      this.resolveGitGateway(config));

    let hostname: string;
    try {
      hostname = await pendingGitGateway;
    } finally {
      if (this.pendingGitGateway === pendingGitGateway) {
        this.pendingGitGateway = null;
      }
    }

    this.recordActivity();
    return hostname;
  }

  async recoverGitGatewayIfMissing() {
    const config = this.readRepositoryConfig();
    if (!config) return;

    const pendingGitGateway = (this.pendingGitGateway ??=
      this.resolveGitGateway(config, true));
    try {
      await pendingGitGateway;
      this.recordActivity();
    } finally {
      if (this.pendingGitGateway === pendingGitGateway) {
        this.pendingGitGateway = null;
      }
    }
  }

  private async resolveGitGateway(
    config: RepositoryConfig,
    forceVerification = false,
  ) {
    const currentSandbox = this.getSandboxState();

    if (
      currentSandbox &&
      !forceVerification &&
      currentSandbox.verifiedAt &&
      Date.now() - currentSandbox.verifiedAt <
        GitRepository.SANDBOX_VERIFICATION_TTL_MS
    ) {
      console.info("Reusing stored Git sandbox route", {
        hostname: currentSandbox.hostname,
        sandboxId: currentSandbox.sandboxId,
      });
      return currentSandbox.hostname;
    }

    if (currentSandbox) {
      const sandbox = await this.getArchilSandbox(currentSandbox.sandboxId);
      if (sandbox) {
        this.setSandboxState({
          ...currentSandbox,
          verifiedAt: Date.now(),
        });
        return currentSandbox.hostname;
      }

      this.ctx.storage.kv.delete(GitRepository.SANDBOX_STATE_KEY);
    }

    return this.createGitSandbox(config);
  }

  private async createGitSandbox({
    diskId,
    mountToken,
    repoName,
    repoUsername,
  }: RepositoryConfig) {
    console.info("Creating Git sandbox", { diskId, repoName, repoUsername });
    const sandbox = await this.archil.sandboxes.create(
      {
        name: `${repoUsername}-${repoName}`.toLowerCase().replaceAll("_", "-"),
        baseImage: this.env.ARCHIL_SANDBOX_IMAGE,
        vcpuCount: 2,
        memSizeMiB: 4096,
        maxTtlSeconds: GitRepository.MAX_TTL,
      },
      { wait: true },
    );
    console.info("Git sandbox created", {
      sandboxId: sandbox.id,
      status: sandbox.status,
    });

    const hostname = await this.createGitGateway(sandbox, {
      ARCHIL_DISK_ID: diskId,
      ARCHIL_MOUNT_TOKEN: mountToken,
      ARCHIL_REGION: this.env.ARCHIL_REGION,
      ORIGIN_TOKEN: this.env.GIT_PASSWORD,
      REPO_NAME: repoName,
      REPO_USERNAME: repoUsername,
    });

    this.setSandboxState({
      hostname,
      sandboxId: sandbox.id,
      verifiedAt: Date.now(),
    });
    console.info("Git sandbox is ready", {
      hostname,
      sandboxId: sandbox.id,
    });
    return hostname;
  }

  async deleteRepository() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const sandboxState = this.getSandboxState();
      const sandbox = sandboxState
        ? await this.getArchilSandbox(sandboxState.sandboxId)
        : null;

      if (sandbox) {
        if (
          sandbox.status !== "stopped" &&
          sandbox.status !== "exited" &&
          sandbox.status !== "failed"
        ) {
          await sandbox.stop();
        }
        await sandbox.delete();
      }

      await this.ctx.storage.deleteAll();
      console.info("Git repository state deleted", {
        sandboxId: sandboxState?.sandboxId,
      });

      return { sandboxId: sandboxState?.sandboxId ?? null };
    });
  }

  private async createGitGateway(
    sandbox: Sandbox,
    env: Record<string, string>,
  ) {
    try {
      console.info("Creating Git gateway", { sandboxId: sandbox.id });
      const service = await sandbox.exec(CREATE_GIT_GATEWAY_COMMAND, {
        env,
      });
      if (service.status !== "completed" || service.exitCode !== 0) {
        throw new Error(
          `Failed to create Git gateway: ${service.stderr || service.exitReason || `exit code ${String(service.exitCode)}`}`,
        );
      }

      const hostname = GitGatewaySchema.parse(
        JSON.parse(service.stdout),
      ).hostname;
      await this.waitForGitGateway({
        gitGatewayHost: hostname,
        originToken: env.ORIGIN_TOKEN,
      });
      console.info("Git gateway created", {
        hostname,
        sandboxId: sandbox.id,
      });
      return hostname;
    } catch (error) {
      console.error("Failed to create Git gateway", {
        error,
        sandboxId: sandbox.id,
      });
      await this.cleanupIncompleteSandbox(sandbox);
      throw error;
    }
  }

  private async waitForGitGateway({
    gitGatewayHost,
    originToken,
  }: {
    gitGatewayHost: string;
    originToken: string;
  }) {
    const startedAt = Date.now();
    const readyDeadline = startedAt + SERVICE_READY_TIMEOUT_MS;
    let lastStatus: number | undefined;

    while (Date.now() < readyDeadline) {
      try {
        const response = await requestGitGateway({
          request: new Request("https://git-gateway/ping"),
          gitGatewayUrl: `https://${gitGatewayHost}`,
          originToken,
        });
        lastStatus = response.status;
        if (response.ok) {
          console.info("Git gateway is ready", {
            gitGatewayHost,
            readyInMs: Date.now() - startedAt,
          });
          return;
        }
      } catch {
        lastStatus = undefined;
      }
      await scheduler.wait(SERVICE_READY_POLL_INTERVAL_MS);
    }

    throw new Error(
      `Git gateway did not become ready (last status: ${lastStatus ?? "unreachable"})`,
    );
  }

  private async cleanupIncompleteSandbox(sandbox: Sandbox) {
    console.warn("Cleaning up incomplete sandbox", { sandboxId: sandbox.id });
    try {
      await sandbox.stop();
      console.info("Incomplete sandbox stopped", { sandboxId: sandbox.id });
    } catch (error) {
      console.error("Failed to stop incomplete sandbox", error);
    }

    try {
      await sandbox.delete();
      console.info("Incomplete sandbox deleted", { sandboxId: sandbox.id });
    } catch (error) {
      console.error("Failed to delete incomplete sandbox", error);
    }
  }

  private async getArchilSandbox(sandboxId: string) {
    try {
      const res = await this.archil.sandboxes.get(sandboxId);
      return res;
    } catch (error) {
      if (!(error instanceof ArchilApiError) || error.status !== 404) {
        throw error;
      }

      console.warn("Archil sandbox not found", { sandboxId });
      return null;
    }
  }

  async alarm() {
    if (!this.isTimeoutReached()) {
      console.info("Ignoring Git sandbox alarm; repository is active");
      return;
    }

    const sandboxState = this.getSandboxState();

    if (!sandboxState) {
      console.info("Ignoring Git sandbox alarm; no sandbox is stored");
      return;
    }

    console.info("Checking idle Git sandbox", {
      sandboxId: sandboxState.sandboxId,
    });
    const sandbox = await this.getArchilSandbox(sandboxState.sandboxId);

    if (!sandbox) {
      this.ctx.storage.kv.delete(GitRepository.SANDBOX_STATE_KEY);
      console.warn("Idle Git sandbox no longer exists", {
        sandboxId: sandboxState.sandboxId,
      });
      return;
    }

    if (!this.isTimeoutReached()) {
      console.info("Git sandbox became active during alarm", {
        sandboxId: sandbox.id,
      });
      return;
    }

    if (sandbox.status === "pending" || sandbox.status === "running") {
      console.info("Stopping idle Git sandbox", {
        sandboxId: sandbox.id,
        status: sandbox.status,
      });
      await sandbox.stop();
      console.info("Idle Git sandbox stopped", { sandboxId: sandbox.id });
      return;
    }

    console.info("Git sandbox is already inactive", {
      sandboxId: sandbox.id,
      status: sandbox.status,
    });
    return;
  }

  private getSandboxState() {
    const state = this.ctx.storage.kv.get<string | null | undefined>(
      GitRepository.SANDBOX_STATE_KEY,
    );

    return state ? SandboxStateSchema.parse(JSON.parse(state)) : null;
  }

  private setSandboxState(state: z.infer<typeof SandboxStateSchema>) {
    return this.ctx.storage.kv.put(
      GitRepository.SANDBOX_STATE_KEY,
      JSON.stringify(state),
    );
  }

  private readRepositoryConfig() {
    const config = this.ctx.storage.kv.get<string | null | undefined>(
      GitRepository.REPOSITORY_CONFIG_KEY,
    );

    return config ? RepositoryConfigSchema.parse(JSON.parse(config)) : null;
  }

  private recordActivity() {
    const now = Date.now();
    if (
      now - this.getLastPing().getTime() <
      GitRepository.ACTIVITY_WRITE_INTERVAL_MS
    ) {
      return;
    }

    const lastPing = new Date(now);
    const alarmAt = now + this.idleTimeoutMs;
    this.ctx.storage.kv.put(
      GitRepository.LAST_PING_KEY,
      lastPing.toISOString(),
    );
    this.ctx.waitUntil(this.ctx.storage.setAlarm(alarmAt));
    console.info("Git sandbox idle deadline updated", {
      alarmAt: new Date(alarmAt).toISOString(),
    });
  }

  private getLastPing() {
    const ping =
      this.ctx.storage.kv.get<string | undefined | null>(
        GitRepository.LAST_PING_KEY,
      ) ?? new Date(0).toISOString();

    return new Date(ping);
  }

  private isTimeoutReached() {
    const lastPing = this.getLastPing();
    const now = new Date();

    const isTimeoutReached =
      lastPing.getTime() + this.idleTimeoutMs <= now.getTime();

    return isTimeoutReached;
  }
}
