# syntax=docker/dockerfile:1

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends apache2 ca-certificates git tini \
    && a2enmod cgi rewrite \
    && rm -rf /var/lib/apt/lists/*

COPY apache.conf /etc/apache2/sites-available/000-default.conf
COPY entrypoint.sh /usr/local/bin/git-container-entrypoint

RUN chmod +x /usr/local/bin/git-container-entrypoint \
    && printf 'ok\n' > /var/www/html/ping

EXPOSE 8080
STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/git-container-entrypoint"]
