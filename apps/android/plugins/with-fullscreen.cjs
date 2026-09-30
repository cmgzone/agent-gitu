const { withMainActivity } = require('expo/config-plugins');

module.exports = function withFullscreen(config) {
  return withMainActivity(config, result => {
    if (result.modResults.language !== 'kt') throw new Error('Fullscreen requires the Kotlin Android activity.');
    const marker = '  override fun onCreate(savedInstanceState: Bundle?) {';
    const contents = result.modResults.contents;
    if (!contents.includes('BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE')) {
      result.modResults.contents = contents.replace(marker, `  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      val controller = androidx.core.view.WindowInsetsControllerCompat(window, window.decorView)
      controller.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
    }
  }

${marker}`);
    }
    return result;
  });
};
