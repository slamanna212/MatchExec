# MatchExec Kubernetes Deployment

MatchExec is deployed to Kubernetes via a Helm chart located at `helm/matchexec/`.

## Prerequisites

- Kubernetes 1.23+
- Helm 3+
- A built MatchExec Docker image

## Quick Start

```bash
helm install matchexec ./helm/matchexec \
  --set image.repository=ghcr.io/yourorg/matchexec \
  --set image.tag=0.7.1 \
  --set secret.DISCORD_BOT_TOKEN="your-token"
```

## Configuration Reference

All options are set via `--set` flags or a custom `values.yaml` file.

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

### Persistence

MatchExec uses SQLite, so a PersistentVolumeClaim is required to survive pod restarts.

| Key | Default | Description |
|-----|---------|-------------|
| `persistence.enabled` | `true` | Enable persistent storage |
| `persistence.existingClaim` | `""` | Use a pre-existing PVC |
| `persistence.storageClass` | `""` | Storage class (`"-"` forces default) |
| `persistence.accessMode` | `ReadWriteOnce` | PVC access mode |
| `persistence.size` | `1Gi` | Volume size |

> The Deployment uses a `Recreate` strategy because SQLite requires exclusive file access — rolling updates are not supported with `ReadWriteOnce` volumes.

### Resources

| Key | Default | Description |
|-----|---------|-------------|
| `resources.requests.cpu` | `100m` | CPU request (0.1 cores) |
| `resources.requests.memory` | `256Mi` | Memory request |
| `resources.limits.cpu` | `500m` | CPU limit (0.5 cores) |
| `resources.limits.memory` | `1Gi` | Memory limit |

### Health Probes

Three probes are configured against `/api/health` (liveness/startup) and `/api/health/ready` (readiness). The startup probe allows up to 60 seconds for database migrations and seeding to complete on first boot.

| Key | Default | Description |
|-----|---------|-------------|
| `probes.liveness.initialDelaySeconds` | `15` | |
| `probes.liveness.periodSeconds` | `30` | |
| `probes.liveness.timeoutSeconds` | `5` | |
| `probes.liveness.failureThreshold` | `3` | |
| `probes.readiness.initialDelaySeconds` | `10` | |
| `probes.readiness.periodSeconds` | `15` | |
| `probes.readiness.timeoutSeconds` | `5` | |
| `probes.readiness.failureThreshold` | `3` | |
| `probes.startup.initialDelaySeconds` | `5` | |
| `probes.startup.periodSeconds` | `5` | |
| `probes.startup.timeoutSeconds` | `5` | |
| `probes.startup.failureThreshold` | `12` | Max 60s startup time |

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

## Upgrading

```bash
helm upgrade matchexec ./helm/matchexec --reuse-values \
  --set image.tag=0.8.0
```

> Because the Deployment strategy is `Recreate`, upgrades will cause brief downtime while the old pod is terminated and the new one starts.

## Uninstalling

```bash
helm uninstall matchexec
```

> The PersistentVolumeClaim is **not** deleted automatically. Delete it manually if you want to remove all data:
> ```bash
> kubectl delete pvc matchexec-data
> ```
