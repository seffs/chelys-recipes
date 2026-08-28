ARG PROXY_RUST_VERSION=1.68.2
ARG RUST_VERSION=1.98.0
ARG DEBIAN_VERSION=bookworm

FROM rust:${PROXY_RUST_VERSION}-bullseye AS proxy-builder

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse

RUN cargo install lsp-ws-proxy --locked --root /out


FROM rust:${RUST_VERSION}-${DEBIAN_VERSION} AS vale-ls-builder

ARG VALE_LS_VERSION=0.5.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install \
    --git https://github.com/vale-cli/vale-ls.git \
    --tag v${VALE_LS_VERSION} \
    --locked \
    --root /out


FROM debian:${DEBIAN_VERSION}-slim

ARG MDX2VAST_VERSION=0.5.0
ARG VALE_VERSION=3.9.1
ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    asciidoctor \
    nodejs \
    npm \
    python3-docutils \
    && npm install -g mdx2vast@${MDX2VAST_VERSION} \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
    arm64) VALE_ARCH=arm64 ;; \
    *) VALE_ARCH=64-bit ;; \
    esac \
    && curl -fsSL "https://github.com/errata-ai/vale/releases/download/v${VALE_VERSION}/vale_${VALE_VERSION}_Linux_${VALE_ARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin vale \
    && chmod +x /usr/local/bin/vale

ENV WS_PORT=7005

COPY --from=vale-ls-builder /out/bin/vale-ls /usr/local/bin/vale-ls
COPY --from=proxy-builder /out/bin/lsp-ws-proxy /usr/local/bin/lsp-ws-proxy
RUN chmod +x /usr/local/bin/vale-ls \
    && chmod +x /usr/local/bin/lsp-ws-proxy

WORKDIR /workspace

RUN printf '%s\n' \
    'StylesPath = styles' \
    'MinAlertLevel = suggestion' \
    'Packages = proselint, write-good' \
    '' \
    '[formats]' \
    'tex = md' \
    '' \
    '[*]' \
    'BasedOnStyles = Vale, proselint, write-good' \
    > /workspace/.vale.ini \
    && vale sync

EXPOSE 7005

ENTRYPOINT ["sh", "-c", "exec lsp-ws-proxy -l 0.0.0.0:$WS_PORT -- vale-ls"]
