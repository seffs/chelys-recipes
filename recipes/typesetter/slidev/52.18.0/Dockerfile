ARG SLIDEV_VERSION=52.18.0
ARG PLAYWRIGHT_VERSION=1.61.1

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

ARG SLIDEV_VERSION
ARG NPM_PACKAGES="${npmPackages}"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
    @slidev/cli@${SLIDEV_VERSION} \
    @slidev/types@${SLIDEV_VERSION} \
    @slidev/theme-default@latest \
    @slidev/theme-seriph@latest \
    @slidev/theme-apple-basic@latest \
    @slidev/theme-bricks@latest \
    @slidev/theme-shibainu@latest \
    playwright-chromium@${PLAYWRIGHT_VERSION} \
    ${NPM_PACKAGES}

RUN root="$(npm root -g)" \
    && mkdir -p /workspace/node_modules/@slidev \
    && for pkg in "$root"/@slidev/* "$root"/slidev-theme-* "$root"/slidev-addon-*; do \
    if [ -d "$pkg" ]; then \
    case "$pkg" in \
    "$root"/@slidev/*) target="/workspace/node_modules/@slidev/$(basename "$pkg")" ;; \
    *) target="/workspace/node_modules/$(basename "$pkg")" ;; \
    esac; \
    ln -sfn "$pkg" "$target"; \
    fi; \
    done

COPY --from=bridge /opt/chelys /opt/chelys

COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7044
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=180000
ENV SLIDEV_BIN=slidev
ENV PYTHON_BIN=python3

WORKDIR /workspace

EXPOSE 7044

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
