#!/usr/bin/env tsx

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🚀 Starting MatchExec application...');

async function runCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`▶️  Running: ${command}`);
    const child = exec(command, { cwd: process.cwd() });
    
    child.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });
    
    child.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}: ${command}`));
      }
    });

    child.on('error', reject);
  });
}

async function start(): Promise<void> {
  try {
    // Run database migrations first
    console.log('📊 Running database migrations and seeding...');
    await runCommand('npx tsx scripts/migrate.ts');
    console.log('✅ Database initialization completed');

    // Start PM2 processes
    console.log('🔄 Starting PM2 processes...');
    
    const pm2Process = spawn('pm2-runtime', ['ecosystem.config.js'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    pm2Process.on('exit', (code) => {
      console.log(`PM2 process exited with code ${code}`);
      process.exit(code || 0);
    });

    pm2Process.on('error', (error) => {
      console.error('❌ PM2 process error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Startup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

start();