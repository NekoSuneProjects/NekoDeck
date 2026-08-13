const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildScaffoldZip } = require('./rootapp.cjs');
const { buildRootZip } = require('./bots.cjs');
const { buildWithJsPackager } = require('./root-builds-arm64.cjs');

const jobs = new Map();
const JOB_TTL_MS = Number(process.env.NEKODECK_ROOT_JOB_TTL_MS || 30 * 60 * 1000);
const ARM_UPLOAD_ERROR = 'Root Build + Upload is not available on linux-arm64 because the current Root SDK does not ship a linux-arm64 upload CLI. Build the .pkg in NekoDeck, then upload it from a supported x64/desktop environment.';

function jsonError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function requireAdmin(req, res, next) {
  const token = process.env.NEKODECK_API_TOKEN || '';
  if (!token || req.get('X-NekoDeck-Token') === token) return next();
  return jsonError(res, 401, 'Admin token required');
}

function publicJob(job) {
  return {
    id: job.id, status: job.status, action: job.action, projectType: job.projectType, projectId: job.projectId,
    stage: job.stage, message: job.message || '', error: job.error || '', httpStatus: job.httpStatus || 200,
    filename: job.filename || '', createdAt: job.createdAt, updatedAt: job.updatedAt,
    downloadUrl: job.status === 'completed' && job.action === 'package' ? `/api/root-jobs/${job.id}/download` : ''
  };
}

function update(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function cleanExpired() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdMs < JOB_TTL_MS) continue;
    if (job.file && fs.existsSync(job.file)) fs.rmSync(job.file, { force: true });
    jobs.delete(id);
  }
}

async function executeJob(job, store, dataDir) {
  update(job, { status: 'running', stage: 'Preparing generated Root project…' });
  try {
    const isBot = job.projectType === 'bot';
    const publicItem = store.getPublicInstance(job.projectId);
    if (!publicItem || (isBot && publicItem.templateId !== 'bot-project')) {
      const error = new Error(isBot ? 'Bot project not found' : 'NekoDeck app not found');
      error.httpStatus = 404;
      throw error;
    }
    const built = isBot ? buildRootZip(publicItem) : buildScaffoldZip(publicItem, dataDir);
    const manifest = built.manifest;
    const safeName = String(publicItem.name || (isBot ? 'root-bot' : 'rootapp')).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'rootapp';
    const filename = isBot ? `${safeName}-RootBot-${manifest.version}.pkg` : `${safeName}-RootApp-${manifest.version}.pkg`;

    if (job.action === 'package') {
      update(job, { stage: 'Installing dependencies and building package…', filename });
      let result;
      if (process.platform === 'linux' && process.arch === 'arm64') {
        result = await buildWithJsPackager(built.zip, filename);
      } else {
        const nativeBuild = require('./root-builds.cjs').buildGeneratedRootPackage;
        if (typeof nativeBuild !== 'function') throw new Error('Root package builder is unavailable on this runtime');
        result = await nativeBuild(built.zip, { filename });
      }
      const file = path.join(os.tmpdir(), `nekodeck-root-job-${job.id}.pkg`);
      fs.writeFileSync(file, result.buffer);
      update(job, { status: 'completed', stage: 'Ready', file, filename: result.filename || filename, message: 'Root package built successfully.' });
      return;
    }

    if (process.platform === 'linux' && process.arch === 'arm64') {
      const error = new Error(ARM_UPLOAD_ERROR);
      error.httpStatus = 501;
      throw error;
    }

    const privateItem = store.getPrivateInstance(job.projectId);
    const authToken = isBot ? privateItem?.credentials?.rootBotAuthToken : privateItem?.credentials?.rootAuthToken;
    const host = isBot ? privateItem?.config?.rootapp?.uploadHost : privateItem?.config?.rootApp?.uploadHost;
    const nativeBuild = require('./root-builds.cjs').buildGeneratedRootPackage;
    if (typeof nativeBuild !== 'function') throw new Error('Root publish builder is unavailable on this runtime');
    update(job, { stage: 'Building package and uploading to Root…' });
    const result = await nativeBuild(built.zip, { publish: true, authToken: authToken || '', host: host || '' });
    update(job, { status: 'completed', stage: 'Published', message: isBot ? 'Root Bot package built and uploaded successfully.' : 'RootApp package built and uploaded successfully.', logs: result.logs || '' });
  } catch (error) {
    update(job, { status: 'failed', stage: 'Failed', error: error.message || String(error), httpStatus: error.httpStatus || 500 });
    console.error(`[RootJob ${job.id}] ${job.error}`);
  }
}

function createJob(store, dataDir, projectType, projectId, action) {
  cleanExpired();
  const id = crypto.randomUUID();
  const job = {
    id, projectType, projectId, action, status: 'queued', stage: 'Queued', message: '', error: '', logs: '',
    filename: '', file: '', httpStatus: 200, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdMs: Date.now()
  };
  jobs.set(id, job);
  setImmediate(() => executeJob(job, store, dataDir));
  return job;
}

function registerRootJobRoutes(app, store, options = {}) {
  const dataDir = options.dataDir || process.env.NEKODECK_DATA_DIR || path.resolve(__dirname, '..', 'data');
  const arm64 = process.platform === 'linux' && process.arch === 'arm64';

  // Compatibility aliases for the existing UI. On supported runtimes these
  // enqueue immediately so reverse proxies do not hold a request until a 524.
  // ARM64 keeps the existing explicit 501 because Root ships no upload CLI.
  app.post('/api/rootapp/:id/publish', requireAdmin, (req, res) => {
    if (arm64) return jsonError(res, 501, ARM_UPLOAD_ERROR);
    const item = store.getPublicInstance(req.params.id);
    if (!item) return jsonError(res, 404, 'NekoDeck app not found');
    const job = createJob(store, dataDir, 'app', req.params.id, 'publish');
    return res.status(202).json({ ok: true, message: `RootApp upload started in background. Job ${job.id}`, job: publicJob(job) });
  });

  app.post('/api/bots/:id/publish/root', requireAdmin, (req, res) => {
    if (arm64) return jsonError(res, 501, ARM_UPLOAD_ERROR);
    const item = store.getPublicInstance(req.params.id);
    if (!item || item.templateId !== 'bot-project') return jsonError(res, 404, 'Bot project not found');
    const job = createJob(store, dataDir, 'bot', req.params.id, 'publish');
    return res.status(202).json({ ok: true, message: `Root Bot upload started in background. Job ${job.id}`, job: publicJob(job) });
  });

  app.post('/api/root-jobs', requireAdmin, (req, res) => {
    const projectType = req.body?.projectType === 'bot' ? 'bot' : req.body?.projectType === 'app' ? 'app' : '';
    const action = req.body?.action === 'publish' ? 'publish' : req.body?.action === 'package' ? 'package' : '';
    const projectId = String(req.body?.projectId || '').trim();
    if (!projectType || !action || !projectId) return jsonError(res, 400, 'projectType, projectId and action are required');
    if (action === 'publish' && arm64) return jsonError(res, 501, ARM_UPLOAD_ERROR);
    const job = createJob(store, dataDir, projectType, projectId, action);
    return res.status(202).json({ ok: true, job: publicJob(job) });
  });

  app.get('/api/root-jobs/:id', requireAdmin, (req, res) => {
    cleanExpired();
    const job = jobs.get(req.params.id);
    if (!job) return jsonError(res, 404, 'Root build job not found or expired');
    return res.json({ ok: true, job: publicJob(job) });
  });

  app.get('/api/root-jobs/:id/download', requireAdmin, (req, res) => {
    cleanExpired();
    const job = jobs.get(req.params.id);
    if (!job) return jsonError(res, 404, 'Root build job not found or expired');
    if (job.status !== 'completed' || job.action !== 'package' || !job.file || !fs.existsSync(job.file)) return jsonError(res, 409, 'Root package is not ready');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${job.filename || 'rootapp.pkg'}"`);
    res.setHeader('X-NekoDeck-Root-Job', job.id);
    return res.sendFile(job.file);
  });
}

module.exports = { registerRootJobRoutes, publicJob, createJob, jobs, ARM_UPLOAD_ERROR };
