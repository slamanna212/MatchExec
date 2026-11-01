// Enable React act() environment to suppress "not configured to support act(...)" warnings
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// No global database setup: every test file that needs Postgres calls `setupPgTestFile()` from tests/utils/pg-test-db.ts
// (PGlite by default, real Postgres when TEST_DATABASE_URL is set).

// The server tests must not depend on a local `pnpm build:client`: point the static SPA hosting at a directory that does
// not exist unless a test (tests/integration/server/static.test.ts) provides its own CLIENT_DIR.
process.env.CLIENT_DIR ??= `${process.env.TMPDIR ?? '/tmp'}/matchexec-tests-no-client-dir`;
