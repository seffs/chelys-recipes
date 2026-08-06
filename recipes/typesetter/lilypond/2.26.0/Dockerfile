ARG LILYPOND_VERSION=2.26.0

FROM ghcr.io/texlyre/chelys-typeset-bridge:1 AS bridge

FROM debian:bookworm-slim

ARG LILYPOND_VERSION

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates curl tar gzip \
    python3 \
    fluidsynth fluid-soundfont-gm \
    lame \
    ghostscript \
    fonts-texgyre fonts-dejavu fonts-liberation fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fL -o /tmp/lilypond.tar.gz \
    "https://gitlab.com/lilypond/lilypond/-/releases/v${LILYPOND_VERSION}/downloads/lilypond-${LILYPOND_VERSION}-linux-x86_64.tar.gz" \
    && tar -xzf /tmp/lilypond.tar.gz -C /opt \
    && rm /tmp/lilypond.tar.gz \
    && ln -s /opt/lilypond-${LILYPOND_VERSION}/bin/lilypond /usr/local/bin/lilypond \
    && ln -s /opt/lilypond-${LILYPOND_VERSION}/bin/musicxml2ly /usr/local/bin/musicxml2ly \
    && ln -s /opt/lilypond-${LILYPOND_VERSION}/bin/midi2ly /usr/local/bin/midi2ly \
    && ln -s /opt/lilypond-${LILYPOND_VERSION}/bin/abc2ly /usr/local/bin/abc2ly \
    && lilypond --version

COPY --from=bridge /opt/chelys /opt/chelys

COPY engine.cjs /opt/chelys/engine.cjs
RUN chmod 0444 /opt/chelys/engine.cjs

ENV WS_PORT=7050
ENV CACHE_DIR=/workspace/.cache
ENV ENGINE_ADAPTER=/opt/chelys/engine.cjs
ENV ENGINE_TIMEOUT=300000
ENV LILYPOND_BIN=lilypond
ENV FLUIDSYNTH_BIN=fluidsynth
ENV LAME_BIN=lame
ENV PYTHON_BIN=python3
ENV SOUNDFONT=/usr/share/sounds/sf2/FluidR3_GM.sf2

WORKDIR /workspace

EXPOSE 7050

ENTRYPOINT ["/opt/chelys/bin/node", "/opt/chelys/bridge.cjs"]
