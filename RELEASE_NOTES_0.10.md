# MatchExec v0.10.0 (draft)

v0.10 is a platform release. Nothing was added to the feature set on purpose: the same pages, the same URLs, the same Discord behaviour. What changed is everything underneath, and it changes how you install, back up and upgrade.

## What changed

- **PostgreSQL 18 replaces SQLite.** All data lives in PostgreSQL, managed with Drizzle ORM. Foreign keys are now enforced by the database, and the work queues the bot and scheduler use are claimed safely (row locks, retries with backoff) instead of relying on one shared connection.
- **The database is built in.** The Docker image contains PostgreSQL 18 and starts it for you, so `docker run` and Unraid installs stay one container with one volume. Expect roughly 100-150 MB more memory than v0.8.x. Set `DATABASE_URL` to use your own PostgreSQL server instead (no embedded database starts then).
- **Next.js is gone.** The web UI is a Vite + React single-page app served by a Hono API server. Same pages and URLs; deep links and refresh work.
- **Backups are real database backups.** `pg_dump` based, compressed, optionally AES-256-GCM encrypted. Automatic daily backups at 04:00 (container time zone), 14 daily + 4 weekly kept, on by default for the embedded database (off when you supply `DATABASE_URL`). A backup is also taken before every upgrade that changes the schema and before every restore. Settings > Backup & Restore lists them with download / restore / delete. Restore pauses the bot, scheduler and stats processor first and rolls back automatically if anything fails. Old SQLite `.db` backups can still be restored, indefinitely.
- **One image, two deployment modes.** `MATCHEXEC_SERVICES` selects which processes a container runs (`web,bot,scheduler,stats,migrate`, default `all`). The Helm chart now has an `aio` mode (one pod, embedded Postgres) and a `split` mode (separate web / bot / scheduler / stats Deployments against an external PostgreSQL such as CloudNativePG, web scalable past one replica, migrations as a Helm hook Job). Uploaded images (event images, scorecards, stat images) are stored in the database, so there is no shared disk requirement.
- **Better failure behaviour.** If the upgrade cannot complete (for example the old data has problems), the container stays up in a degraded mode that shows the reason in the browser instead of crash-looping. The import is a single transaction, so a failure leaves nothing half done.
- **Tooling.** pnpm replaces npm (7-day minimum release age for dependencies, Dependabot cooldown to match), every dependency was updated to its latest version, the image is built on Node 26 and s6-overlay 3.2.3.2.

## Upgrading from v0.8.x

Pull `v0.10.0` and start it on the **same** `app_data` volume. Automatically, on first start:

1. The old database is copied untouched to `app_data/backups/pre-postgres-<YYYYMMDD-HHMMSS>.db`.
2. The data is checked for consistency and imported into PostgreSQL in one transaction. Standings and results (all series, all tournaments, the most recent matches) are recomputed on both sides and compared; any mismatch rolls the import back.
3. Uploaded images from the old `uploads` volume are moved into the database. **Keep the `uploads` volume mounted for this first start**; afterwards you can remove it.
4. `app_data/data/matchexec.db` is renamed to `matchexec.db.migrated-<YYYYMMDD-HHMMSS>`. It is never deleted.

The first start can take a while on a large database; the browser shows a progress screen. Recommended: stop the old container and copy `app_data` somewhere safe before upgrading.

If the consistency check finds problems the import is refused and nothing is changed. The browser shows the first problems and their count. Fix the data (or report it), or set `MATCHEXEC_IMPORT_ALLOW_LOSSY=true` to let the importer apply and report repairs (orphan rows are skipped, invalid JSON becomes empty) and restart. Known harmless leftovers from old versions (rows belonging to long-deleted matches, stale queue rows) are always cleaned up and reported without needing that flag.

Recommended container options:

- `--stop-timeout 30` so PostgreSQL can shut down cleanly (Docker's default of 10 seconds is usually enough but not guaranteed).
- Unraid: `PUID=99`, `PGID=100`, appdata on `/mnt/cache/appdata/matchexec` (not `/mnt/user/...`: FUSE hurts PostgreSQL), and `--stop-timeout 30` in *Extra Parameters*.

## Rolling back

**Failed first boot (the import failed or rolled back):** nothing was changed. Re-pin the image to v0.8.x; the original `matchexec.db` is still in place.

**Rollback after running on v0.10:** re-pin the image to v0.8.x and rename `app_data/data/matchexec.db.migrated-<date>` back to `matchexec.db` (or copy `app_data/backups/pre-postgres-<date>.db` to `app_data/data/matchexec.db`). This returns you to the **pre-migration state**: every write made on v0.10 is lost. (The `app_data/postgres/` directory can stay; v0.8.x ignores it. Remove it before trying v0.10 again, or it will keep the data from the earlier attempt and skip the import.)

## Breaking changes

- **Kubernetes chart:** the old chart (one SQLite Deployment) cannot be upgraded in place. Deployment selector labels changed and selectors are immutable, so `helm upgrade` fails. Uninstall (keeping the old PVC with `helm.sh/resource-policy=keep`) and install again. Values were restructured (`mode`, `database.*`, `web/bot/scheduler/stats.*`, `migrations.*`, `backups.persistence.*`, `aio.persistence.*`; the old top-level `persistence` and `resources` are gone). `kubernetes/README.md` has both migration paths (reuse the old PVC in `aio` mode for automatic import, or a one-off importer Job into an external database for `split`). Pod Security `restricted` namespaces are not supported (the image's init needs root before dropping to `PUID`/`PGID`).
- **Backup files:** new backups are PostgreSQL dumps (`matchexec-backup-<date>.dump`, `.dump.enc` when encrypted), not SQLite files. Old `.db` / encrypted `.db` backups still restore.
- **Environment variables:** `DATABASE_PATH` and `HOSTNAME` are no longer used by the app (`DATABASE_PATH` is read only by the one-time importer). New: `DATABASE_URL`, `MATCHEXEC_SERVICES`, `MATCHEXEC_RUN_MIGRATIONS`, `MATCHEXEC_IMPORT_ALLOW_LOSSY`, `MATCHEXEC_BACKUP_DIR`, `BIND_HOST`, `PG_POOL_MAX`, `PG_SHARED_BUFFERS`, `PG_MAX_CONNECTIONS`. See `.env.example`.
- **Service names inside the image:** s6 services are now `postgres`, `migrate`, `web`, `bot`, `scheduler`, `stats`. Only relevant if you exec into the container or script against s6.
- **Node 26** is the runtime in the image; local development works on Node 24+.
- **API response formats** (only matters if you call the API directly; the bundled UI was updated). Endpoint paths, status codes and accepted inputs are unchanged unless listed:
  - Timestamps are full ISO-8601 strings (`2026-06-01T18:00:00.000Z`) everywhere. Previously many were SQLite text like `2026-06-01 18:00:00`. Affects matches, participants, games, tournaments, series and events, channels, scheduler/UI settings, feed events, scheduled announcements.
  - 0/1 integers became real booleans: `stats_enabled`, `player_notifications`, `receives_map_codes`, `discord_notified`, tournament flags (`allow_match_editing`, `allow_player_team_selection`, `has_bracket`), game `supportsAllModes`, map `tournament_enabled`, `is_primary`, `stat_image_sent`, `stats_dm_sent`. Inputs that took 0/1 (maps PATCH `tournament_enabled`) accept booleans too.
  - JSON-in-a-string fields are real JSON: match and tournament `announcements` (array), `position_scoring_override` (object), `maps` / `map_codes`, participant `signup_data`, series `scoring_config`, scorecard `stats_json` / `total_stats_json` / `ai_processing_log`, feed `metadata`.
  - `match_games` rows no longer carry `team_a`, `team_b`, `score_a`, `score_b`, `participant1_id`, `participant2_id`; results come from placements (`winner_id`, `participant_winner_id`, `position_results` are derived for the UI).
  - `/api/db-status` also returns `phase` and `percent` (and `table` / `error` during an import).
  - `/api/metrics`: `matchexec_discord_queue_pending` now sums all pending queue tables (the old query never worked); `matchexec_database_size_bytes` uses PostgreSQL; new `matchexec_db_pool_*` gauges.
  - Malformed JSON request bodies answer 400 `Invalid JSON body` (some routes gave 500); unparseable dates are 400; scorecard upload for a map that is not part of the match is 404.
  - Backup/restore routes: backup `POST /api/settings/backup` and restore (multipart) keep their contracts; new `/api/settings/backup/{config,run,list,files}` endpoints.
- **Behaviour notes:** failed Discord queue jobs are now retried with backoff (up to 5 attempts) instead of failing on the first error. `/login` is exempt from the welcome-flow redirect. Static files are cached for an hour (`max-age=3600`) instead of `max-age=0`.

## Pre-release checklist (for the maintainer)

- [ ] Round-trip a **copy of a real production database** (a v0.8.x install with real history) through the importer: `pnpm build` then `node dist/import-sqlite.js --from <copy.db> --database-url <scratch postgres>` or just start the image on a copy of appdata. Only copies of the dev database and a v0.7-era backup have been run so far. If the preflight reports issues, also try `MATCHEXEC_IMPORT_ALLOW_LOSSY=true` and review the reported repairs.
- [ ] Publish `:beta` / `:0.10.0-rc.N` first and have a few Unraid users test on a **copy** of their appdata.
- [ ] Test on Unraid with `PUID=99 PGID=100` and appdata on `/mnt/cache`, including `docker stop` / restart cycles (no crash recovery in the Postgres log on next start).
- [ ] The Unraid community template is not in this repository: update it by hand (appdata path with `backups/`, *Extra Parameters* `--stop-timeout 30`, advanced variables `DATABASE_URL` / `MATCHEXEC_SERVICES`, optional `uploads` path only needed for the first upgrade).
- [ ] PostgreSQL minor and patch updates only arrive when the image is rebuilt (the `postgresql18` apk package is invisible to Dependabot). Rebuild regularly. A PostgreSQL **major** upgrade is manual and the container refuses to start on a mismatch (`docs/postgres-major-upgrade.md`).
- [ ] Verify the Kubernetes chart against a real cluster (`helm lint` and `kubeconform` pass; no cluster run was possible), for both `aio` and `split` with CloudNativePG.
- [ ] Check `pnpm audit` and `pnpm outdated` one last time; `typescript` stays on 6.0.3 until `typescript-eslint` supports TypeScript 7.
- [ ] Tag and release: `package.json` and `kubernetes/helm/matchexec/Chart.yaml` are already at 0.10.0.
