# DataScript 1.8.1

Unmodified official JavaScript distribution from the `datascript` npm package.

- Source repository and source for this release: https://github.com/tonsky/datascript/tree/1.8.1
- Package: https://registry.npmjs.org/datascript/-/datascript-1.8.1.tgz
- Package SHA-512 (base64): `WIkg5LtD6vI0OrWo3C+/Lo4+8sCf7cGExEb11y67tNuLGjFVlFShN95p8P9Zjidjc642boodXdbBSZH4j2GGXQ==`
- License: Eclipse Public License 1.0, included in `LICENSE`.
- The bundle exposes `datascript` in browsers and CommonJS in Node.js. No runtime network access or npm installation is needed by Trama users.

Trama's adapter is `../../datalog.js`. It uses the official query engine and maps the supported Roam-style attribute tokens to DataScript's JavaScript string attribute keys. The bundle itself has not been modified.

The adapter permits an explicit list of declarative query functions, standard aggregates, joins and pull. It excludes host-type introspection, dynamic function calls, custom aggregates, external function/rule inputs and reader forms that can conceal callable symbols. Roam-specific database attributes/APIs beyond the adapter's schema are not implemented. Large or expensive queries should run only in the application's timed worker.
