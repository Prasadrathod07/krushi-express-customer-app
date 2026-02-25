#!/usr/bin/env node

// Start script with environment variables set
const { spawn } = require('child_process');

console.log('Starting Expo...\n');

// Set environment variables (may help with some watchers)
const env = {
  ...process.env,
  CHOKIDAR_USEPOLLING: 'true',
  CHOKIDAR_INTERVAL: '1000',
};

const expoProcess = spawn('npx', ['expo', 'start'], {
  stdio: 'inherit',
  shell: true,
  env: env,
});

expoProcess.on('error', (error) => {
  console.error('Failed to start Expo:', error);
  process.exit(1);
});

expoProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.log('\n⚠️  If you got a file watcher error:');
    console.log('   1. Run .\\fix-windows-watcher.ps1 as Administrator');
    console.log('   2. Restart your computer');
    console.log('   3. Try npm start again');
    console.log('');
    console.log('   Or move the project to a local drive (C:)');
  }
  process.exit(code || 0);
});

