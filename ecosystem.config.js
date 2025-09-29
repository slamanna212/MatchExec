module.exports = {
  apps: [
    {
      name: 'db-migrator',
      script: './scripts/migrate-background.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      autorestart: false,
      env: {
        NODE_ENV: 'production',
        DATABASE_PATH: '/app/app_data/data/matchexec.db'
      }
    },
    {
      name: 'matchexec-web',
      script: 'node',
      args: 'server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0'
      }
    },
    {
      name: 'discord-bot',
      script: './processes/discord-bot/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'production',
        DATABASE_PATH: '/app/app_data/data/matchexec.db'
      }
    },
    {
      name: 'scheduler',
      script: './processes/scheduler/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'production',
        DATABASE_PATH: '/app/app_data/data/matchexec.db'
      }
    }
  ]
};