{{/*
Expand the name of the chart.
*/}}
{{- define "matchexec.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "matchexec.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "matchexec.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Selector labels. Call with (dict "ctx" . "component" "web").
*/}}
{{- define "matchexec.selectorLabels" -}}
app.kubernetes.io/name: {{ include "matchexec.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Common labels. Call with (dict "ctx" . "component" "web").
*/}}
{{- define "matchexec.labels" -}}
helm.sh/chart: {{ include "matchexec.chart" .ctx }}
{{ include "matchexec.selectorLabels" . }}
{{- if .ctx.Chart.AppVersion }}
app.kubernetes.io/version: {{ .ctx.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .ctx.Release.Service }}
{{- end }}

{{/*
Component that serves HTTP: the single pod in aio mode, the web Deployment in split mode.
*/}}
{{- define "matchexec.webComponent" -}}
{{- if eq .Values.mode "aio" }}aio{{ else }}web{{ end }}
{{- end }}

{{/*
Validate values; fails the render with a readable message.
*/}}
{{- define "matchexec.validate" -}}
{{- if not (has .Values.mode (list "aio" "split")) }}
{{- fail (printf "mode must be 'aio' or 'split' (got %q)" (toString .Values.mode)) }}
{{- end }}
{{- if and (eq .Values.mode "split") (not .Values.database.url) (not .Values.database.existingSecret) }}
{{- fail "mode=split needs an external Postgres: set database.url or database.existingSecret (key DATABASE_URL, or database.existingSecretKey)" }}
{{- end }}
{{- end }}

{{/*
Name of the Secret holding DATABASE_URL (split mode).
*/}}
{{- define "matchexec.databaseSecretName" -}}
{{- if .Values.database.existingSecret }}{{ .Values.database.existingSecret }}{{ else }}{{ include "matchexec.fullname" . }}-database{{ end }}
{{- end }}

{{- define "matchexec.databaseSecretKey" -}}
{{- if .Values.database.existingSecret }}{{ .Values.database.existingSecretKey | default "DATABASE_URL" }}{{ else }}DATABASE_URL{{ end }}
{{- end }}

{{/*
DATABASE_URL env entry (secretKeyRef).
*/}}
{{- define "matchexec.databaseEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "matchexec.databaseSecretName" . }}
      key: {{ include "matchexec.databaseSecretKey" . }}
{{- end }}

{{/*
Container image reference.
*/}}
{{- define "matchexec.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default (printf "v%s" .Chart.AppVersion) }}
{{- end }}

{{/*
Env vars shared by every MatchExec container. Call with (dict "ctx" . "services" "web").
*/}}
{{- define "matchexec.commonEnv" -}}
- name: NODE_ENV
  value: "production"
- name: TZ
  value: {{ .ctx.Values.timezone | quote }}
- name: PUID
  value: {{ .ctx.Values.puid | quote }}
- name: PGID
  value: {{ .ctx.Values.pgid | quote }}
- name: MATCHEXEC_SERVICES
  value: {{ .services | quote }}
{{- if .ctx.Values.logging.json }}
- name: LOG_FORMAT
  value: "json"
{{- end }}
{{- range $key, $value := .ctx.Values.env }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}
{{- end }}

{{/*
envFrom for the application secret (Discord token etc.).
*/}}
{{- define "matchexec.envFrom" -}}
{{- if or .Values.existingSecret .Values.secret }}
envFrom:
  - secretRef:
      name: {{ .Values.existingSecret | default (include "matchexec.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Scheduling constraints shared by every pod.
*/}}
{{- define "matchexec.scheduling" -}}
{{- with .Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/*
HTTP probes (web / aio).
*/}}
{{- define "matchexec.httpProbes" -}}
livenessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: {{ .Values.probes.liveness.initialDelaySeconds }}
  periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
  timeoutSeconds: {{ .Values.probes.liveness.timeoutSeconds }}
  failureThreshold: {{ .Values.probes.liveness.failureThreshold }}
readinessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: {{ .Values.probes.readiness.initialDelaySeconds }}
  periodSeconds: {{ .Values.probes.readiness.periodSeconds }}
  timeoutSeconds: {{ .Values.probes.readiness.timeoutSeconds }}
  failureThreshold: {{ .Values.probes.readiness.failureThreshold }}
startupProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: {{ .Values.probes.startup.initialDelaySeconds }}
  periodSeconds: {{ .Values.probes.startup.periodSeconds }}
  timeoutSeconds: {{ .Values.probes.startup.timeoutSeconds }}
  failureThreshold: {{ .Values.probes.startup.failureThreshold }}
{{- end }}

{{/*
Exec probes for the worker pods (no HTTP port). Call with (dict "ctx" . "process" "discord-bot").
No shell wrapper on purpose: `sh -c 'pgrep -f x'` would match its own command line.
*/}}
{{- define "matchexec.execProbes" -}}
livenessProbe:
  exec:
    command: ["pgrep", "-f", "dist/{{ .process }}.js"]
  initialDelaySeconds: {{ .ctx.Values.probes.worker.initialDelaySeconds }}
  periodSeconds: {{ .ctx.Values.probes.worker.periodSeconds }}
  timeoutSeconds: {{ .ctx.Values.probes.worker.timeoutSeconds }}
  failureThreshold: {{ .ctx.Values.probes.worker.failureThreshold }}
startupProbe:
  exec:
    command: ["pgrep", "-f", "dist/{{ .process }}.js"]
  periodSeconds: {{ .ctx.Values.probes.workerStartup.periodSeconds }}
  timeoutSeconds: {{ .ctx.Values.probes.worker.timeoutSeconds }}
  failureThreshold: {{ .ctx.Values.probes.workerStartup.failureThreshold }}
{{- end }}

{{/*
One MatchExec Deployment. Call with
  (dict "ctx" . "component" "bot" "cfg" .Values.bot "services" "bot" "process" "discord-bot")
component aio and web serve HTTP; bot, scheduler and stats are singletons (Recreate, 1 replica).
*/}}
{{- define "matchexec.deployment" -}}
{{- $ctx := .ctx -}}
{{- $http := or (eq .component "aio") (eq .component "web") -}}
{{- $split := eq $ctx.Values.mode "split" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "matchexec.fullname" $ctx }}{{ if $split }}-{{ .component }}{{ end }}
  labels:
    {{- include "matchexec.labels" (dict "ctx" $ctx "component" .component) | nindent 4 }}
spec:
  {{- if eq .component "web" }}
  replicas: {{ .cfg.replicas }}
  strategy:
    type: {{ .cfg.strategy | default "RollingUpdate" }}
    {{- if eq (.cfg.strategy | default "RollingUpdate") "RollingUpdate" }}
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
    {{- end }}
  {{- else }}
  replicas: 1
  strategy:
    type: Recreate
  {{- end }}
  selector:
    matchLabels:
      {{- include "matchexec.selectorLabels" (dict "ctx" $ctx "component" .component) | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "matchexec.selectorLabels" (dict "ctx" $ctx "component" .component) | nindent 8 }}
      {{- with $ctx.Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
    spec:
      {{- with $ctx.Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: {{ if eq .component "aio" }}{{ $ctx.Values.aio.terminationGracePeriodSeconds }}{{ else }}{{ $ctx.Values.terminationGracePeriodSeconds }}{{ end }}
      {{- with $ctx.Values.podSecurityContext }}
      securityContext:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .component }}
          image: {{ include "matchexec.image" $ctx | quote }}
          imagePullPolicy: {{ $ctx.Values.image.pullPolicy }}
          {{- with $ctx.Values.securityContext }}
          securityContext:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- if $http }}
          ports:
            - name: http
              containerPort: 3000
              protocol: TCP
          {{- end }}
          env:
            {{- include "matchexec.commonEnv" (dict "ctx" $ctx "services" .services) | nindent 12 }}
            {{- if $http }}
            - name: PORT
              value: "3000"
            {{- end }}
            {{- if $split }}
            {{- include "matchexec.databaseEnv" $ctx | nindent 12 }}
            - name: MATCHEXEC_RUN_MIGRATIONS
              value: {{ if and (not $ctx.Values.migrations.job) (eq .component "web") }}"true"{{ else }}"false"{{ end }}
            {{- end }}
            {{- if and (eq .component "scheduler") $ctx.Values.backups.persistence.enabled }}
            - name: MATCHEXEC_BACKUP_DIR
              value: /app/app_data/backups
            {{- end }}
            {{- if eq .component "aio" }}
            {{- with $ctx.Values.aio.postgres.sharedBuffers }}
            - name: PG_SHARED_BUFFERS
              value: {{ . | quote }}
            {{- end }}
            {{- with $ctx.Values.aio.postgres.maxConnections }}
            - name: PG_MAX_CONNECTIONS
              value: {{ . | quote }}
            {{- end }}
            {{- end }}
          {{- include "matchexec.envFrom" $ctx | nindent 10 }}
          {{- if $http }}
          {{- include "matchexec.httpProbes" $ctx | nindent 10 }}
          {{- else }}
          {{- include "matchexec.execProbes" (dict "ctx" $ctx "process" .process) | nindent 10 }}
          {{- end }}
          resources:
            {{- toYaml .cfg.resources | nindent 12 }}
          {{- if or (eq .component "aio") (and (eq .component "scheduler") $ctx.Values.backups.persistence.enabled) }}
          volumeMounts:
            {{- if eq .component "aio" }}
            - name: data
              mountPath: /app/app_data
            {{- else }}
            - name: backups
              mountPath: /app/app_data/backups
            {{- end }}
          {{- end }}
      {{- if or (and (eq .component "aio") $ctx.Values.aio.persistence.enabled) (and (eq .component "scheduler") $ctx.Values.backups.persistence.enabled) }}
      volumes:
        {{- if eq .component "aio" }}
        - name: data
          persistentVolumeClaim:
            claimName: {{ $ctx.Values.aio.persistence.existingClaim | default (printf "%s-data" (include "matchexec.fullname" $ctx)) }}
        {{- else }}
        - name: backups
          persistentVolumeClaim:
            claimName: {{ $ctx.Values.backups.persistence.existingClaim | default (printf "%s-backups" (include "matchexec.fullname" $ctx)) }}
        {{- end }}
      {{- end }}
      {{- include "matchexec.scheduling" $ctx | nindent 6 }}
{{- end }}
