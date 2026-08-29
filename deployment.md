# Deployment

The Archil sandbox runs the Git gateway and metadata service from the image
configured by `ARCHIL_SANDBOX_IMAGE` in `apps/worker/wrangler.jsonc`. Publish a
new image before deploying the Worker whenever code under
`apps/container` or `apps/git-metadata-service` changes.

## Prerequisites

- Docker Buildx is available.
- Docker is authenticated to GHCR with permission to push
  `ghcr.io/nivekithan/archillery`.
- Wrangler is authenticated to the production Cloudflare account.
- The Worker secrets `GIT_PASSWORD` and `ARCHIL_API_KEY` are configured.

## Publish the sandbox image

Use the Git commit as the image tag so the published image can be traced back
to its source. The worktree should be clean before building.

```sh
git status --short
IMAGE_TAG=$(git rev-parse --short=12 HEAD)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --file apps/container/Dockerfile \
  --tag "ghcr.io/nivekithan/archillery:${IMAGE_TAG}" \
  --push \
  .
```

Inspect the published image and copy the top-level manifest digest:

```sh
docker buildx imagetools inspect "ghcr.io/nivekithan/archillery:${IMAGE_TAG}"
```

Update `ARCHIL_SANDBOX_IMAGE` in `apps/worker/wrangler.jsonc` to pin the image
by that digest:

```json
"ARCHIL_SANDBOX_IMAGE": "ghcr.io/nivekithan/archillery@sha256:<manifest-digest>"
```

Do not configure production with a mutable tag such as `latest`. The commit tag
is useful for discovery, while the digest guarantees that every new sandbox
uses the exact image that was verified.

Regenerate the Worker environment types after changing the Wrangler value:

```sh
pnpm --filter @git-cloudflare/worker cf-typegen
```

## Verify and deploy

Run the full build, then deploy the Worker before the web application because
the web application calls it through a service binding.

```sh
pnpm build
pnpm --filter @git-cloudflare/worker deploy
pnpm --filter @git-cloudflare/web deploy
```

The updated image is used when Archil creates a new sandbox. Sandboxes that are
already running continue using their original image until they are replaced.
