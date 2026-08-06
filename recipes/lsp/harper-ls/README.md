# Harper LS

Harper LS (`harper-ls`) is an offline, privacy-first grammar and spelling
checker exposed as a Language Server. Chelys connects to it over a WebSocket
proxy (`lsp-ws-proxy`).

It is strongest on Markdown and plain text. Markup-heavy formats such as TeX,
LaTeX, Typst, and BibTeX are accepted but parsed as prose, so commands and
entry syntax produce false positives; LTeX LS Plus is the better fit there.

This recipe maps all supported file types to the `markdown` language ID so
Harper LS treats them consistently as prose.

## Versions

| Version | Harper LS | Image |
| --- | --- | --- |
| `2.7.0` | 2.7.0 | `ghcr.io/texlyre/chelys-recipe-harper-ls:2.7.0` |
| `2.5.0` | 2.5.0 | `ghcr.io/texlyre/chelys-recipe-harper-ls:2.5.0` |
| `2.4.0` | 2.4.0 | `ghcr.io/texlyre/chelys-recipe-harper-ls:2.4.0` |

Each Dockerfile pins the crate through `ARG HARPER_VERSION`, defaulted to the
version directory it sits in.

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `wsPort` | Port the WebSocket proxy listens on | `7000` |
| `dialect` | Spelling dialect Harper checks against | `American` |

## Modes

- **System**: installs `harper-ls` and `lsp-ws-proxy` via Cargo (requires the
  Rust toolchain) and runs the proxy against `harper-ls --stdio`. The Cargo
  pipeline is identical on Linux, macOS, and Windows, so no per-OS override is
  needed.
- **Docker**: builds `harper-ls` and the proxy from source in a multi-stage
  image (`Dockerfile`) and publishes `${wsPort}`. No host toolchain needed.
- **Connect**: attach to a Harper server already listening on `${wsPort}`.

## Notes

- If you change `wsPort`, the run command, Docker port mapping, Dockerfile, and
  the injected `transportUrl` all update together.
- Harper provides diagnostics and code actions such as ignoring rules or adding
  words to a dictionary. Dictionary edits are functional but not yet stable in
  TeXlyre.
