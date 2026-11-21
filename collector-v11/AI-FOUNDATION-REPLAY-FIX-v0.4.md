# Collector — Replay compatibility fix v0.4

## Scope

This patch addresses replay warnings found in the user's 2026-11-21 JSON export, without deleting or rewriting journal events.

## Changes

- Legacy `migration.entity_imported` events become idempotent when the same entity ID, name, and type already exist in the projection.
- Startup migration detection now checks entity IDs across event payloads and create operations, regardless of the event's specific type. This prevents repeated migration events from being appended on subsequent launches.
- The legacy operation `schimb atrib` remains in the append-only journal but does not mutate projections because its historical payload does not identify a canonical attribute operation reliably.
- Replay warnings are initialized as an empty array and freshly computed warnings take precedence over stale warning metadata.
- Import projection comparison ignores generated stock-row IDs, which are regenerated during replay and are not referenced by other records; all stock content remains compared.
- Stable projection comparison omits undefined object properties.

## Validation

- Existing test suite: 32/32 passed before the added regression test.
- Added regression test for duplicate migration imports and the legacy operation.
- The user's supplied export replayed with 0 warnings after the patch.
- The supplied export passed `validateImport` after the patch (5 entities, 5 relations, 4 stock rows).

## Data safety

No events are deleted. Duplicate migration events and the legacy event remain in the append-only journal. The ambiguous legacy event is retained but not applied to projections.
