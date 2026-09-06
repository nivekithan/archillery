#!/bin/sh
set -eu

repository=/var/lib/git/repository.git
git_password=${GIT_PASSWORD:-local-development-token}

mkdir -p /var/lib/git

if [ ! -f "$repository/HEAD" ] || [ ! -f "$repository/config" ]; then
  echo "Creating local Git repository"
  chown www-data:www-data /var/lib/git
  runuser -u www-data -- git init --bare --initial-branch=main "$repository"
  runuser -u www-data -- git --git-dir="$repository" config http.receivepack true
fi
htpasswd -bc /etc/apache2/origin.htpasswd origin "$git_password"

set +u
. /etc/apache2/envvars
set -u

mkdir -p /run/lock "$APACHE_RUN_DIR" "$APACHE_LOCK_DIR"
chown "$APACHE_RUN_USER:$APACHE_RUN_GROUP" "$APACHE_RUN_DIR" "$APACHE_LOCK_DIR"

apache2ctl configtest
echo "Starting local Git gateway on port 3000"
exec apache2ctl -D FOREGROUND
