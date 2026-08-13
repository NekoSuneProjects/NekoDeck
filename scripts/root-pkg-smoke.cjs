const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildRootZip, normalizeBotConfig } = require('../server/bots.cjs');

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekodeck-root-pkg-smoke-'));

function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: workDir,
    stdio: 'inherit',
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' }
  });
}

try {
  const config = normalizeBotConfig({
    description: 'NekoDeck Root package CI smoke test',
    platforms: { discord: false, rootapp: true },
    rootapp: {
      // Root App/Bot IDs use a compact URL-safe identifier format.
      // Packaging validates the format locally but does not require this CI ID to be registered.
      projectId: 'ACj4U-eThgmjXUOBAjk_jw',
      version: '0.0.1',
      settings: {},
      permissions: {}
    },
    commands: [{
      name: 'ping',
      description: 'Smoke-test command',
      response: 'Pong',
      discord: false,
      rootapp: true
    }],
    autoReplies: []
  });

  const { zip } = buildRootZip({
    id: 'root-pkg-ci',
    templateId: 'bot-project',
    name: 'NekoDeck Root Package CI',
    config
  });

  zip.extractAllTo(workDir, true);
  run('npm', ['install', '--no-audit', '--no-fund']);
  run('npm', ['run', 'build']);
  run('npx', ['rootsdk', 'build', 'package', '--output-file', './rootapp.pkg', '--project-folder', '.']);

  const pkgPath = path.join(workDir, 'rootapp.pkg');
  if (!fs.existsSync(pkgPath)) throw new Error('Root SDK did not create rootapp.pkg');
  const stat = fs.statSync(pkgPath);
  if (!stat.size) throw new Error('rootapp.pkg was created but is empty');
  console.log(`Root package smoke test passed: ${pkgPath} (${stat.size} bytes)`);

  const header = fs.readFileSync(pkgPath).subarray(0, 64);
  console.log(`Root package first 64 bytes (hex): ${header.toString('hex')}`);
  try { run('file', ['rootapp.pkg']); } catch {}
  try { run('unzip', ['-l', 'rootapp.pkg']); } catch {}
  try { run('tar', ['-tf', 'rootapp.pkg']); } catch {}
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
