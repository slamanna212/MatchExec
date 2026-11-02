# Docker image size comparison

Measured locally on AMD64 on 2026-11-02, using the original Dockerfile and the updated
Dockerfile against the same application source and `node:26-alpine` base. Sizes below
are Docker's uncompressed image sizes in decimal MB (1 MB = 1,000,000 bytes), not
registry download sizes or unique disk usage when images share layers.

| Image | Bytes | MB | Reduction from original |
| --- | ---: | ---: | ---: |
| Original all-in-one | 723,446,917 | 723.4 | — |
| Updated all-in-one | 485,463,960 | 485.5 | 238.0 MB / 32.9% |

## Where the savings came from

- **74.5 MB:** remove the second static-asset copy. Vite's output retains the files;
  `/app/public` contains links and a separate legacy uploads mount directory.
- **151.3 MB:** prepare read-only permissions in the builder, eliminating the old
  runtime `chmod` layers (151,245,995 bytes for public/client files and 79,529 for seed data).
- **About 12.2 MB:** remove Git, curl and GNU coreutils from the runtime, including their
  unnecessary dependencies. s6 is downloaded in a separate stage and health uses Node.
  Installing the retained OS packages together also avoids duplicate package metadata.
  The new health-check code adds a negligible amount, included in the totals above.

FFmpeg remains installed. Runtime dependency files match the original image byte for byte.
The cache restructuring and `.dockerignore` exclusions improve build behavior rather than
reduce runtime image size. Layer-backed pnpm fetching increases exported build-cache storage
compared with keeping downloads solely in a cache mount, but permits offline installation
when CI restores layers onto a fresh builder. No build-time speedup percentage is claimed.

## Validation and reproduction

The AMD64 image passed `bash scripts/test-container-image.sh IMAGE`:
startup and migrations, custom PUID/PGID, health, static assets, native-module loading,
PostgreSQL backup/restore, graceful shutdown and migration-only completion.
The workflows run this smoke test on native AMD64 and ARM64 runners before publishing
combined manifests. ARM64 execution was not available on the local test host.

The targeted static-serving, bot-image and legacy-upload unit/integration suite passed
21 tests. Helm lint/render checks cover aio, split and exact tag overrides. Node health
checks were exercised against success, redirect, failure, timeout and refused connections.
A dependency cache was exported and restored into a separate fresh BuildKit builder; a forced
reinstallation with `RUN --network=none` and `pnpm install --offline --frozen-lockfile --force`
completed with zero downloads. A source-only rebuild also reused dependency installation and
runtime collection layers.

Rebuild and inspect sizes with:

```sh
docker build -t matchexec:local .
docker image inspect matchexec:local --format '{{.RepoTags}} {{.Size}}'
bash scripts/test-container-image.sh matchexec:local
```

Future rebuilds may differ as base images and Alpine packages receive updates. Images were
built locally for this comparison; no registry images were published during implementation.
