# Pre-Release Changelog

## Unreleased

## New Features

- **HTTP Adapter - Zstandard:** Added automatic zstd decompression on Node.js versions that support it. `zstd` is only advertised in the default `Accept-Encoding` header when `advertiseZstd: true` is set. (**#6792**)

## Release Documentation TODO

- Update `README.md` request config docs for `advertiseZstd` and zstd decompression support.
- Update `docs/pages/advanced/request-config.md` for `advertiseZstd` and zstd decompression support.
- Update decompression-bomb security guidance in `README.md` and `docs/pages/misc/security.md` to mention zstd.
