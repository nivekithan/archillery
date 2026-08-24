#!/bin/sh
set -eu

: "${ARCHIL_DISK_ID:?ARCHIL_DISK_ID is required}"
: "${ARCHIL_MOUNT_TOKEN:?ARCHIL_MOUNT_TOKEN is required}"
: "${ARCHIL_REGION:?ARCHIL_REGION is required}"
: "${ORIGIN_TOKEN:?ORIGIN_TOKEN is required}"

repository=/var/lib/git/repository.git
mounted=false
apache_pid=""
git_metadata_service_pid=""

cleanup() {
  status=$?

  trap - EXIT
  trap '' TERM INT

  if [ -n "$git_metadata_service_pid" ] && kill -0 "$git_metadata_service_pid" 2>/dev/null; then
    echo "Stopping Git metadata service"
    kill -TERM "$git_metadata_service_pid" 2>/dev/null || true
    wait "$git_metadata_service_pid" || true
  fi

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
echo "Mounting Archil disk"
archil mount "$ARCHIL_DISK_ID" /var/lib/git --region "$ARCHIL_REGION"
mounted=true

chown www-data:www-data /var/lib/git

echo "Preparing Git repository"
if [ ! -f "$repository/HEAD" ]; then
  runuser -u www-data -- git init --bare --initial-branch=main "$repository"
  runuser -u www-data -- git --git-dir="$repository" config core.fsync all
  runuser -u www-data -- git --git-dir="$repository" config core.fsyncMethod fsync
  runuser -u www-data -- git --git-dir="$repository" config http.receivepack true
fi

htpasswd -bc /etc/apache2/origin.htpasswd origin "$ORIGIN_TOKEN"

echo "Starting Git metadata service on port 3001"
runuser -u www-data -- env \
  GIT_METADATA_SERVICE_ADDRESS=127.0.0.1:3001 \
  GIT_REPOSITORY_PATH="$repository" \
  /usr/local/bin/git-metadata-service &
git_metadata_service_pid=$!

set +u
. /etc/apache2/envvars
set -u
echo "Preparing Apache runtime"
mkdir -p /run/lock
mkdir -p "$APACHE_RUN_DIR" "$APACHE_LOCK_DIR"
chown "$APACHE_RUN_USER:$APACHE_RUN_GROUP" "$APACHE_RUN_DIR" "$APACHE_LOCK_DIR"
apache2ctl configtest

echo "Starting Git smart HTTP service on port 3000"
apache2ctl -D FOREGROUND &
apache_pid=$!

apache_status=0
wait "$apache_pid" || apache_status=$?
echo "Apache exited with status $apache_status"
if [ "$apache_status" -ne 0 ] && [ -r "$APACHE_LOG_DIR/error.log" ]; then
  cat "$APACHE_LOG_DIR/error.log" >&2
fi
exit "$apache_status"
