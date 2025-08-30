module.exports = {
  apps: [
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
      script: 'npx',
      args: 'tsx ./processes/discord-bot/index.ts',
      env: {
        NODE_ENV: 'production',
        DATABASE_PATH: '/app/app_data/data/matchexec.db'
      }
    },
    {
      name: 'scheduler',
      script: 'npx',
      args: 'tsx ./processes/scheduler/index.ts',
      env: {
        NODE_ENV: 'production',
        DATABASE_PATH: '/app/app_data/data/matchexec.db'
      }
    },
    {
      name: 'worker',
      script: 'npx',
      args: 'tsx ./processes/worker/index.ts',
      env: {
        NODE_ENV: 'production',
        DATABASE_PATH: '/app/app_data/data/matchexec.db'
      }
    }
  ]
};