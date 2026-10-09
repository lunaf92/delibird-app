// Signs Android release builds with Strena's own key instead of Expo's public debug key. The key never goes in the
// repo: it is read at build time from a properties file (storeFile, storePassword, keyAlias, keyPassword), by default
// ~/.local/share/strena-android/strena-release.properties, or the path in STRENA_RELEASE_KEY. App Links on
// strena.app are tied to this key (app/public/.well-known/assetlinks.json), so a build without it won't open them.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// Strena release signing';

const LOAD_KEY = `${MARKER}
def strenaKeyFile = file(System.getenv('STRENA_RELEASE_KEY') ?: "\${System.getProperty('user.home')}/.local/share/strena-android/strena-release.properties")
def strenaKey = new Properties()
if (strenaKeyFile.exists()) {
    strenaKeyFile.withInputStream { strenaKey.load(it) }
} else {
    logger.warn("Strena: no release key at \${strenaKeyFile}, so release builds are signed with the debug key.")
}

android {`;

const RELEASE_CONFIG = `signingConfigs {
        release {
            if (strenaKeyFile.exists()) {
                storeFile file(strenaKey['storeFile'])
                storePassword strenaKey['storePassword']
                keyAlias strenaKey['keyAlias']
                keyPassword strenaKey['keyPassword']
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradle) => {
    let source = gradle.modResults.contents;
    if (source.includes(MARKER)) return gradle;
    const releaseSigning = /(release \{[^}]*?)signingConfig signingConfigs\.debug/;
    if (
      !/^android \{/m.test(source) ||
      !source.includes('signingConfigs {') ||
      !releaseSigning.test(source)
    ) {
      throw new Error(
        'release-signing: app/build.gradle no longer looks as expected; update plugins/release-signing.js',
      );
    }
    source = source.replace(/^android \{/m, LOAD_KEY);
    source = source.replace('signingConfigs {', RELEASE_CONFIG);
    source = source.replace(
      releaseSigning,
      '$1signingConfig strenaKeyFile.exists() ? signingConfigs.release : signingConfigs.debug',
    );
    gradle.modResults.contents = source;
    return gradle;
  });
};
