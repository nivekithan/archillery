# Git Metadata Service

Repository-scoped HTTP API that returns the default branch and browses its file
tree in a bare Git repository.

## Development

```sh
GIT_REPOSITORY_PATH=/path/to/repository.git pnpm dev
```

Configuration:

| Variable | Default | Description |
| --- | --- | --- |
| `GIT_REPOSITORY_PATH` | `/var/lib/git/repository.git` | Bare repository path |
| `GIT_METADATA_SERVICE_ADDRESS` | `:3001` | HTTP listen address |
| `GIT_COMMAND_TIMEOUT` | `10s` | Timeout for each Git command |

## Endpoints

- `GET /api/v1/repository`
- `GET /api/v1/content?path=<file-or-directory>`

Response:

```json
{"defaultBranch":"main"}
```

Omit `path` to list the repository root. Content tree responses contain the
immediate children of the requested directory:

```json
{"entries":[{"name":"README.md","path":"README.md","type":"blob","size":123}]}
```
