# Collector SQLite at-rest encryption — implementation plan

Date: 2026-11-25
Branch: feature/openai-provider-integration / PR #55 draft

## Current verified state
- `collector-v11/storage-adapter.js` opens database `collector` with `encrypted:false`, `mode:no-encryption`.
- `collector-v11/capacitor.config.json` has `androidIsEncryption:false` and `iosIsEncryption:false`.
- The native plugin toolchain currently pins `@capacitor-community/sqlite@8.1.1`.
- SQLite stores the Collector KV snapshot; audio files are stored separately in app-private Filesystem storage. Encrypting the DB does not automatically encrypt audio files.
- CI builds debug Android and iOS simulator, but there has not been physical-device migration testing.

## Plugin capability
The SQLite community plugin documents SQLCipher AES-256 support, encrypted-new-database and conversion of existing non-encrypted databases, with platform encryption flags enabled in Capacitor config. The plugin has secure-secret APIs (`isSecretStored`, `setEncryptionSecret`, `checkEncryptionSecret`) and connection modes `secret` and `encryption`.

Official references:
- https://github.com/capacitor-community/sqlite/blob/master/docs/DatabaseEncryption.md
- https://github.com/capacitor-community/sqlite/blob/master/docs/API.md

## Safe implementation requirements (do not simply toggle flags)
1. **Enable platform capability** for Android/iOS only after the encryption bootstrap is implemented.
2. **Generate a cryptographically random per-install secret** (never hard-code or store in JS/localStorage); store it using the plugin's secure store/Keychain/Keystore integration.
3. **New install:** create DB encrypted using the plugin's `secret` mode and verify `isDatabaseEncrypted` before normal reads/writes.
4. **Existing plaintext DB:** take a verified backup/export or use the plugin's documented encryption conversion path. Conversion must be recoverable; never delete the original until post-conversion integrity and Core replay checks pass.
5. **Existing encrypted DB:** require the secure-store secret; if missing/invalid, fail closed with a recovery message. Never silently create a new empty DB, overwrite, or delete the user's data.
6. **Legacy localStorage v7 migration:** keep the legacy source intact until the encrypted destination has been written and read back, Core validation/replay succeeds, and a migration marker is committed atomically.
7. **Crash recovery:** model migration states explicitly (started, backup verified, encrypted conversion, validation, complete); on restart resume or rollback without losing source data.
8. **Validate** encryption via plugin `isDatabaseEncrypted`, test wrong/missing secret, SQLCipher open/read/write, and backup/restore semantics. Do not expose secret in logs/errors.
9. **Audio privacy:** separately review native audio files and backups. SQLite encryption alone is not equivalent to whole-app data protection.
10. **Device validation:** Android and iOS physical-device tests are mandatory before claiming the migration is release-ready.

## Implementation sequence
- Stage A: capability/API audit and migration state machine tests using mocks; no production encryption toggle.
- Stage B: implement encrypted connection bootstrap and secure key lifecycle behind a guarded feature/config; keep legacy DB intact on any error.
- Stage C: CI build validation and plugin API tests.
- Stage D: manual test plan on Android+iOS with seeded v7 data, interrupted migration, restore, wrong key, app upgrade, and storage pressure.
- Stage E: only after Stage D, enable encryption flags by default for production builds and update privacy policy/checklist.

## Release gate
Encryption is not considered done until Stage D is signed off. Until then, config stays `false`, privacy draft must not claim at-rest encryption, and users must not be prompted to reset or reinstall to recover data.
\n\n## Stage B implementation checkpoint (2026-11-25)\n- Added `sqlite-encryption-bootstrap.js`: 256-bit random secret generated with Web Crypto, secure-store write and verification, new DB encrypted `secret` mode, existing encrypted DB requires stored secret, and plaintext DB fails closed without conversion.\n- `storage-adapter.js` accepts `requireEncryption` and bootstrap injection; when gated on it will not fall back to plaintext.\n- `collector-config.js` has `sqliteEncryptionEnabled:false`; native SQLite encryption flags remain false. Stage B is intentionally dormant until platform config and physical-device testing.\n- Added `test-sqlite-encryption-bootstrap.js` for new DB, secret storage failure, existing encrypted DB, missing key, plaintext refusal, random generator failure, and adapter integration.\n- Existing plaintext conversion is not implemented yet: the current app's journal/export/replay flow is not yet wired into a verified native database backup-and-restore conversion. Original DB remains untouched.\n