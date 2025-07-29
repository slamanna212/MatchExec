module.exports = {
  apps: [
    {
      name: 'matchexec-web-server',
      script: './apps/web-server/dist/index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_file: './logs/web-server.log',
      error_file: './logs/web-server.error.log',
      out_file: './logs/web-server.out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '500M',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'database'],
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'matchexec-discord-bot',
      script: './apps/discord-bot/dist/index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      log_file: './logs/discord-bot.log',
      error_file: './logs/discord-bot.error.log',
      out_file: './logs/discord-bot.out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '300M',
      watch: false,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'matchexec-scheduler',
      script: './apps/scheduler/dist/index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      log_file: './logs/scheduler.log',
      error_file: './logs/scheduler.error.log',
      out_file: './logs/scheduler.out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '200M',
      watch: false,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
    },
    {
      name: 'matchexec-ocr',
      script: './apps/ocr/dist/index.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false, // OCR process runs on demand
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      log_file: './logs/ocr.log',
      error_file: './logs/ocr.error.log',
      out_file: './logs/ocr.out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '1G', // OCR might need more memory
      watch: false,
    },
  ],

  // Development configuration
  deploy: {
    development: {
      user: 'ubuntu',
      host: 'localhost',
      ref: 'origin/development',
      repo: 'git@github.com:username/matchexec.git',
      path: '/home/ubuntu/matchexec',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env development',
      'pre-setup': '',
    },

    // Production configuration
    production: {
      user: 'ubuntu',
      host: 'production-server',
      ref: 'origin/main',
      repo: 'git@github.com:username/matchexec.git',
      path: '/home/ubuntu/matchexec',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
}; 