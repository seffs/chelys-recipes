ARG RUBY_VERSION=3.4
ARG ASCIIDOCTOR_VERSION=2.0.26
ARG ASCIIDOCTOR_PDF_VERSION=2.3.24

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM ruby:${RUBY_VERSION}-bookworm

ARG ASCIIDOCTOR_VERSION
ARG ASCIIDOCTOR_PDF_VERSION
ARG GEM_PACKAGES="${gemPackages}"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    graphviz \
    default-jre-headless \
    pandoc \
    ghostscript \
    imagemagick \
    librsvg2-bin \
    python3 python3-pygments \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN gem install --no-document \
    asciidoctor:${ASCIIDOCTOR_VERSION} \
    asciidoctor-pdf:${ASCIIDOCTOR_PDF_VERSION} \
    asciidoctor-epub3 \
    asciidoctor-revealjs \
    asciidoctor-diagram \
    asciidoctor-bibtex \
    asciidoctor-reducer \
    rouge \
    coderay \
    pygments.rb \
    rghost \
    ${GEM_PACKAGES} \
    && asciidoctor --version \
    && asciidoctor-pdf --version

COPY --from=bridge /opt/chelys /opt/chelys

COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7047
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=300000
ENV ASCIIDOCTOR_BIN=asciidoctor
ENV ASCIIDOCTOR_PDF_BIN=asciidoctor-pdf
ENV ASCIIDOCTOR_EPUB_BIN=asciidoctor-epub3
ENV ASCIIDOCTOR_REVEALJS_BIN=asciidoctor-revealjs
ENV PANDOC_BIN=pandoc

WORKDIR /workspace

EXPOSE 7047

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
