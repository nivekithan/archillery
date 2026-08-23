# Git Browser

Repository-scoped HTTP API that returns the default branch of a bare Git
repository.

## Development

```sh
GIT_REPOSITORY_PATH=/path/to/repository.git pnpm dev
```

Configuration:

| Variable | Default | Description |
| --- | --- | --- |
| `GIT_REPOSITORY_PATH` | `/var/lib/git/repository.git` | Bare repository path |
| `GIT_BROWSER_ADDRESS` | `:3001` | HTTP listen address |
| `GIT_COMMAND_TIMEOUT` | `10s` | Timeout for each Git command |

## Endpoints

- `GET /api/v1/repository`

Response:

```json
{"defaultBranch":"main"}
```
