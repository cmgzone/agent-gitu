const { withProjectBuildGradle, withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withInstalledNdk(config) {
  config = withProjectBuildGradle(config, (result) => {
    const marker = 'apply plugin: "expo-root-project"';
    const override = "if (findProperty('gitu.ndkVersion')) { ext.ndkVersion = findProperty('gitu.ndkVersion') }";
    if (!result.modResults.contents.includes(override)) {
      result.modResults.contents = result.modResults.contents.replace(marker, `${override}\n\n${marker}`);
    }
    return result;
  });
  return withAppBuildGradle(config, (result) => {
    const override = "if (findProperty('gitu.cxxDirectory')) { android.externalNativeBuild.cmake.buildStagingDirectory = file(findProperty('gitu.cxxDirectory')) }";
    if (!result.modResults.contents.includes(override)) result.modResults.contents += `\n${override}\n`;
    return result;
  });
};
