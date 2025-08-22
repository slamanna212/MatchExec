#!/usr/bin/env node

const http = require('http');
const { execSync } = require('child_process');

async function checkWebApp() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(res.statusCode === 200 && response.status === 'healthy');
        } catch {
          resolve(false);
        }
      });
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

function checkPM2Processes() {
  try {
    const output = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    
    const requiredProcesses = ['matchexec-web', 'discord-bot', 'scheduler', 'worker'];
    const runningProcesses = processes
      .filter(p => p.pm2_env.status === 'online')
      .map(p => p.name);
    
    return requiredProcesses.every(name => runningProcesses.includes(name));
  } catch {
    return false;
  }
}

async function main() {
  console.log('Running health checks...');
  
  const webAppHealthy = await checkWebApp();
  const pm2ProcessesHealthy = checkPM2Processes();
  
  if (webAppHealthy && pm2ProcessesHealthy) {
    console.log('✓ All health checks passed');
    process.exit(0);
  } else {
    console.log('✗ Health checks failed');
    console.log(`  Web App: ${webAppHealthy ? '✓' : '✗'}`);
    console.log(`  PM2 Processes: ${pm2ProcessesHealthy ? '✓' : '✗'}`);
    process.exit(1);
  }
}

main().catch(() => process.exit(1));