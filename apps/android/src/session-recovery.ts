/** Notify the native shell after a server restart invalidates its session cookie. */
export const SESSION_RECOVERY_SCRIPT = `
(function () {
  var originalFetch = window.fetch;
  window.fetch = function (resource, options) {
    return originalFetch.call(this, resource, options).then(function (response) {
      if (response.status === 401 && new URL(response.url, location.href).origin === location.origin) {
        window.ReactNativeWebView.postMessage('gitu:session-expired');
      }
      return response;
    });
  };
})();
true;
`;
