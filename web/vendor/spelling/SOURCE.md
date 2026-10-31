# Offline spelling components

The application uses the actual Hunspell C++ engine compiled to WebAssembly,
loaded in a dedicated browser worker. It makes no external requests at runtime.
Dictionary files are read from this directory; none are reduced word lists.
Affix rules from each complete `.aff` file are applied by Hunspell.

| Directory | Original npm package | Version | Source |
| --- | --- | --- | --- |
| `hunspell/` | `hunspell-wasm` | 0.3.0 | https://github.com/rotemdan/hunspell-wasm |
| `pt-BR/` | `dictionary-pt` | 4.0.0 | https://github.com/wooorm/dictionaries/tree/main/dictionaries/pt |
| `pt-PT/` | `dictionary-pt-pt` | 2.0.0 | https://github.com/wooorm/dictionaries/tree/main/dictionaries/pt-PT |
| `en-US/` | `dictionary-en` | 4.0.0 | https://github.com/wooorm/dictionaries/tree/main/dictionaries/en |
| `en-GB/` | `dictionary-en-gb` | 3.0.0 | https://github.com/wooorm/dictionaries/tree/main/dictionaries/en-GB |

`packages.json` records the exact npm tarball addresses and verified SHA-512
integrity values. The package contents, dictionary files and their upstream
license notices are unmodified. Hunspell's license texts are in `hunspell/COPYING`,
`hunspell/COPYING.LESSER` and `hunspell/COPYING.MPL`; dictionary notices are in each
language directory's `license` file. The original TypeScript wrapper source is in
`hunspell/src`; its WebAssembly build instructions are in `hunspell/docs/Building.md`.
The corresponding Hunspell C++ sources (`hunspell/lib/hunspell`) and Makefile are
included from upstream commit `8f755ef64e8b047b77b676f9698b3dfa5cb1887d` (the npm
package's gitHead). The WebAssembly binary in that commit is byte-for-byte equal
to the npm binary. The integration does not modify either binary or engine source.

An alternative nspell 2.1.5 bundle (`nspell.js`, MIT) and its original sources
(`source/nspell`, `source/is-buffer`) are retained for provenance but are **not
loaded by the app**. The full Brazilian dictionary is substantially faster to
initialize using native Hunspell rules in WebAssembly than nspell's JavaScript
word expansion. No npm installation is needed to run the app.

The integration checks words in a worker and computes suggested replacements
only when requested. It ignores protected note syntax, URLs, email addresses,
numeric identifiers and personal accepted words. It does not provide grammar
analysis or guarantee that a dictionary contains every valid name or technical term.
