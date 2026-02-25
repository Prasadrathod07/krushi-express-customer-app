// Patch Metro's file watcher to handle Windows network drive errors
// This must be loaded before Metro starts

const Module = require('module');
const originalRequire = Module.prototype.require;

// Patch metro-file-map's watcher to catch and ignore errors
Module.prototype.require = function(...args) {
  const result = originalRequire.apply(this, args);
  
  // If this is metro-file-map, patch its watcher
  if (args[0] === 'metro-file-map' && result && result.createWatcher) {
    const originalCreateWatcher = result.createWatcher;
    result.createWatcher = function(options) {
      try {
        const watcher = originalCreateWatcher.call(this, options);
        
        // Wrap the watcher to catch errors
        if (watcher && watcher.on) {
          const originalOn = watcher.on;
          watcher.on = function(event, handler) {
            if (event === 'error') {
              // Wrap error handler to log but not crash
              return originalOn.call(this, event, (error) => {
                if (error.code === 'UNKNOWN' && error.syscall === 'watch') {
                  console.warn('⚠️  File watcher error on network drive (this is expected). Hot reload may not work automatically.');
                  console.warn('   Press "r" in the terminal to manually reload when you make changes.');
                  // Don't crash, just log the warning
                  return;
                }
                // For other errors, call the original handler
                if (handler) handler(error);
              });
            }
            return originalOn.call(this, event, handler);
          };
        }
        
        return watcher;
      } catch (error) {
        // If watcher creation fails, return a no-op watcher
        console.warn('⚠️  Could not create file watcher. Hot reload disabled.');
        console.warn('   Press "r" in the terminal to manually reload when you make changes.');
        return {
          on: () => {},
          close: () => {},
          getWatcher: () => ({ on: () => {}, close: () => {} }),
        };
      }
    };
  }
  
  return result;
};


