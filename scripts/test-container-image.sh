#!/usr/bin/env bash
# Integration smoke test for an already-built image; requires Docker, no host Node/Postgres.
# Usage: bash scripts/test-container-image.sh IMAGE
set -euo pipefail
image=${1:?image required}
prefix="matchexec-smoke-$$"
app="$prefix-app"
migrate="$prefix-migrate"
cleanup() {
  docker rm -f "$app" "$migrate" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'docker logs "$app" 2>&1 | tail -80' ERR

args=( -e MATCHEXEC_SERVICES=web -e PUID=1234 -e PGID=1234)

docker run -d --name "$app" "${args[@]}" "$image" >/dev/null
ready=false
for ((i=0; i<120; i++)); do
  if docker exec "$app" node /etc/matchexec/healthcheck.cjs >/dev/null 2>&1; then ready=true; break; fi
  [[ $(docker inspect -f '{{.State.Running}}' "$app") == true ]]
  sleep 1
done
[[ "$ready" == true ]]

# Linked assets remain identical at browser and bot paths; native modules load on this architecture.
docker exec "$app" node -e '
const fs = require("node:fs"); const assert = require("node:assert/strict");
assert.equal(fs.realpathSync("public/assets"), "/app/dist/client/assets");
assert(fs.statSync("public/uploads").isDirectory());
assert(!fs.lstatSync("public/uploads").isSymbolicLink());
assert.equal(fs.statSync("dist/client/assets").mode & 0o222, 0);
for (const name of ["discord.js", "@discordjs/voice", "@napi-rs/canvas", "@snazzah/davey", "bufferutil"]) require(name);
const files = fs.readdirSync("public/assets", {recursive:true});
assert(files.some(name => name.endsWith(".mp3")));
const asset = files.find(name => name.endsWith(".webp"));
(async () => {
  const response = await fetch("http://127.0.0.1:3000/assets/" + asset);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fs.readFileSync("public/assets/" + asset));
})().catch(error => { console.error(error); process.exit(1); });
'
docker exec "$app" sh -ec 'test "$(id -u abc)" = 1234; test "$(id -g abc)" = 1234; ! command -v git; ! command -v curl; pg_dump --version; pg_restore --version'
docker exec "$app" postgres --version

# Exercise client tools against the running database without modifying application data.
docker exec "$app" /command/s6-envdir /run/s6/container_environment bash -ec '
  pg_dump --dbname="$DATABASE_URL" --schema=public --format=custom --file=/tmp/smoke.dump
  pg_restore --list /tmp/smoke.dump >/dev/null
  createdb --maintenance-db="$DATABASE_URL" smoke_restore
  pg_restore --clean --if-exists --no-owner --dbname="postgresql://abc@/smoke_restore?host=/run/postgresql" /tmp/smoke.dump
  dropdb --maintenance-db="$DATABASE_URL" smoke_restore
'

docker stop -t 30 "$app" >/dev/null
[[ $(docker inspect -f '{{.State.ExitCode}}' "$app") == 0 ]]
# A migrate-only run must finish successfully.
docker run -d --name "$migrate" "${args[@]}" -e MATCHEXEC_SERVICES=migrate "$image" >/dev/null
for ((i=0; i<120; i++)); do
  [[ $(docker inspect -f '{{.State.Running}}' "$migrate") == false ]] && break
  sleep 1
done
[[ $(docker inspect -f '{{.State.Running}}' "$migrate") == false ]]
[[ $(docker inspect -f '{{.State.ExitCode}}' "$migrate") == 0 ]]
echo "Container smoke test passed: $image"
