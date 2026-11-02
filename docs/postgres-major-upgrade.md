# Upgrading the embedded PostgreSQL major version

MatchExec images ship one PostgreSQL major version (18 at the time of writing). The database files in
`app_data/postgres/` can only be opened by the same major version. If a newer image ships a different major, the
container refuses to start and prints a message pointing here. Nothing is modified when that happens, and there is no
automatic `pg_upgrade`: the old files stay valid for the old image, so you can always roll back.

## Procedure

1. Start the **old** image (the one that matches your data) and take a backup: Settings > Backup & Restore > "Back up now"
   (or `docker exec <container> pg_dump --format=custom --schema=public --dbname 'postgresql://abc@/matchexec?host=/run/postgresql' > matchexec.dump`).
   Copy the `.dump` file out of the container (`app_data/backups/` is on your volume).
2. Stop the container and move `app_data/postgres/` out of the way (keep it until you are happy with the result).
3. Start the **new** image on the same volume. It initialises an empty database.
4. Open the web UI, go to Settings > Backup & Restore and restore the `.dump` file.

If you run an external database (`DATABASE_URL` set), this does not apply: upgrade that server with its own tooling.
