# Vale LS

Vale LS (`vale-ls`) exposes [Vale](https://vale.sh/), a configurable prose style
linter, through the Language Server Protocol. Chelys connects to it over a
WebSocket proxy (`lsp-ws-proxy`).

Vale focuses on editorial consistency rather than general-purpose grammar. It
uses a `.vale.ini` configuration and style packages to enforce rules such as
terminology, voice, spelling, and project-specific writing conventions.

## Versions

| Version | Vale LS | Image |
| --- | --- | --- |
| `0.5.1` | 0.5.1 | `ghcr.io/texlyre/chelys-recipe-vale-ls:0.5.1` |

The Dockerfile pins the upstream Git tag through `ARG VALE_LS_VERSION`,
defaulted to the version directory it sits in. Vale LS manages the Vale CLI it
uses at run time unless its configuration points at another Vale binary.

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `wsPort` | Port the WebSocket proxy listens on | `7005` |
| `configPath` | Absolute path to a `.vale.ini`; blank uses normal discovery | blank |
| `syncOnStartup` | Run `vale sync` when the server starts | `true` |

## Modes

- **System**: builds `vale-ls` from its pinned Git tag and installs
  `lsp-ws-proxy` via Cargo. This requires a Rust toolchain and the native build
  prerequisites needed by Vale LS.
- **Docker**: builds Vale LS and the proxy in separate Rust stages, then copies
  the binaries into a slim runtime with Docutils, Asciidoctor, and `mdx2vast`
  for the markup formats that need external processors.
- **Connect**: attach to a Vale LS WebSocket proxy already listening on
  `${wsPort}`.

## File types

The recipe registers the markup formats Vale supports directly: Markdown, MDX,
reStructuredText, AsciiDoc, HTML, and plain text. A useful Vale setup normally
includes a `.vale.ini` and one or more styles; use `configPath` when the server
should use a configuration outside its normal discovery path.

## Notes

- `syncOnStartup` is passed as a Vale LS initialization option and defaults to
  the upstream behaviour.
- Vale LS can install and update its managed Vale CLI. The Docker runtime keeps
  CA certificates for those HTTPS downloads and `vale sync`, and includes the
  external processors Vale uses for reStructuredText, AsciiDoc, and MDX.
- Vale is complementary to LTeX LS Plus: Vale is strongest at configurable
  editorial rules and team style guides, while LTeX is aimed at spelling and
  grammar across TeX-oriented document formats.
