// Development PM2 configuration with hot reload
module.exports = {
  apps: [
    {
      name: 'db-migrator-dev',
      script: './scripts/migrate-background.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      autorestart: false,
      env: {
        NODE_ENV: 'development',
        DATABASE_PATH: './app_data/data/matchexec.db',
        TZ: 'UTC'
      }
    },
    {
      name: 'matchexec-web-dev',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        TZ: 'UTC'
      }
    },
    {
      name: 'discord-bot-dev',
      script: './processes/discord-bot/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'development',
        DATABASE_PATH: './app_data/data/matchexec.db',
        TZ: 'UTC'
      },
      watch: ['./processes/discord-bot', './shared', './lib']
    },
    {
      name: 'scheduler-dev',
      script: './processes/scheduler/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'development',
        DATABASE_PATH: './app_data/data/matchexec.db',
        TZ: 'UTC'
      },
      watch: ['./processes/scheduler', './shared', './lib']
    }
  ]
};