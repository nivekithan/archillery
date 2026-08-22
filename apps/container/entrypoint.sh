#!/bin/sh
set -eu

: "${ARCHIL_DISK_NAME:?ARCHIL_DISK_NAME is required}"
: "${ARCHIL_MOUNT_TOKEN:?ARCHIL_MOUNT_TOKEN is required}"
: "${ARCHIL_REGION:?ARCHIL_REGION is required}"

repository=/var/lib/git/repository.git
mounted=false
apache_pid=""

cleanup() {
  status=$?

  trap - EXIT
  trap '' TERM INT

  if [ -n "$apache_pid" ] && kill -0 "$apache_pid" 2>/dev/null; then
    echo "Stopping Apache"
    if ! apache2ctl -k graceful-stop; then
      echo "Graceful Apache shutdown failed; sending SIGTERM" >&2
      kill -TERM "$apache_pid" 2>/dev/null || true
    fi
    wait "$apache_pid" || true
  fi

  if [ "$mounted" = true ]; then
    echo "Unmounting Archil disk"
    if ! archil unmount /var/lib/git; then
      echo "Failed to unmount Archil disk" >&2
      status=1
    fi
  fi

  exit "$status"
}

trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

mkdir -p /var/lib/git
archil mount "$ARCHIL_DISK_NAME" /var/lib/git --region "$ARCHIL_REGION"
mounted=true

if [ ! -d "$repository" ]; then
  git init --bare --initial-branch=main "$repository"
fi

git -C "$repository" config core.fsync all
git -C "$repository" config core.fsyncMethod fsync
git -C "$repository" config http.receivepack true
chown -R www-data:www-data /var/lib/git

set +u
. /etc/apache2/envvars
set -u

apache2 -D FOREGROUND &
apache_pid=$!

apache_status=0
wait "$apache_pid" || apache_status=$?
exit "$apache_status"
