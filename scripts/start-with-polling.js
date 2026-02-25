// Start script with polling enabled for file watching
process.env.CHOKIDAR_USEPOLLING = 'true';
process.env.CHOKIDAR_INTERVAL = '1000';

// Start Expo
require('expo-cli/bin/expo.js');


