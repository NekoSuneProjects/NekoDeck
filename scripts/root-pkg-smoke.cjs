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

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: workDir,
    encoding: 'utf8',
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' }
  });
}

try {
  const config = normalizeBotConfig({
    description: 'NekoDeck Root package CI smoke test',
    platforms: { discord: false, rootapp: true },
    rootapp: {
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
  try { run('tar', ['-tf', 'rootapp.pkg']); } catch {}

  run('tar', ['-xzf', 'rootapp.pkg', 'server.tar.gz', 'client.tar.gz']);
  const serverEntries = capture('tar', ['-tzf', 'server.tar.gz']).trim().split('\n');
  const clientEntries = capture('tar', ['-tzf', 'client.tar.gz']).trim().split('\n').filter(Boolean);
  console.log(`server.tar.gz entries: ${serverEntries.length}`);
  console.log(serverEntries.slice(0, 80).join('\n'));
  console.log(`client.tar.gz entries: ${clientEntries.length}`);
  console.log(clientEntries.slice(0, 80).join('\n'));
  console.log(`server contains @rootsdk/dev-tools: ${serverEntries.some(x => x.includes('@rootsdk/dev-tools'))}`);
  console.log(`server contains sqlite3: ${serverEntries.some(x => /(^|\/)sqlite3(\/|$)/.test(x))}`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
