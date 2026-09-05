#!/bin/sh
set -eu

repository=${1:?repository path is required}
hooks_dir="$repository/hooks"
hook="$hooks_dir/post-receive"

mkdir -p "$hooks_dir"
cat > "$hook" <<'EOF'
#!/bin/sh
set -eu

git_dir=$(git rev-parse --git-dir)
lock="$git_dir/hooks/default-branch.lock"
if ! mkdir "$lock" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$lock"' EXIT

head_ref=$(git symbolic-ref --quiet HEAD 2>/dev/null || true)
if [ -n "$head_ref" ] && git show-ref --verify --quiet "$head_ref"; then
  exit 0
fi

zero_oid=0000000000000000000000000000000000000000
while read -r _old_oid new_oid ref; do
  case "$ref" in
    refs/heads/*)
      if [ "$new_oid" != "$zero_oid" ]; then
        git symbolic-ref HEAD "$ref"
        exit 0
      fi
      ;;
  esac
done
EOF
chmod 755 "$hook"

head_ref=$(git --git-dir="$repository" symbolic-ref --quiet HEAD 2>/dev/null || true)
if [ -n "$head_ref" ] && git --git-dir="$repository" show-ref --verify --quiet "$head_ref"; then
  exit 0
fi

default_branch=""
for candidate in main master; do
  if git --git-dir="$repository" show-ref --verify --quiet "refs/heads/$candidate"; then
    default_branch=$candidate
    break
  fi
done

if [ -z "$default_branch" ]; then
  default_branch=$(git --git-dir="$repository" for-each-ref \
    --format='%(refname:short)' --sort=refname refs/heads | head -n 1)
fi

if [ -n "$default_branch" ]; then
  git --git-dir="$repository" symbolic-ref HEAD "refs/heads/$default_branch"
fi
