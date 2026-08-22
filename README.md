# git-cloudflare

pnpm workspace managed with Turborepo, containing the Cloudflare applications and shared packages for this project.

## Structure

```txt
apps/
  worker/    Cloudflare Worker powered by Hono
packages/    Shared workspace packages
```

## Package roles

- `git-cloudflare` is the private workspace root. It owns dependency installation, the shared lockfile, workspace discovery, and Turbo task orchestration. It does not contain application code.
- `@git-cloudflare/worker` in `apps/worker` is the deployable Cloudflare Worker. It owns the Hono application, Worker TypeScript settings, Wrangler configuration, and Cloudflare lifecycle commands.
- `packages/*` is reserved for reusable libraries or tooling needed by multiple applications. No shared package exists yet, so Worker-specific code remains in `apps/worker`.

Dependencies belong to the package that uses them: `hono` and `wrangler` are declared by `@git-cloudflare/worker`, while `turbo` is declared only by the workspace root.

## Development

Install all workspace dependencies and start the Worker from the repository root:

```sh
pnpm install
pnpm dev
```

Build all workspace packages through Turbo:

```sh
pnpm build
```

Deploy the Worker:

```sh
pnpm deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```sh
pnpm cf-typegen
```

Turbo can also target one package explicitly:

```sh
pnpm turbo run build --filter=@git-cloudflare/worker
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// apps/worker/src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
