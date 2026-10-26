const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const selected = process.env.GITU_ANDROID_GOOGLE_SERVICES_FILE;
  const file = selected || (fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined);
  if (selected && !fs.existsSync(path.resolve(__dirname, selected))) throw new Error('GITU_ANDROID_GOOGLE_SERVICES_FILE does not exist.');
  if (file) {
    const google = JSON.parse(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
    if (
      google.type === 'service_account' ||
      !google.project_info?.project_id ||
      !google.client?.some((client) => client.client_info?.android_client_info?.package_name === config.android.package)
    ) {
      throw new Error('Use the Android google-services.json for dev.agentgitu.mobile, not a server service-account key.');
    }
  }
  return {
    ...config,
    android: { ...config.android, ...(file ? { googleServicesFile: file } : {}) },
    extra: { ...config.extra, fcmEnabled: Boolean(file) },
    plugins: [...(config.plugins || []), ['expo-notifications', { defaultChannel: 'gitu-workspace' }]],
  };
};
