const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const tar = require('tar');

function safeRelativePath(value, label) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${label} is required`);
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!normalized || path.isAbsolute(raw) || normalized.split('/').includes('..')) {
    throw new Error(`${label} must be a safe path inside the generated Root project`);
  }
  return normalized;
}

function existingPaths(projectDir, values, label) {
  const list = Array.isArray(values) ? values : (values ? [values] : []);
  const result = [];
  for (const value of list) {
    const relative = safeRelativePath(value, label);
    const absolute = path.resolve(projectDir, relative);
    const root = `${path.resolve(projectDir)}${path.sep}`;
    if (absolute !== path.resolve(projectDir) && !absolute.startsWith(root)) {
      throw new Error(`${label} escapes the generated Root project`);
    }
    if (!fs.existsSync(absolute)) throw new Error(`${label} path does not exist after build: ${relative}`);
    result.push(relative);
  }
  return [...new Set(result)];
}

function packageFilter(entryPath) {
  const normalized = String(entryPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  // Root's native packager excludes its own development tooling from the
  // deployed node_modules tree. Match that behavior in the JS fallback.
  if (normalized === 'node_modules/@rootsdk/dev-tools' || normalized.startsWith('node_modules/@rootsdk/dev-tools/')) return false;
  if (normalized.includes('/node_modules/@rootsdk/dev-tools/')) return false;
  return true;
}

async function createGzipTar(file, cwd, entries, options = {}) {
  if (!entries.length) {
    // A valid empty POSIX tar archive is two 512-byte zero blocks. Root always
    // places client.tar.gz in the outer package, even for server-only Bots.
    fs.writeFileSync(file, zlib.gzipSync(Buffer.alloc(1024), { level: 1 }));
    return;
  }
  await tar.create({
    cwd,
    file,
    gzip: { level: 1 },
    portable: true,
    noMtime: true,
    strict: true,
    prefix: options.prefix || '',
    filter: options.filter
  }, entries);
}

async function createRootPackageJs(projectDir, outputFile) {
  const manifestPath = path.join(projectDir, 'root-manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('root-manifest.json is missing from the generated Root project');

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { throw new Error('root-manifest.json is not valid JSON'); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('root-manifest.json must contain an object');
  if (!manifest.id) throw new Error('Root manifest id is required');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(manifest.version || ''))) {
    throw new Error('Root manifest version must use semantic versioning');
  }

  const pkg = manifest.package || {};
  const server = pkg.server || {};
  if (!server.launch || !String(server.launch).endsWith('.js')) throw new Error('Root manifest server.launch must point to a .js file');
  const serverLaunch = safeRelativePath(server.launch, 'Root server launch');
  if (!fs.existsSync(path.join(projectDir, serverLaunch))) throw new Error(`Root server launch file does not exist after build: ${serverLaunch}`);

  const serverEntries = existingPaths(projectDir, [
    ...(Array.isArray(server.deploy) ? server.deploy : (server.deploy ? [server.deploy] : [])),
    ...(Array.isArray(server.nodeModules) ? server.nodeModules : (server.nodeModules ? [server.nodeModules] : []))
  ], 'Root server package');
  if (!serverEntries.length) throw new Error('Root manifest server package has no deploy or nodeModules paths');

  const clientEntries = pkg.client?.deploy
    ? existingPaths(projectDir, [pkg.client.deploy], 'Root client package')
    : [];

  const stageDir = fs.mkdtempSync(path.join(path.dirname(outputFile), '.nekodeck-root-package-'));
  try {
    const serverTar = path.join(stageDir, 'server.tar.gz');
    const clientTar = path.join(stageDir, 'client.tar.gz');
    const stagedManifest = path.join(stageDir, 'root-manifest.json');

    await createGzipTar(serverTar, projectDir, serverEntries, { prefix: 'app/', filter: packageFilter });
    await createGzipTar(clientTar, projectDir, clientEntries, { prefix: 'app/' });
    fs.copyFileSync(manifestPath, stagedManifest);

    await tar.create({
      cwd: stageDir,
      file: outputFile,
      gzip: { level: 1 },
      portable: true,
      noMtime: true,
      strict: true
    }, ['client.tar.gz', 'server.tar.gz', 'root-manifest.json']);

    if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
      throw new Error('NekoDeck JS Root packager did not create a non-empty .pkg file');
    }

    return {
      outputFile,
      serverEntries,
      clientEntries,
      message: `NekoDeck JS Root packager created ${path.basename(outputFile)} for ${process.platform}-${process.arch}`
    };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

function needsJsRootPackager() {
  return process.env.NEKODECK_ROOT_FORCE_JS_PACKAGER === '1' || (process.platform === 'linux' && process.arch === 'arm64');
}

function nativeRootUploadSupported() {
  return !(process.platform === 'linux' && process.arch === 'arm64');
}

module.exports = {
  createRootPackageJs,
  needsJsRootPackager,
  nativeRootUploadSupported,
  safeRelativePath,
  packageFilter
};
