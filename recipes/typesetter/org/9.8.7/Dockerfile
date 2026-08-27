ARG TEXLIVE_TAG=latest-full
ARG ORG_VERSION=9.8.7

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM texlive/texlive:${TEXLIVE_TAG}

ARG ORG_VERSION

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    emacs-nox \
    latexmk \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/org \
    && curl -fL -o /tmp/org.tar "https://elpa.gnu.org/packages/org-${ORG_VERSION}.tar" \
    && tar -xf /tmp/org.tar -C /opt/org --strip-components=1 \
    && rm -f /tmp/org.tar \
    && emacs -Q --batch -L /opt/org \
        --eval "(progn (require 'org) (princ (org-version)))"

COPY --from=bridge /opt/chelys /opt/chelys

COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7049
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=300000
ENV EMACS_BIN=emacs
ENV ORG_LISP_DIR=/opt/org
ENV LATEXMK_BIN=latexmk

WORKDIR /workspace

EXPOSE 7049

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
