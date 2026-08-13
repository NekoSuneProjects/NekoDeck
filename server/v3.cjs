// Root's native package/publish CLI is a .NET executable. Minimal Docker
// runtimes may not include libicu; .NET explicitly supports invariant mode for
// that case. Respect an operator override, otherwise enable the fallback before
// any Root build subprocesses are launched.
process.env.DOTNET_SYSTEM_GLOBALIZATION_INVARIANT ||= '1';

const { createApp: createBaseApp } = require('./app.cjs');
const { registerV2 } = require('./v2.cjs');
const { registerActivityManagementRoutes } = require('./activity-management.cjs');
const { registerAdvancedActivityRoutes } = require('./activity-web-host.cjs');
const { registerActivityRoutes } = require('./activities.cjs');
const { registerRootAppRoutes } = require('./rootapp.cjs');
const { registerBotBuilderRoutes } = require('./bots.cjs');
const { registerRootBuildRoutes } = require('./root-builds.cjs');

function createApp(options = {}) {
  const out = createBaseApp(options);
  registerV2(out.app, out.store);
  registerActivityManagementRoutes(out.app, out.store, options);
  registerAdvancedActivityRoutes(out.app, out.store, options);
  registerActivityRoutes(out.app, out.store, options);
  registerRootAppRoutes(out.app, out.store, options);
  registerBotBuilderRoutes(out.app, out.store, options);
  registerRootBuildRoutes(out.app, out.store, options);
  return out;
}

module.exports = { createApp };
