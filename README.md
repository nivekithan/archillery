# Archillery

My experiment on hosting git using Archil on cloudflare infra. 

It's not done yet and currently 

- it's slow (coldstart are in range of 5 seconds), 
- it's inefficient (it uses 1 container for 1 repo), 
- it does not scale (it does not support read replica). 

I am working on fixing all of these things and maybe even build a nicer web ui instead of cgit 

## Local development

Local development uses Wrangler's container runtime and the same Dockerfile,
Apache configuration, and entrypoint as production. Docker must be running.
Set `ARCHIL_API_KEY` and `GIT_PASSWORD` in `apps/worker/.dev.vars`, then start:

```sh
pnpm dev
```

The local stack uses these ports:

- Web application: `3000`
- Worker: `8787`

Create a repository through the application before pushing to it. Local
repository data is stored on an Archil disk; the local Durable Object state is
separate from production.

To keep a complete local bare copy of TypeScript Go for development tools:

```sh
pnpm setup:typescript-go
```

The setup command clones all branches, tags, and reachable history from
Microsoft's `typescript-go` repository into
`.local/git-data/repository.git`. This copy is not automatically mounted into
Wrangler's containers.
