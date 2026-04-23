#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { logger } from '../src/lib/logger/server';

logger.debug('🚀 Starting MatchExec application...');

async function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.debug(`▶️  Running: ${cmd} ${args.join(' ')}`);
    const child = spawn(cmd, args, { cwd: process.cwd(), shell: false });
    
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
        reject(new Error(`Command failed with code ${code}: ${cmd} ${args.join(' ')}`));
      }
    });

    child.on('error', reject);
  });
}

async function start(): Promise<void> {
  try {
    // Run database migrations first
    logger.debug('📊 Running database migrations and seeding...');
    await runCommand('npx', ['tsx', 'scripts/migrate-background.ts']);
    logger.debug('✅ Database initialization completed');

    // Start PM2 processes
    logger.debug('🔄 Starting PM2 processes...');
    
    const pm2Process = spawn('pm2-runtime', ['ecosystem.config.js'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    pm2Process.on('exit', (code) => {
      logger.debug(`PM2 process exited with code ${code}`);
      process.exit(code || 0);
    });

    pm2Process.on('error', (error) => {
      logger.error('❌ PM2 process error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    logger.error('❌ Startup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

start();