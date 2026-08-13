const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildScaffoldZip } = require('./rootapp.cjs');
const { buildRootZip } = require('./bots.cjs');

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

function packageArgs() {
  return ['rootsdk', 'build', 'package', '--output-file', './rootapp.pkg', '--project-folder', '.'];
}

function cleanHost(value) {
  const host = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!host) return '';
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) throw new Error('Root upload host must be a hostname such as dev.rootapp.com');
  return host;
}

function uploadArgs(authToken, host = '') {
  const args = ['rootsdk', 'upload', 'package', '--file', './rootapp.pkg', '--authToken', authToken];
  const safeHost = cleanHost(host);
  if (safeHost) args.push('--host', safeHost);
  return args;
}

function redact(value, secrets = []) {
  let out = String(value || '');
  for (const secret of secrets.filter(Boolean)) out = out.split(secret).join('[REDACTED]');
  return out;
}

function run(command, args, cwd, options = {}) {
  const timeoutMs = Number(process.env.NEKODECK_ROOT_BUILD_TIMEOUT_MS || 10 * 60 * 1000);
  const maxOutput = Number(process.env.NEKODECK_ROOT_BUILD_LOG_BYTES || 2 * 1024 * 1024);
  const secrets = options.secrets || [];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        ...(options.env || {})
      },
      windowsHide: true,
      shell: false
    });
    let output = '';
    let killed = false;
    const append = (chunk) => {
      if (output.length >= maxOutput) return;
      output += chunk.toString('utf8').slice(0, maxOutput - output.length);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, Math.max(30_000, timeoutMs));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Unable to start ${command}: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const safeOutput = redact(output, secrets).trim();
      if (killed) return reject(new Error(`Root build timed out after ${Math.round(timeoutMs / 1000)} seconds${safeOutput ? `\n${safeOutput}` : ''}`));
      if (code !== 0) return reject(new Error(`Root command failed with exit code ${code}${safeOutput ? `\n${safeOutput}` : ''}`));
      resolve(safeOutput);
    });
  });
}

async function buildGeneratedRootPackage(zip, options = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekodeck-root-'));
  const logs = [];
  const authToken = options.authToken || '';
  try {
    zip.extractAllTo(workDir, true);
    logs.push(await run(executable('npm'), ['install', '--no-audit', '--no-fund'], workDir));
    logs.push(await run(executable('npm'), ['run', 'build'], workDir));
    logs.push(await run(executable('npx'), packageArgs(), workDir));
    const pkgPath = path.join(workDir, 'rootapp.pkg');
    if (!fs.existsSync(pkgPath)) throw new Error('Root SDK completed without creating rootapp.pkg');

    if (options.publish) {
      if (!authToken) throw new Error('Root upload auth token is not stored for this project');
      logs.push(await run(executable('npx'), uploadArgs(authToken, options.host), workDir, { secrets: [authToken] }));
    }

    return {
      buffer: fs.readFileSync(pkgPath),
      logs: logs.filter(Boolean).join('\n\n'),
      filename: options.filename || 'rootapp.pkg'
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function registerRootBuildRoutes(app, store, options = {}) {
  const dataDir = options.dataDir || process.env.NEKODECK_DATA_DIR || path.resolve(__dirname, '..', 'data');

  app.get('/api/rootapp/:id/package', requireAdmin, async (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item) return jsonError(res, 404, 'NekoDeck app not found');
    try {
      const root = item.config?.rootApp || {};
      const { zip, manifest } = buildScaffoldZip(item, dataDir);
      const safeName = String(item.name || 'rootapp').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'rootapp';
      const result = await buildGeneratedRootPackage(zip, { filename: `${safeName}-RootApp-${manifest.version}.pkg` });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-NekoDeck-Root-Package', 'built');
      if (root.uploadHost) res.setHeader('X-NekoDeck-Root-Host', cleanHost(root.uploadHost));
      return res.send(result.buffer);
    } catch (error) {
      return jsonError(res, 500, error.message);
    }
  });

  app.post('/api/rootapp/:id/publish', requireAdmin, async (req, res) => {
    const item = store.getPrivateInstance(req.params.id);
    if (!item) return jsonError(res, 404, 'NekoDeck app not found');
    try {
      const { zip } = buildScaffoldZip(store.getPublicInstance(req.params.id), dataDir);
      const result = await buildGeneratedRootPackage(zip, {
        publish: true,
        authToken: item.credentials?.rootAuthToken || '',
        host: item.config?.rootApp?.uploadHost || ''
      });
      return res.json({ ok: true, message: 'RootApp package built and uploaded successfully.', logs: result.logs });
    } catch (error) {
      return jsonError(res, 500, error.message);
    }
  });

  app.get('/api/bots/:id/export/root-pkg', requireAdmin, async (req, res) => {
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    try {
      const { zip, manifest } = buildRootZip(item);
      const safeName = String(item.name || 'root-bot').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'root-bot';
      const result = await buildGeneratedRootPackage(zip, { filename: `${safeName}-RootBot-${manifest.version}.pkg` });
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('X-NekoDeck-Root-Package', 'built');
      return res.send(result.buffer);
    } catch (error) {
      return jsonError(res, 500, error.message);
    }
  });

  app.post('/api/bots/:id/publish/root', requireAdmin, async (req, res) => {
    const item = store.getPrivateInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    try {
      const { zip } = buildRootZip(store.getPublicInstance(req.params.id));
      const result = await buildGeneratedRootPackage(zip, {
        publish: true,
        authToken: item.credentials?.rootBotAuthToken || '',
        host: item.config?.rootapp?.uploadHost || ''
      });
      return res.json({ ok: true, message: 'Root Bot package built and uploaded successfully.', logs: result.logs });
    } catch (error) {
      return jsonError(res, 500, error.message);
    }
  });
}

module.exports = {
  registerRootBuildRoutes,
  buildGeneratedRootPackage,
  packageArgs,
  uploadArgs,
  cleanHost
};
