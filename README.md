# Archillery

My experiment on hosting git using Archil on cloudflare infra. 

It's not done yet and currently 

- it's slow (coldstart are in range of 5 seconds), 
- it's inefficient (it uses 1 container for 1 repo), 
- it does not scale (it does not support read replica). 

I am working on fixing all of these things and maybe even build a nicer web ui instead of cgit 

## Local development

Local development runs Git smart HTTP and the metadata API without creating an
Archil sandbox. Start the full stack with Turbo:

```sh
pnpm dev
```

The local stack uses these ports:

- Web application: `3000`
- Git gateway: `3002`
- Worker: `8787`

The gateway stores a bare repository in the `git-data` Docker volume. Push to
any valid local repository route to populate it. The username is `nivekithan`
and the password is `GIT_PASSWORD` from `apps/worker/.dev.vars`.

```sh
git push http://localhost:8787/nivekithan/archil-local.git main
```

Compose Watch restarts the metadata service when its Go source changes,
restarts Apache when its local configuration changes, and rebuilds the gateway
when the Dockerfile changes. Repository creation and deletion endpoints return
`501` in local gateway mode because the local stack provides one persistent
development repository.
