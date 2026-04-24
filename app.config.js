const baseConfig = require('./app.json');

module.exports = ({ config }) => {
  const expo = baseConfig.expo;

  return {
    ...expo,
    plugins: [
      'expo-secure-store',
      'expo-router',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow Krushi Express to use your location for booking rides.',
        },
      ],
      [
        '@rnmapbox/maps',
        {
          RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN || '',
        },
      ],
    ],
  };
};
