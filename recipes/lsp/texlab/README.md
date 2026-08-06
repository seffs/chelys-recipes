# TexLab (LaTeX)

TexLab is a language server for LaTeX and BibTeX. It provides diagnostics,
completion, hover, go-to-definition, references, document symbols, and
formatting for `.tex` and `.bib` files. It speaks LSP over stdio, so Chelys
connects to it through a WebSocket proxy (`lsp-ws-proxy`):

```
TeXlyre  ⇄ WebSocket ⇄  lsp-ws-proxy  ⇄ stdio ⇄  texlab
```

## Variables

| Key | Description | Default |
| --- | --- | --- |
| `wsPort` | Port the WebSocket proxy listens on | `7031` |

Editable from the Chelys GUI after installing and re-applied on every run.

## Modes

- **System**: builds `texlab` from the tagged source and installs
  `lsp-ws-proxy` with `cargo` (requires the Rust toolchain), then runs the
  proxy against `texlab`. Uninstalling removes the Cargo-installed binary.
- **Docker**: bundles the prebuilt TexLab release binary and the proxy in a
  Debian image, publishing `${wsPort}`. No host toolchain needed.
- **Connect**: attach to a proxy already listening on `${wsPort}`.

## Notes

- TexLab indexes the packages a project uses to produce completion, so the
  first index of a large project can take a moment.
- Build-related features such as forward and inverse search or `chktex`
  diagnostics are currently not supported.
- Changing `wsPort` updates the run command, Docker port mapping, and the
  `transportUrl` Chelys injects into TeXlyre.
