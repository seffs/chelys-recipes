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
    make \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/org \
    && curl -fL -o /tmp/org.tar.gz \
        "https://github.com/bzg/org-mode/archive/refs/tags/release_${ORG_VERSION}.tar.gz" \
    && tar -xzf /tmp/org.tar.gz -C /opt/org --strip-components=1 \
    && rm -f /tmp/org.tar.gz \
    && make -C /opt/org autoloads \
        ORGVERSION="${ORG_VERSION}" \
        GITVERSION="release_${ORG_VERSION}" \
    && emacs -Q --batch -L /opt/org/lisp \
        --eval "(progn (require 'org) (princ (org-version)))"

COPY --from=bridge /opt/chelys /opt/chelys

COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7049
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=300000
ENV EMACS_BIN=emacs
ENV ORG_LISP_DIR=/opt/org/lisp
ENV LATEXMK_BIN=latexmk

WORKDIR /workspace

EXPOSE 7049

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
