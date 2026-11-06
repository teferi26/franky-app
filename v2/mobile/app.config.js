// EAS file variables provide a path on the build runner. Never embed a Google
// service-account private key here: this is only Firebase's Android app config.
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config: base }) => {
  // Google Maps Android key: build-time env (EAS secret), never committed.
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const config = mapsKey
    ? { ...base, android: { ...base.android, config: { ...base.android?.config, googleMaps: { apiKey: mapsKey } } } }
    : base;
  const file = process.env.GOOGLE_SERVICES_JSON || config.android?.googleServicesFile;
  if (!file) return config;
  let firebase;
  try {
    firebase = JSON.parse(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
  } catch {
    throw new Error('GOOGLE_SERVICES_JSON debe apuntar al archivo Android descargado de Firebase.');
  }
  if (!firebase || firebase.private_key || firebase.type === 'service_account') {
    throw new Error('No incluyas una clave privada de servicio en la app. EAS gestiona las credenciales FCM por separado.');
  }
  if (!/^\d+$/.test(firebase.project_info?.project_number ?? '') ||
      !firebase.client?.some(client => client.client_info?.android_client_info?.package_name === config.android?.package &&
        typeof client.client_info?.mobilesdk_app_id === 'string')) {
    throw new Error('El archivo Firebase no contiene la aplicación Android de Franky.');
  }
  return { ...config, android: { ...config.android, googleServicesFile: file } };
};
