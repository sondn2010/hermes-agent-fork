// Hand-written, no build step. The /dia page is a core dashboard route; this plugin ships only its
// backend API. The hidden tab still loads `entry`, so register an empty component to avoid a script
// 404 and an unregistered-plugin warning.
(function () {
  "use strict";
  if (window.__HERMES_PLUGINS__) {
    window.__HERMES_PLUGINS__.register("bkt-dia-common", function () { return null; });
  }
})();
