const { createApp: createBaseApp } = require('./app.cjs');
const { registerV2 } = require('./v2.cjs');
const { registerAdvancedActivityRoutes } = require('./activity-web-host.cjs');
const { registerActivityRoutes } = require('./activities.cjs');

function createApp(options = {}) {
  const out = createBaseApp(options);
  registerV2(out.app, out.store);
  registerAdvancedActivityRoutes(out.app, out.store, options);
  registerActivityRoutes(out.app, out.store, options);
  return out;
}

module.exports = { createApp };
