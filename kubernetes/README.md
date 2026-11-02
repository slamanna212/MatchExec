# MatchExec Kubernetes Deployment

MatchExec is deployed to Kubernetes via a Helm chart located at `helm/matchexec/`. One container image runs in two modes:

| | `mode: aio` (default) | `mode: split` |
|---|---|---|
| Pods | one Deployment, one PVC | four Deployments (`web`, `bot`, `scheduler`, `stats`) + a migration Job |
| Postgres | embedded Postgres 18 inside the pod (`MATCHEXEC_SERVICES=all`, no `DATABASE_URL`) | external (CloudNativePG, managed, ...): `database.url` or `database.existingSecret` |
| Storage | PVC at `/app/app_data` holds `postgres/` (PGDATA) and `backups/` | no PVC required (uploads live in Postgres); optional backups PVC on the scheduler |
| Strategy | `Recreate`, 1 replica | `web`: N replicas, `RollingUpdate`; `bot`, `scheduler`, `stats`: exactly 1 replica, `Recreate` |

There is no bundled Postgres sub-chart: bring your own database for `split`.

## Prerequisites

- Kubernetes 1.23+
- Helm 3+
- `split` only: a Postgres 16+ database (the chart is tested against 18) reachable from the cluster

## Quick Start

All-in-one (single pod, embedded Postgres):

```bash
helm install matchexec ./helm/matchexec \
  --set secret.DISCORD_BOT_TOKEN="your-token"
```

Split, with CloudNativePG (see [CloudNativePG](#cloudnativepg-example)):

```bash
helm install matchexec ./helm/matchexec \
  --set mode=split \
  --set database.existingSecret=matchexec-db-app \
  --set database.existingSecretKey=uri \
  --set secret.DISCORD_BOT_TOKEN="your-token"
```

## Configuration Reference

All options are set via `--set` flags or a custom `values.yaml` file.

### Mode and database

| Key | Default | Description |
|-----|---------|-------------|
| `mode` | `aio` | `aio` or `split` |
| `database.url` | `""` | split: connection URL, stored in a chart-managed Secret (created as a hook resource so the migration Job can read it) |
| `database.existingSecret` | `""` | split: existing Secret holding the URL (preferred) |
| `database.existingSecretKey` | `DATABASE_URL` | key inside `existingSecret` (CloudNativePG: `uri`) |
| `puid` / `pgid` | `1001` | user the app (and embedded Postgres in aio) runs as inside the container |
| `timezone` | `UTC` | `TZ` (auto-backup schedule uses it) |

`split` fails to render without `database.url` or `database.existingSecret`.

### Components

| Key | Default | Description |
|-----|---------|-------------|
| `aio.persistence.*` | enabled, `5Gi` | PVC for PGDATA + backups. `existingClaim`, `storageClass`, `accessMode`, `size`, `keep` (`helm.sh/resource-policy: keep`) |
| `aio.postgres.sharedBuffers` / `maxConnections` | unset | `PG_SHARED_BUFFERS` / `PG_MAX_CONNECTIONS` |
| `aio.resources` | 200m/512Mi req | resources of the all-in-one pod |
| `web.replicas` | `2` | web replicas (stateless; the rate limiter is per replica) |
| `web.strategy` | `RollingUpdate` | `RollingUpdate` or `Recreate` |
| `bot.enabled`, `scheduler.enabled`, `stats.enabled` | `true` | disable a component (e.g. no Discord) |
| `bot.*`, `scheduler.*`, `stats.*`, `web.*`, `migrations.resources` | see values.yaml | `resources` per component. Bot and scheduler have no `replicas`: they are always 1 replica with `Recreate` |
| `migrations.job` | `true` | run migrations in a Helm `pre-install,pre-upgrade` hook Job (`MATCHEXEC_SERVICES=migrate`). `false`: the web pods migrate at start, the other services wait for the schema |
| `migrations.backoffLimit` / `activeDeadlineSeconds` | `3` / `1800` | Job retry / time limits |
| `migrations.skipPreUpgradeDump` | `true` | skip the migrator's pre-upgrade `pg_dump` (the Job disk is ephemeral; use your database's own backups) |
| `backups.persistence.*` | disabled, `5Gi` | split: PVC for the scheduler's auto-backups at `/app/app_data/backups` (`MATCHEXEC_BACKUP_DIR` is set). `existingClaim`, `storageClass`, `accessMode`, `size`, `keep` |

The failed migration Job is kept (hook-delete-policy removes it only on success) so you can read its logs:
`kubectl logs job/<release>-matchexec-migrate`. A failing migration stops `helm upgrade` before any Deployment is touched.

### Root and security contexts

The image's init system (s6-overlay) must start as **root**: it creates/chowns `/app/app_data` (so an empty PVC just works, no `init-permissions` container and no `fsGroup` needed), initialises embedded Postgres, and then runs every process as the unprivileged user `PUID:PGID` (`abc`, default `1001`). Consequently:

- do **not** set `runAsNonRoot`, `runAsUser` or `readOnlyRootFilesystem` (`podSecurityContext` / `securityContext` default to `{}`),
- namespaces enforcing the Pod Security `restricted` profile will reject the pods; use `baseline` (or an exemption) for the namespace,
- the application and Postgres processes themselves never run as root.

### Image

| Key | Default | Description |
|-----|---------|-------------|
| `image.repository` | `matchexec` | Container image repository |
| `image.tag` | Chart `appVersion` | Image tag |
| `image.pullPolicy` | `IfNotPresent` | Image pull policy |
| `imagePullSecrets` | `[]` | Pull secrets for private registries |

### Naming

| Key | Default | Description |
|-----|---------|-------------|
| `nameOverride` | `""` | Override the chart name |
| `fullnameOverride` | `""` | Override the full release name |

### Secrets & Environment Variables

MatchExec requires at minimum a `DISCORD_BOT_TOKEN`. Provide secrets one of two ways:

**Option A — Inline (chart-managed Secret):**
```yaml
secret:
  DISCORD_BOT_TOKEN: "your-token-here"
```

**Option B — Existing Secret (recommended for production):**
```yaml
existingSecret: "my-matchexec-secret"
```
The referenced Secret must exist before installing the chart (e.g. created via Sealed Secrets or External Secrets Operator). All keys in the Secret are mounted as environment variables.

> `existingSecret` takes precedence — `secret` is ignored when it is set.

**Non-sensitive config** can be passed via `env`:
```yaml
env:
  SOME_CONFIG_VALUE: "foo"
```

### Logging

| Key | Default | Description |
|-----|---------|-------------|
| `logging.json` | `true` | Enable JSON structured logging (recommended for log aggregators like Loki) |

### Service

| Key | Default | Description |
|-----|---------|-------------|
| `service.type` | `ClusterIP` | Kubernetes Service type |
| `service.port` | `80` | Service port (forwards to container port 3000) |

### Ingress

| Key | Default | Description |
|-----|---------|-------------|
| `ingress.enabled` | `false` | Enable Ingress |
| `ingress.className` | `""` | Ingress class (e.g. `nginx`, `traefik`) |
| `ingress.annotations` | `{}` | Ingress annotations |
| `ingress.hosts` | `[]` | Host rules |
| `ingress.tls` | `[]` | TLS configuration |

Example with cert-manager:
```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: matchexec.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: matchexec-tls
      hosts:
        - matchexec.example.com
```

### Metrics & Monitoring

**Prometheus (requires `kube-prometheus-stack` or similar):**

| Key | Default | Description |
|-----|---------|-------------|
| `metrics.serviceMonitor.enabled` | `false` | Create a ServiceMonitor |
| `metrics.serviceMonitor.interval` | `30s` | Scrape interval |
| `metrics.serviceMonitor.scrapeTimeout` | `10s` | Scrape timeout |
| `metrics.serviceMonitor.labels` | `{}` | Labels to match your Prometheus selector |

```yaml
metrics:
  serviceMonitor:
    enabled: true
    labels:
      release: kube-prometheus-stack
```

**Grafana dashboard:**

| Key | Default | Description |
|-----|---------|-------------|
| `metrics.grafana.dashboardConfigMap` | `false` | Create a ConfigMap with the dashboard JSON |
| `metrics.grafana.labels` | `{grafana_dashboard: "1"}` | Labels for Grafana sidecar auto-discovery |

```yaml
metrics:
  grafana:
    dashboardConfigMap: true
```

### Scheduling

| Key | Default | Description |
|-----|---------|-------------|
| `nodeSelector` | `{}` | Node selector |
| `tolerations` | `[]` | Tolerations |
| `affinity` | `{}` | Affinity rules |
| `podAnnotations` | `{}` | Pod annotations |
| `terminationGracePeriodSeconds` | `30` | Seconds to wait for graceful shutdown |

### Scheduling

| Key | Default | Description |
|-----|---------|-------------|
| `nodeSelector` | `{}` | Node selector (all pods) |
| `tolerations` | `[]` | Tolerations |
| `affinity` | `{}` | Affinity rules |
| `podAnnotations` | `{}` | Pod annotations |
| `terminationGracePeriodSeconds` | `30` | split pods (aio: `aio.terminationGracePeriodSeconds`, 60) |

## CloudNativePG example

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: matchexec-db
spec:
  instances: 2
  imageName: ghcr.io/cloudnative-pg/postgresql:18
  storage:
    size: 10Gi
  bootstrap:
    initdb:
      database: matchexec
      owner: matchexec
  backup:
    retentionPolicy: 30d
    # barmanObjectStore: ...   (recommended: the app's own pg_dump backups are in addition to this)
```

CloudNativePG creates the Secret `matchexec-db-app` with keys `uri`, `host`, `port`, `dbname`, `user`, `password`, `jdbc-uri`, ... Its `uri` points at the read-write service (`matchexec-db-rw`), so use it directly:

```yaml
mode: split
database:
  existingSecret: matchexec-db-app
  existingSecretKey: uri
```

The Secret must be in the release's namespace. With another operator or a managed database, create a Secret yourself (`kubectl create secret generic matchexec-db --from-literal=DATABASE_URL='postgres://user:pass@host:5432/matchexec?sslmode=require'`) and set `database.existingSecret: matchexec-db`. Do not point MatchExec at a pooler in transaction mode that rejects advisory locks and session state; use a session-mode pooler or the direct service. The application role needs to own (or create objects in) the `public` schema and the `control` schema it creates.

## Upgrading

```bash
helm upgrade matchexec ./helm/matchexec --reuse-values --set image.tag=0.9.0
```

- `aio` (`Recreate`): brief downtime while the old pod stops (Postgres gets a fast, clean shutdown) and the new one migrates.
- `split`: the migration Job runs first; web rolls with zero unavailable, bot/scheduler/stats restart (`Recreate`).
- A Postgres **major** change of the embedded database (aio) is refused by the container with instructions; see [`docs/postgres-major-upgrade.md`](../docs/postgres-major-upgrade.md).

## Migrating from the SQLite chart (v0.8.x and earlier)

The old chart ran one pod with SQLite on a PVC `<release>-matchexec-data` (file `app_data/data/matchexec.db`). The Deployment selector labels changed, and selectors are immutable, so `helm upgrade` from the old chart will fail: uninstall and install again, keeping the old PVC. **Take a copy first** (the importer never modifies the source, but be safe): `kubectl exec deploy/<old> -- cp /app/app_data/data/matchexec.db /app/app_data/matchexec.db.bak`.

1. Protect the data and stop the app:
   ```bash
   kubectl annotate pvc <release>-matchexec-data helm.sh/resource-policy=keep
   kubectl scale deploy <release>-matchexec --replicas=0
   helm uninstall <release>        # the annotated PVC is kept
   ```

**Option A, aio (simplest).** Reuse the old PVC; the all-in-one pod imports automatically on first boot:

   ```bash
   helm install matchexec ./helm/matchexec \
     --set mode=aio --set aio.persistence.existingClaim=<release>-matchexec-data \
     --set secret.DISCORD_BOT_TOKEN=...
   ```
   On first start the pod sees `app_data/data/matchexec.db`, runs initdb in `app_data/postgres`, imports the SQLite database (and uploads from `public/uploads`, if you still mount them) in one transaction and renames the file to `matchexec.db.migrated-<timestamp>`, leaving a safety copy in `app_data/backups/`. Watch the progress in the pod log or the loading screen. If the import fails the database stays untouched and the pod reports the reason (`/api/db-status`); fix the cause (or set `MATCHEXEC_IMPORT_ALLOW_LOSSY=true` via `env` to accept the reported repairs) and restart.

**Option B, split.** Import once into your external Postgres with a one-off Job that mounts the old PVC read-only, then install `split`:

   ```yaml
   apiVersion: batch/v1
   kind: Job
   metadata:
     name: matchexec-sqlite-import
   spec:
     backoffLimit: 0
     template:
       spec:
         restartPolicy: Never
         containers:
           - name: import
             image: ghcr.io/slamanna212/matchexec:v0.9.0   # same tag you will install
             # bypass the s6 entrypoint, run the importer directly
             command: ["node", "dist/import-sqlite.js", "--from", "/old/data/matchexec.db", "--database-url", "$(DATABASE_URL)", "--no-rename", "--backup-dir", "/tmp/backups"]
             env:
               - name: DATABASE_URL
                 valueFrom: { secretKeyRef: { name: matchexec-db-app, key: uri } }
             volumeMounts:
               - { name: old, mountPath: /old, readOnly: true }
         volumes:
           - name: old
             persistentVolumeClaim: { claimName: <release>-matchexec-data, readOnly: true }
   ```
   The importer applies the Drizzle migrations to the target itself (a brand-new empty database is fine), imports in a single transaction, and refuses to touch a database that already has data. `--no-rename` is needed because the old PVC is mounted read-only. If your upload files (`public/uploads`) were persisted on a volume, mount it and add `--uploads-dir <path>` so they are imported into the `blobs` table. Run `node dist/import-sqlite.js --help` for all options (`--allow-lossy` accepts the reported repairs).

   Then `helm install matchexec ./helm/matchexec --set mode=split --set database.existingSecret=matchexec-db-app --set database.existingSecretKey=uri ...`. Delete the old PVC once you are satisfied.

## Uninstalling

```bash
helm uninstall matchexec
```

> PVCs created with `keep: true` and the PVC of a database you manage elsewhere are **not** deleted by Helm. Otherwise remove them manually:
> `kubectl delete pvc matchexec-matchexec-data matchexec-matchexec-backups`
