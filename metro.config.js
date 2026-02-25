// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Set watchFolders to current directory
config.watchFolders = [__dirname];

// For Windows network drives, we need to configure the watcher differently
// Metro uses metro-file-map which uses Node's fs.watch
// On Windows network drives, this can fail, so we'll configure it to be more resilient
if (process.platform === 'win32') {
  // Try to configure watcher to ignore errors and retry
  // Note: Metro doesn't directly expose watcher options, but we can try to patch it
  const originalCreateWatcher = config.watcher;
  
  // Set environment variables that metro-file-map might respect
  process.env.CHOKIDAR_USEPOLLING = 'true';
  process.env.CHOKIDAR_INTERVAL = '1000';
  process.env.CHOKIDAR_BINARY_INTERVAL = '1000';
}

module.exports = config;
