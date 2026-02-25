// Patch Metro's file watcher to use polling on Windows
// This must be loaded before Metro starts

if (process.platform === 'win32') {
  // Set environment variables before any modules are loaded
  process.env.CHOKIDAR_USEPOLLING = 'true';
  process.env.CHOKIDAR_INTERVAL = '1000';
  process.env.CHOKIDAR_BINARY_INTERVAL = '1000';
  
  // Try to patch metro-file-map if it's available
  try {
    const metroFileMap = require('metro-file-map');
    if (metroFileMap && metroFileMap.createWatcher) {
      const originalCreateWatcher = metroFileMap.createWatcher;
      metroFileMap.createWatcher = function(options) {
        return originalCreateWatcher.call(this, {
          ...options,
          usePolling: true,
          interval: 1000,
        });
      };
    }
  } catch (e) {
    // metro-file-map might not be loaded yet, that's okay
  }
}


