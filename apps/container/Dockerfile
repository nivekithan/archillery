# syntax=docker/dockerfile:1

FROM debian:bookworm-slim

ARG ARCHIL_CLIENT_VERSION=0.8.30-1786758716

RUN apt-get update \
    && apt-get install -y --no-install-recommends apache2 ca-certificates cgit curl git tini \
    && a2enmod cgi rewrite \
    && ARCHIL_CLIENT_VERSION="$ARCHIL_CLIENT_VERSION" ARCHIL_SKIP_IAM_CHECK=1 \
       sh -c 'curl -fsSL https://archil.com/install | sh' \
    && rm -rf /var/lib/apt/lists/*

COPY apache.conf /etc/apache2/sites-available/000-default.conf
COPY entrypoint.sh /usr/local/bin/git-container-entrypoint

RUN chmod +x /usr/local/bin/git-container-entrypoint \
    && printf 'ok\n' > /var/www/html/ping

EXPOSE 3000
STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/git-container-entrypoint"]
