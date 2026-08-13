const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadMasterKey(dataDir) {
  ensureDir(dataDir);
  const envKey = process.env.NEKODECK_MASTER_KEY;
  if (envKey) return crypto.createHash('sha256').update(envKey).digest();

  const keyPath = path.join(dataDir, 'master.key');
  if (!fs.existsSync(keyPath)) {
    const key = crypto.randomBytes(32).toString('base64url');
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
  }
  return crypto.createHash('sha256').update(fs.readFileSync(keyPath, 'utf8')).digest();
}

function encryptJson(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const raw = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    data: encrypted.toString('base64url')
  };
}

function decryptJson(payload, key) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64url')),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

function createStore(dataDir) {
  ensureDir(dataDir);
  const dbPath = path.join(dataDir, 'nekodeck.json');
  const key = loadMasterKey(dataDir);

  const initial = {
    version: 1,
    instances: [],
    settings: {
      accent: '#45f58c',
      density: 'comfortable',
      glass: true
    }
  };

  function read() {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
      return structuredClone(initial);
    }
    try {
      return { ...initial, ...JSON.parse(fs.readFileSync(dbPath, 'utf8')) };
    } catch {
      return structuredClone(initial);
    }
  }

  function write(db) {
    const tmp = `${dbPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dbPath);
  }

  function publicInstance(item) {
    const credentials = item.secrets ? decryptJson(item.secrets, key) : {};
    return {
      id: item.id,
      templateId: item.templateId,
      name: item.name,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      config: item.config || {},
      credentialStatus: {
        discordClientId: Boolean(credentials.discordClientId),
        discordClientSecret: Boolean(credentials.discordClientSecret),
        botToken: Boolean(credentials.botToken),
        providerApiKey: Boolean(credentials.providerApiKey)
      },
      discordClientId: credentials.discordClientId || null
    };
  }

  return {
    listInstances() {
      return read().instances.map(publicInstance);
    },
    getPublicInstance(id) {
      const item = read().instances.find((x) => x.id === id);
      return item ? publicInstance(item) : null;
    },
    getPrivateInstance(id) {
      const item = read().instances.find((x) => x.id === id);
      if (!item) return null;
      return {
        ...item,
        credentials: item.secrets ? decryptJson(item.secrets, key) : {}
      };
    },
    createInstance(input) {
      const db = read();
      const now = new Date().toISOString();
      const item = {
        id: crypto.randomUUID(),
        templateId: input.templateId,
        name: input.name,
        createdAt: now,
        updatedAt: now,
        config: input.config || {},
        state: {},
        secrets: encryptJson(input.credentials || {}, key)
      };
      db.instances.unshift(item);
      write(db);
      return publicInstance(item);
    },
    deleteInstance(id) {
      const db = read();
      const before = db.instances.length;
      db.instances = db.instances.filter((x) => x.id !== id);
      write(db);
      return db.instances.length !== before;
    },
    getState(id) {
      const item = read().instances.find((x) => x.id === id);
      return item ? (item.state || {}) : null;
    },
    updateState(id, patch) {
      const db = read();
      const item = db.instances.find((x) => x.id === id);
      if (!item) return null;
      item.state = { ...(item.state || {}), ...(patch || {}) };
      item.updatedAt = new Date().toISOString();
      write(db);
      return item.state;
    },
    getSettings() {
      return read().settings;
    },
    updateSettings(next) {
      const db = read();
      db.settings = { ...db.settings, ...next };
      write(db);
      return db.settings;
    },
    _crypto: { encryptJson, decryptJson, key }
  };
}

module.exports = { createStore, encryptJson, decryptJson };
