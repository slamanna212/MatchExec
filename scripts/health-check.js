#!/usr/bin/env node

import http from 'http';
import { execSync } from 'child_process';

async function checkWebApp() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET',
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          const isHealthy = res.statusCode === 200 && response.status === 'healthy';
          if (!isHealthy) {
            console.log(`Web app check failed: status ${res.statusCode}, response:`, data);
          }
          resolve(isHealthy);
        } catch (error) {
          console.log(`Web app check failed: JSON parse error:`, error.message, 'data:', data);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`Web app check failed: request error:`, error.message);
      resolve(false);
    });
    req.on('timeout', () => {
      console.log(`Web app check failed: request timeout`);
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

function checkPM2Processes() {
  try {
    // Try global pm2 first, then local npx pm2
    let output;
    try {
      output = execSync('pm2 jlist', { encoding: 'utf8' });
    } catch {
      output = execSync('npx pm2 jlist', { encoding: 'utf8' });
    }
    const processes = JSON.parse(output);
    
    const requiredProcesses = ['matchexec-web', 'discord-bot', 'scheduler'];
    const runningProcesses = processes
      .filter(p => p.pm2_env.status === 'online')
      .map(p => p.name);
    
    const missingProcesses = requiredProcesses.filter(name => !runningProcesses.includes(name));
    if (missingProcesses.length > 0) {
      console.log(`PM2 check failed: missing processes:`, missingProcesses);
      console.log(`Running processes:`, runningProcesses);
      console.log(`All processes:`, processes.map(p => ({ name: p.name, status: p.pm2_env.status })));
    }
    
    return requiredProcesses.every(name => runningProcesses.includes(name));
  } catch (error) {
    console.log(`PM2 check failed: command error:`, error.message);
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