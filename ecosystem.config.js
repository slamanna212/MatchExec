module.exports = {
  apps: [
    {
      name: 'matchexec-web',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'discord-bot',
      script: './processes/discord-bot/index.js',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'scheduler',
      script: './processes/scheduler/index.js',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker',
      script: './processes/worker/index.js',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};