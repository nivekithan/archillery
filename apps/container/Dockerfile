# syntax=docker/dockerfile:1

FROM golang:1.27-bookworm AS git-metadata-service-builder

WORKDIR /src
COPY apps/git-metadata-service/go.mod ./
COPY apps/git-metadata-service/ ./
RUN CGO_ENABLED=0 go build -o /git-metadata-service ./cmd/git-metadata-service

FROM debian:bookworm-slim

ARG ARCHIL_CLIENT_VERSION=0.8.30-1786758716

LABEL org.opencontainers.image.source="https://github.com/nivekithan/archillery" \
      org.opencontainers.image.description="Git smart HTTP and metadata runtime for Archil sandboxes"

RUN apt-get update \
    && apt-get install -y --no-install-recommends apache2 ca-certificates curl git \
    && a2enmod cgi proxy proxy_http rewrite \
    && ARCHIL_CLIENT_VERSION="$ARCHIL_CLIENT_VERSION" ARCHIL_SKIP_IAM_CHECK=1 \
       sh -c 'curl -fsSL https://archil.com/install | sh' \
    && rm -rf /var/lib/apt/lists/*

COPY apps/container/apache.conf /etc/apache2/sites-available/000-default.conf
COPY apps/container/entrypoint.sh /usr/local/bin/git-container-entrypoint
COPY --from=git-metadata-service-builder /git-metadata-service /usr/local/bin/git-metadata-service

RUN chmod +x /usr/local/bin/git-container-entrypoint \
    && printf 'ok\n' > /var/www/html/ping
