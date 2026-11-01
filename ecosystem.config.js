// Unified PM2 configuration for development and production
// Use NODE_ENV=development for dev mode, defaults to production
// Note: Docker deployments use s6-overlay, not PM2
//
// Dev: Postgres runs in Docker (`pnpm dev:db`, compose.dev.yml); `pnpm dev:all` starts it before PM2.
//      Processes default DATABASE_URL to postgres://matchexec:matchexec@127.0.0.1:5432/matchexec when
//      NODE_ENV=development. Vite (3000, HMR) proxies /api and /uploads to the Hono server (3001).
// Prod (PM2): runs the esbuild bundles in ./dist (`pnpm build` first); DATABASE_URL must be set. Hono serves the SPA on 3000.
// Every non-migrate process waits for the schema (waitForSchema / waitForSystemReady), so start order is safe.
const isDev = process.env.NODE_ENV === 'development';
const suffix = isDev ? '-dev' : '';
const logDir = './app_data/data/logs';

const base = {
  NODE_ENV: isDev ? 'development' : 'production',
  TZ: 'UTC'
};

// Run a TypeScript entrypoint with tsx (dev) or the bundled JS in ./dist (prod).
const proc = (name, tsEntry, distEntry, extra = {}) => ({
  name: name + suffix,
  ...(isDev
    ? { script: tsEntry, interpreter: 'pnpm', interpreter_args: 'exec tsx' }
    : { script: distEntry }),
  out_file: `${logDir}/${name}-out.log`,
  error_file: `${logDir}/${name}-error.log`,
  merge_logs: true,
  env: { ...base, ...extra.env },
  ...(isDev && extra.watch && { watch: extra.watch }),
  ...(extra.autorestart === false && { autorestart: false })
});

module.exports = {
  apps: [
    proc('db-migrator', './lib/db/migrate-cli.ts', './dist/migrate.js', { autorestart: false }),
    ...(isDev
      ? [
          // Vite dev server: HMR on 3000, proxies /api + /uploads to the Hono server below.
          {
            name: 'matchexec-web-dev',
            script: 'pnpm',
            args: 'exec vite',
            out_file: `${logDir}/web-out.log`,
            error_file: `${logDir}/web-error.log`,
            merge_logs: true,
            env: { ...base, PORT: 3000 }
          },
          // Hono API server (tsx watch reloads on change).
          {
            name: 'matchexec-server-dev',
            script: 'pnpm',
            args: 'exec tsx watch src/server/index.ts',
            out_file: `${logDir}/server-out.log`,
            error_file: `${logDir}/server-error.log`,
            merge_logs: true,
            env: { ...base, PORT: 3001, ENABLE_DEBUG_ROUTES: 'true' }
          }
        ]
      : [
          {
            name: 'matchexec-web',
            script: './dist/server.js',
            out_file: `${logDir}/web-out.log`,
            error_file: `${logDir}/web-error.log`,
            merge_logs: true,
            env: { ...base, PORT: 3000 }
          }
        ]),
    proc('discord-bot', './processes/discord-bot/index.ts', './dist/discord-bot.js', {
      watch: ['./processes/discord-bot', './shared', './lib']
    }),
    proc('scheduler', './processes/scheduler/index.ts', './dist/scheduler.js', {
      watch: ['./processes/scheduler', './shared', './lib']
    }),
    proc('stats-processor', './processes/stats-processor/index.ts', './dist/stats-processor.js', {
      watch: ['./processes/stats-processor', './shared', './lib']
    })
  ]
};
