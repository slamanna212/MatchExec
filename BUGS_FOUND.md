# Bugs Found During Testing

## BUG-001: Malformed FK Constraint on `matches` Table

**Status**: Open  
**Severity**: Medium (no runtime impact with FK=OFF; breaks FK enforcement if enabled)  
**Discovered**: Testing Phase I (foreign-keys.test.ts)

### Description

The `matches` table has a malformed foreign key reference to `game_maps`. When `PRAGMA foreign_keys=ON` is set, any `INSERT INTO matches` statement fails with:

```
SQLITE_ERROR: foreign key mismatch - "matches" referencing "game_maps"
```

This is a schema bug — the FK definition in the migrations references `game_maps` with an incorrect column or composite key that does not match the primary key of `game_maps`.

### Impact

- `PRAGMA foreign_keys` defaults to `OFF` in SQLite, so production is unaffected.
- All application inserts into `matches` work correctly at runtime.
- Cannot enable FK enforcement in tests without fixing this schema issue.
- Tests that require `INSERT INTO matches` with FK=ON are currently marked `.skip()`.

### Affected Tests

- `tests/integration/database/foreign-keys.test.ts` — two tests marked `.skip()`:
  - `inserts a valid match_participant that references an existing match (blocked by matches FK bug)`
  - `match insert fails with FK=ON due to malformed game_maps FK (known bug)`

### Fix

Audit the `matches` table DDL in `migrations/001_core_schema_and_matches.sql` and correct the FK reference to `game_maps`. Ensure the referenced columns match the `game_maps` primary key exactly. Then remove the `.skip()` annotations from the affected tests.
