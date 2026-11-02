import { Container } from "@cloudflare/containers";
import z from "zod";

const RepositoryConfigSchema = z.object({
  diskId: z.string().nonempty(),
  mountToken: z.string().nonempty(),
  repoName: z.string().nonempty(),
  repoUsername: z.string().nonempty(),
});

export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>;

export class RepositoryContainer extends Container<CloudflareBindings> {
  defaultPort = 3000;
  sleepAfter = "15m";
  enableInternet = true;
  entrypoint = ["/usr/local/bin/git-container-entrypoint"];

  constructor(ctx: DurableObjectState<{}>, env: CloudflareBindings) {
    super(ctx, env);
    const config = this.getRepositoryConfig();
    if (config) this.configure(config);
  }

  private configure(config: RepositoryConfig) {
    this.sleepAfter = `${this.env.GIT_IDLE_TIMEOUT_SECONDS}s`;
    this.envVars = {
      ARCHIL_DISK_ID: config.diskId,
      ARCHIL_MOUNT_TOKEN: config.mountToken,
      ARCHIL_REGION: this.env.ARCHIL_REGION,
      REPO_NAME: config.repoName,
      REPO_USERNAME: config.repoUsername,
    };
  }

  initializeRepository(config: RepositoryConfig) {
    const parsed = RepositoryConfigSchema.parse(config);
    this.ctx.storage.kv.put("REPOSITORY_CONFIG", parsed);
    this.configure(parsed);
  }

  getRepositoryConfig(): RepositoryConfig | null {
    if (this.ctx.storage.kv.get<boolean>("REPOSITORY_DISABLED")) return null;
    return (
      this.ctx.storage.kv.get<RepositoryConfig>("REPOSITORY_CONFIG") ?? null
    );
  }

  async prewarm() {
    const config = this.getRepositoryConfig();
    if (!config) return null;
    this.configure(config);
    await this.startAndWaitForPorts({
      ports: [3000],
      cancellationOptions: { portReadyTimeoutMS: 120_000 },
    });
    return true;
  }

  async fetch(request: Request) {
    if (!this.getRepositoryConfig())
      return new Response("Repository not found", { status: 404 });
    return super.fetch(request);
  }

  async deleteRepository() {
    return this.ctx.blockConcurrencyWhile(async () => {
      await this.destroy();
      this.ctx.storage.kv.delete("REPOSITORY_CONFIG");
      await this.ctx.storage.deleteAlarm();
      return { sandboxId: null };
    });
  }

  async disableRepository() {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.kv.put("REPOSITORY_DISABLED", true);
      await this.destroy();
      await this.ctx.storage.deleteAlarm();
      return { disabled: true };
    });
  }

  async alarm() {
    if (!this.getRepositoryConfig()) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    return super.alarm();
  }
}
