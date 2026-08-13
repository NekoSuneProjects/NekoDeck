const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildScaffoldZip } = require('./rootapp.cjs');
const { buildRootZip } = require('./bots.cjs');
const { createRootPackageJs } = require('./root-package-js.cjs');

function jsonError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function requireAdmin(req, res, next) {
  const token = process.env.NEKODECK_API_TOKEN || '';
  if (!token || req.get('X-NekoDeck-Token') === token) return next();
  return jsonError(res, 401, 'Admin token required');
}

function executable(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function runBuildCommand(command, args, cwd) {
  const timeoutMs = Number(process.env.NEKODECK_ROOT_BUILD_TIMEOUT_MS || 10 * 60 * 1000);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        npm_config_include: 'dev',
        npm_config_omit: '',
        npm_config_audit: 'false',
        npm_config_fund: 'false'
      },
      windowsHide: true,
      shell: false
    });
    let output = '';
    const append = chunk => { output += chunk.toString('utf8'); };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => child.kill('SIGKILL'), Math.max(30_000, timeoutMs));
    child.on('error', error => {
      clearTimeout(timer);
      reject(new Error(`Unable to start ${command}: ${error.message}`));
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Root build command failed with exit code ${code}${output.trim() ? `\n${output.trim()}` : ''}`));
      resolve(output.trim());
    });
  });
}

async function buildWithJsPackager(zip, filename) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekodeck-root-js-'));
  try {
    zip.extractAllTo(workDir, true);
    await runBuildCommand(executable('npm'), ['install', '--include=dev', '--no-audit', '--no-fund'], workDir);
    await runBuildCommand(executable('npm'), ['run', 'build'], workDir);
    const pkgPath = path.join(workDir, 'rootapp.pkg');
    await createRootPackageJs(workDir, pkgPath);
    return { buffer: fs.readFileSync(pkgPath), filename };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function uploadUnsupported(res) {
  return jsonError(
    res,
    501,
    'Root Build + Upload is not available on linux-arm64 because the current Root SDK does not ship a linux-arm64 upload CLI. Build the .pkg in NekoDeck, then upload it from a supported x64/desktop environment.'
  );
}

function registerRootBuildRoutes(app, store, options = {}) {
  const dataDir = options.dataDir || process.env.NEKODECK_DATA_DIR || path.resolve(__dirname, '..', 'data');

  app.get('/api/rootapp/:id/package', requireAdmin, async (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item) return jsonError(res, 404, 'NekoDeck app not found');
    try {
      const { zip, manifest } = buildScaffoldZip(item, dataDir);
      const safeName = String(item.name || 'rootapp').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'rootapp';
      const result = await buildWithJsPackager(zip, `${safeName}-RootApp-${manifest.version}.pkg`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-NekoDeck-Root-Package', 'built-js-arm64');
      return res.send(result.buffer);
    } catch (error) {
      return jsonError(res, 500, error.message);
    }
  });

  app.post('/api/rootapp/:id/publish', requireAdmin, (_req, res) => uploadUnsupported(res));

  app.get('/api/bots/:id/export/root-pkg', requireAdmin, async (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    try {
      const { zip, manifest } = buildRootZip(item);
      const safeName = String(item.name || 'root-bot').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'root-bot';
      const result = await buildWithJsPackager(zip, `${safeName}-RootBot-${manifest.version}.pkg`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-NekoDeck-Root-Package', 'built-js-arm64');
      return res.send(result.buffer);
    } catch (error) {
      return jsonError(res, 500, error.message);
    }
  });

  app.post('/api/bots/:id/publish/root', requireAdmin, (_req, res) => uploadUnsupported(res));
}

module.exports = { registerRootBuildRoutes, buildWithJsPackager };
