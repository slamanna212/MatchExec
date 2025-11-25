// Unified PM2 configuration for development and production
// Use NODE_ENV=development for dev mode, defaults to production
// Note: Docker deployments use s6-overlay, not PM2
const isDev = process.env.NODE_ENV === 'development';

module.exports = {
  apps: [
    {
      name: isDev ? 'db-migrator-dev' : 'db-migrator',
      script: './scripts/migrate-background.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      autorestart: false,
      env: {
        NODE_ENV: isDev ? 'development' : 'production',
        DATABASE_PATH: './app_data/data/matchexec.db',
        TZ: 'UTC'
      }
    },
    {
      name: isDev ? 'matchexec-web-dev' : 'matchexec-web',
      script: isDev ? 'npm' : 'node',
      args: isDev ? 'run dev' : 'server.js',
      env: {
        NODE_ENV: isDev ? 'development' : 'production',
        PORT: 3000,
        ...(! isDev && { HOSTNAME: '0.0.0.0' }),
        TZ: 'UTC'
      }
    },
    {
      name: isDev ? 'discord-bot-dev' : 'discord-bot',
      script: './processes/discord-bot/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: isDev ? 'development' : 'production',
        DATABASE_PATH: './app_data/data/matchexec.db',
        TZ: 'UTC'
      },
      ...(isDev && {
        watch: ['./processes/discord-bot', './shared', './lib']
      })
    },
    {
      name: isDev ? 'scheduler-dev' : 'scheduler',
      script: './processes/scheduler/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: isDev ? 'development' : 'production',
        DATABASE_PATH: './app_data/data/matchexec.db',
        TZ: 'UTC'
      },
      ...(isDev && {
        watch: ['./processes/scheduler', './shared', './lib']
      })
    }
  ]
};