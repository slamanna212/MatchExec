<p align="center">
  <img src="https://raw.githubusercontent.com/slamanna212/MatchExec/refs/heads/dev/public/logo.svg" height="200" alt="MatchExec Logo" />
</p>

<h1 align="center">MatchExec</h1>
<h2 align="center">Your Personal Video Game Tournament Manager</h2>

<p align="center">
<img alt="GitHub Release" src="https://img.shields.io/github/v/release/slamanna212/matchexec?style=flat-square"> <img alt="GitHub License" src="https://img.shields.io/github/license/slamanna212/matchexec?style=flat-square"> <img alt="Discord" src="https://img.shields.io/discord/1411040188053983383?style=flat-square"> <img alt="Codecov" src="https://img.shields.io/codecov/c/gh/slamanna212/matchexec?style=flat-square">
</p>

---

## ❔ What is MatchExec
MatchExec handles all aspects of managing video game matches. Do you want to host tournaments, organize game nights, or prove you're better than the other team? MatchExec is for you! 

Inspired by a Discord server I am a part of, I wanted to improve the process of private video game matches. They take a lot of time to setup, coordinate, and orchestrate. MatchExec handles all of that so you can focus on playing, and winning.

Create a Match, and MatchExec handles the rest!

---

## ✨ Features
✅ **Full Discord Integration** — Creates native Discord events, Rich detailed Embeds, Sign-up forms inside of Discord, announcements, reminders, and more \
✅ **Modern, Responsive Web UI** — No matter the device or size, a beautiful, fast web interface awaits you \
✅ **Automatic Timezone Management** — MatchExec shows you all times in your local timezone, and stores them in UTC. No need to worry about missing matches due to conversion errors \
✅ **Keep Score** — Keep score of who wins each map and declare an overall winner \
✅ **Flexible** — Support for different scoring types, custom modes, custom maps, whatever you want, it's playable \
✅ **Voice Announcers** — 4 different personas to choose from: A evil queen, a British football announcer, a London radio DJ, and an American Wrestling Announcer \
✅ **Statistics** — Give MatchExec pictures of the scorecard at the end of maps in supported games, and MatchExec will generate statistics and share them

---

## 📷 Screenshots

![Matches Screen](https://github.com/slamanna212/MatchExec/blob/dev/.github/assets/release/0.7.0/matches.png?raw=true "Matches Screen")
![Games Screen](https://github.com/slamanna212/MatchExec/blob/dev/.github/assets/release/0.7.0/games.png?raw=true "Games Screen")
![Channels Screen](https://github.com/slamanna212/MatchExec/blob/dev/.github/assets/release/0.8/channelspage.png?raw=true "Channels Screen")
![Settings Screen](https://github.com/slamanna212/MatchExec/blob/dev/.github/assets/release/0.8/settings.png?raw=true "Settings Screen")
![Discord Match Embed](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/DiscordScreenshots/FlJmJP.png?raw=true "Discord Match Embed")
![Discord Sign Up Form](https://github.com/slamanna212/MatchExec/blob/main/.github/assets/DiscordScreenshots/O4CAe4.png?raw=true "Discord Sign Up Form")

---

## 🛸 Get Started

Documentation is [available here](https://docs.matchexec.com/docs/getting-started/getting-started/) Reading it is recommended, but TLDR:

```
docker run -d \
  --name MatchExec \
  -p 3000:3000 \
  --stop-timeout 30 \
  -e TZ=UTC \
  -v $(pwd)/app_data:/app/app_data \
  ghcr.io/slamanna212/matchexec:latest
```

That is the whole install: the image includes its own PostgreSQL 18 database, so there is nothing else to set up. Open `http://localhost:3000` and follow the welcome flow.

- **Data**: everything lives under `/app/app_data`: `postgres/` (the database) and `backups/` (automatic daily backups at 04:00 container time, 14 daily + 4 weekly kept, plus a backup before every upgrade and every restore). Manual backup, download and restore are under Settings > Backup & Restore.
- **`--stop-timeout 30`** gives the database time to shut down cleanly. Docker's default (10 seconds) is usually enough, but a bigger database or a slow disk can need more.
- **Unraid**: set `PUID=99` and `PGID=100`, and put the appdata path on the cache drive (`/mnt/cache/appdata/matchexec`), not `/mnt/user/...`. The FUSE layer behind `/mnt/user` is slow for a database. Add `--stop-timeout 30` to *Extra Parameters*.
- **Memory**: expect roughly 100-150 MB more than v0.8.x for the embedded database. `PG_SHARED_BUFFERS` (default `128MB`) and `PG_MAX_CONNECTIONS` (default `50`) tune it.
- **`uploads` volume**: new installs do not need `-v .../uploads:/app/public/uploads`; uploaded images are stored in the database and included in backups.

### Configuration

Copy `.env.example` for the full list (`--env-file .env`). The common ones:

| Variable | Default | Meaning |
|---|---|---|
| `TZ` | `UTC` | Container time zone (also the time automatic backups run) |
| `PUID` / `PGID` | `1001` | User/group that owns the data (Unraid: `99` / `100`) |
| `ADMIN_PASSWORD` | unset | Set to require a login for the whole app |
| `PUBLIC_URL` | `http://localhost:3000` | URL users reach MatchExec at |

Advanced:

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | unset | Use your own PostgreSQL 16+ server instead of the embedded one. When set, no embedded Postgres starts and automatic backups default to off. |
| `MATCHEXEC_SERVICES` | `all` | Which processes the container runs (`web,bot,scheduler,stats,migrate`). Used by the Kubernetes split mode. |
| `MATCHEXEC_BACKUP_DIR` | `/app/app_data/backups` | Where backups are written |
| `BIND_HOST` | `0.0.0.0` | Interface the web server binds to |

### Upgrading from v0.8.x

Pull the new image and start it on the **same** `app_data` volume. On first start MatchExec:

1. makes an untouched safety copy of your database at `app_data/backups/pre-postgres-<date>.db`,
2. imports everything (matches, tournaments, series, settings, uploads) into PostgreSQL in a single all-or-nothing step and checks that standings and results match,
3. renames `app_data/data/matchexec.db` to `matchexec.db.migrated-<date>`. It is never deleted.

If you used the `uploads` volume, keep it mounted for this first start so the images are imported. If the import finds a problem, nothing is changed: the web page shows the reason, and you can keep running v0.8.x until it is sorted out (see the release notes for `MATCHEXEC_IMPORT_ALLOW_LOSSY`).

**Rolling back** returns you to the state before the upgrade (everything entered on v0.10 is lost): re-pin the image to `0.8.x` and rename `matchexec.db.migrated-<date>` back to `matchexec.db` (or use the copy in `backups/`). Details in [RELEASE_NOTES_0.10.md](RELEASE_NOTES_0.10.md).

### Kubernetes

A Helm chart is in [`kubernetes/`](kubernetes/README.md): an all-in-one mode (one pod, embedded Postgres, one PVC) and a split mode (separate web/bot/scheduler/stats Deployments against an external PostgreSQL such as CloudNativePG).

### Development

```
corepack enable
pnpm install
pnpm dev:all     # starts Postgres in Docker (compose.dev.yml) + all processes with hot reload
```

Web UI on `http://localhost:3000`, API on `http://localhost:3001`. Other useful commands: `pnpm dev:logs`, `pnpm dev:stop`, `pnpm dev:db:reset`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. See [CLAUDE.md](CLAUDE.md) for the architecture and conventions.

---

## ✉️ Connect

Need Help? Want to add more games?

[Check the Docs](https://docs.matchexec.com)

[Open an issue](https://github.com/slamanna212/MatchExec/issues/new/choose)

[Join our Discord](https://discord.gg/nPKp95Cc6k)

---

### 🎮 Good Luck, Have Fun!