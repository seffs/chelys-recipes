ARG TECTONIC_VERSION=0.17.0

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM debian:bookworm-slim

ARG TECTONIC_VERSION

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
        x86_64) target="x86_64-unknown-linux-musl" ;; \
        aarch64|arm64) target="aarch64-unknown-linux-musl" ;; \
        *) echo "Unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL \
        "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${target}.tar.gz" \
        | tar -xz -C /usr/local/bin tectonic; \
    chmod +x /usr/local/bin/tectonic; \
    tectonic --version

COPY --from=bridge /opt/chelys /opt/chelys
COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7046
ENV CACHE_DIR=/workspace/.cache
ENV TECTONIC_CACHE_DIR=/workspace/.cache/tectonic
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=300000
ENV TECTONIC_BIN=tectonic

WORKDIR /workspace

EXPOSE 7046

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
