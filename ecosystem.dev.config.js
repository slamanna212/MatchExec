module.exports = {
  apps: [
    {
      name: 'db-migrator-dev',
      script: './scripts/migrate-background.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      autorestart: false,
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'matchexec-web-dev',
      script: 'npm',
      args: 'run dev',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      }
    },
    {
      name: 'discord-bot-dev',
      script: './processes/discord-bot/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'development'
      },
      watch: ['./processes/discord-bot', './shared', './lib']
    },
    {
      name: 'scheduler-dev',
      script: './processes/scheduler/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'development'
      },
      watch: ['./processes/scheduler', './shared', './lib']
    }
  ]
};