module.exports = {
  apps: [
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
    },
    {
      name: 'worker-dev',
      script: './processes/worker/index.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'development'
      },
      watch: ['./processes/worker', './shared', './lib']
    }
  ]
};