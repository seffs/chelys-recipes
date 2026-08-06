ARG TEXLIVE_TAG=latest-full
ARG QUARTO_VERSION=1.10.18

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM texlive/texlive:${TEXLIVE_TAG}

ARG QUARTO_VERSION
ARG INCLUDE_R="${includeR}"
ARG R_PACKAGES="${rPackages}"
ARG PYTHON_PACKAGES="${pythonPackages}"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    python3 python3-venv \
    chromium \
    graphviz \
    ghostscript \
    imagemagick \
    librsvg2-bin \
    fonts-noto fonts-noto-cjk fonts-noto-color-emoji \
    && if [ "${INCLUDE_R}" = "true" ]; then \
    apt-get install -y --no-install-recommends \
    r-base-core r-cran-knitr r-cran-rmarkdown r-cran-jsonlite ${R_PACKAGES}; \
    fi \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fL -o /tmp/quarto.deb \
    "https://github.com/quarto-dev/quarto-cli/releases/download/v${QUARTO_VERSION}/quarto-${QUARTO_VERSION}-linux-amd64.deb" \
    && dpkg -i /tmp/quarto.deb \
    && rm /tmp/quarto.deb \
    && quarto --version

RUN python3 -m venv /opt/quarto-python \
    && /opt/quarto-python/bin/pip install --no-cache-dir \
    PyYAML \
    jupyter-core \
    jupyter-client \
    nbclient \
    nbformat \
    ipykernel \
    matplotlib \
    pandas \
    numpy \
    plotly \
    tabulate \
    ${PYTHON_PACKAGES}

COPY --from=bridge /opt/chelys /opt/chelys

COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7049
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=900000
ENV QUARTO_BIN=quarto
ENV QUARTO_PYTHON=/opt/quarto-python/bin/python
ENV QUARTO_CHROMIUM=/usr/bin/chromium
ENV XDG_CACHE_HOME=/workspace/.cache

WORKDIR /workspace

EXPOSE 7049

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]