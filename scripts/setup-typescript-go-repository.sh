#!/bin/sh
set -eu

repository=${TYPESCRIPT_GO_GIT_REPOSITORY:-.local/git-data/repository.git}

if [ -f "$repository/HEAD" ] && [ -f "$repository/config" ]; then
  echo "Updating TypeScript Go repository at $repository"
  git --git-dir="$repository" fetch \
    --prune \
    origin \
    '+refs/heads/*:refs/heads/*' \
    '+refs/tags/*:refs/tags/*'
else
  if [ -e "$repository" ]; then
    echo "Cannot clone TypeScript Go: $repository exists but is not a bare Git repository" >&2
    exit 1
  fi

  echo "Cloning the complete TypeScript Go repository into $repository"
  mkdir -p "$(dirname "$repository")"
  git clone \
    --bare \
    https://github.com/microsoft/typescript-go.git \
    "$repository"
fi

git --git-dir="$repository" symbolic-ref HEAD refs/heads/main

commit_count=$(git --git-dir="$repository" rev-list --first-parent --count HEAD)
total_commit_count=$(git --git-dir="$repository" rev-list --all --count)
head=$(git --git-dir="$repository" rev-parse HEAD)
echo "TypeScript Go repository ready: $total_commit_count total commits, $commit_count on main's first-parent history, HEAD $head"
