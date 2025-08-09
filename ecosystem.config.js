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
      script: 'npx',
      args: 'tsx ./processes/discord-bot/index.ts',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'scheduler',
      script: 'npx',
      args: 'tsx ./processes/scheduler/index.ts',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'worker',
      script: 'npx',
      args: 'tsx ./processes/worker/index.ts',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};