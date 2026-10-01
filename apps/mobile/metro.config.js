const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// The companion is self-contained; the retained upstream sources are inactive.
config.resolver.nodeModulesPaths = [require('node:path').join(__dirname, 'node_modules')];
module.exports = config;
