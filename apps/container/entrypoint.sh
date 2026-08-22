#!/bin/sh
set -eu

repository=/var/lib/git/repository.git

mkdir -p /var/lib/git

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
exec apache2 -D FOREGROUND
