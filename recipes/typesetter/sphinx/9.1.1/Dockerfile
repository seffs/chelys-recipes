ARG TEXLIVE_TAG=latest-full
ARG SPHINX_VERSION=9.1.1

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM texlive/texlive:${TEXLIVE_TAG}

ARG SPHINX_VERSION
ARG PYTHON_PACKAGES="${pythonPackages}"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    graphviz \
    default-jre-headless \
    pandoc \
    imagemagick \
    librsvg2-bin \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
    latexmk \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/sphinx \
    && /opt/sphinx/bin/pip install --no-cache-dir \
    "sphinx==${SPHINX_VERSION}" \
    myst-parser \
    myst-nb \
    linkify-it-py \
    sphinx-rtd-theme \
    furo \
    pydata-sphinx-theme \
    sphinx-book-theme \
    sphinxcontrib-bibtex \
    sphinxcontrib-plantuml \
    sphinxcontrib-mermaid \
    sphinxcontrib-svg2pdfconverter \
    sphinx-copybutton \
    sphinx-design \
    sphinx-tabs \
    sphinx-togglebutton \
    sphinx-autodoc-typehints \
    sphinx-autobuild \
    nbsphinx \
    ipykernel \
    matplotlib \
    ${PYTHON_PACKAGES} \
    && /opt/sphinx/bin/sphinx-build --version

COPY --from=bridge /opt/chelys /opt/chelys

COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7048
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=900000
ENV SPHINX_BUILD_BIN=/opt/sphinx/bin/sphinx-build
ENV PYTHON_BIN=/usr/bin/python3

WORKDIR /workspace

EXPOSE 7048

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
