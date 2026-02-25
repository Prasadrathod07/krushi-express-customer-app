#!/usr/bin/env node

// Patch Metro's watcher BEFORE any modules are loaded
require('./patch-metro-watcher.js');

// Set environment variables
process.env.CHOKIDAR_USEPOLLING = 'true';
process.env.CHOKIDAR_INTERVAL = '1000';

// Import and run expo
const { spawn } = require('child_process');

console.log('Starting Expo...');
console.log('Note: If file watcher fails, press "r" to manually reload\n');

const expoProcess = spawn('npx', ['expo', 'start'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    CHOKIDAR_USEPOLLING: 'true',
    CHOKIDAR_INTERVAL: '1000',
  },
});

expoProcess.on('error', (error) => {
  console.error('Failed to start Expo:', error);
  process.exit(1);
});

expoProcess.on('exit', (code) => {
  process.exit(code || 0);
});

