# TeX Live (Typesetter)

Compiles LaTeX `.tex` documents to PDF with a full [TeX Live](https://tug.org/texlive/)
installation and exposes the engine to TeXlyre over a local WebSocket compile
bridge.

The Docker image layers TeX Live full, Node, and the shared
[Chelys typesetter bridge](../../../bridge/1/README.md) with a LaTeX-specific
engine adapter (`engine.cjs`).

## latexmk drives the build

The adapter does not call the engine directly. It runs `latexmk`, which
orchestrates the full multi-pass build: it reruns the selected engine until
references and the table of contents stabilise, and invokes `biber`, `bibtex`,
and `makeindex` when the document needs them. The engine is chosen per compile
rather than per install, so the same container serves pdfLaTeX, LuaLaTeX, and
XeLaTeX.

## Bundled tools

The image is the full TeX Live scheme plus the external programs LaTeX packages
commonly shell out to:

- Pygments for `minted`
- Inkscape for `svg`
- gnuplot for `gnuplottex`
- Ghostscript and ImageMagick for image conversion
- a headless JRE for `asymptote`
- Noto fonts, including CJK and colour emoji

Shell escape is enabled by default so those packages work. Disable it from the
compile panel for untrusted documents.

## Modes

- **Docker** (recommended): builds an image containing TeX Live, the tools
  above, and the bridge.
- **Connect**: point TeXlyre at an existing bridge you run yourself.

## Variables

- `wsPort`: port the compile bridge listens on (default `7045`).

## Options

- **LaTeX Engine**: `pdflatex`, `lualatex`, or `xelatex`.
- **Bibliography**: `latexmk` auto-detects the right program; override to force
  Biber or BibTeX.
- **Shell escape**: passes `-shell-escape`. Required by minted, svg, and
  gnuplottex.
- **Include log file**: export the build log alongside the PDF.

## SyncTeX

`-synctex=1` is always passed, and the generated `.synctex.gz` is returned
beside the PDF as a downloadable artifact, which is what drives forward and
reverse search in the TeXlyre PDF viewer.

## Incremental sync

`typeConfig.incrementalSync` is enabled. The bridge keeps a per-connection
working tree and reconciles it against the manifest TeXlyre sends with each
request, so only changed files are transferred after the first compile, and
`latexmk`'s auxiliary files survive between builds. The tree is discarded when
the socket closes or when TeXlyre requests a cache clear.
