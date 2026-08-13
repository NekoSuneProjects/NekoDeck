const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function assertWritableDir(dir) {
  ensureDir(dir);
  const probe = path.join(dir, `.nekodeck-write-test-${process.pid}-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(probe, 'ok', { mode: 0o600 });
    fs.unlinkSync(probe);
  } catch (error) {
    const wrapped = new Error(
      `NekoDeck data directory is not writable: ${dir}. ` +
      `Ensure the mounted volume is writable by the container node user (UID/GID 1000:1000). ` +
      `Original error: ${error.message}`
    );
    wrapped.code = error.code || 'NEKODECK_DATA_NOT_WRITABLE';
    wrapped.cause = error;
    throw wrapped;
  }
}

function loadMasterKey(dataDir) {
  ensureDir(dataDir);
  const envKey = process.env.NEKODECK_MASTER_KEY;
  if (envKey) return crypto.createHash('sha256').update(envKey).digest();
  const keyPath = path.join(dataDir, 'master.key');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('base64url'), { mode: 0o600 });
  return crypto.createHash('sha256').update(fs.readFileSync(keyPath, 'utf8')).digest();
}
function encryptJson(value, key) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), 'utf8')), cipher.final()]);
  return { v:1, iv:iv.toString('base64url'), tag:cipher.getAuthTag().toString('base64url'), data:encrypted.toString('base64url') };
}
function decryptJson(payload, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64url')), decipher.final()]).toString('utf8'));
}
function createStore(dataDir) {
  assertWritableDir(dataDir);
  const dbPath = path.join(dataDir, 'nekodeck.json'); const key = loadMasterKey(dataDir);
  const initial = { version:1, instances:[], settings:{ accent:'#45f58c', density:'comfortable', glass:true } };
  function read(){ if(!fs.existsSync(dbPath)){fs.writeFileSync(dbPath,JSON.stringify(initial,null,2),{mode:0o600});return structuredClone(initial)} try{return {...initial,...JSON.parse(fs.readFileSync(dbPath,'utf8'))}}catch{return structuredClone(initial)} }
  function write(db){const tmp=`${dbPath}.tmp`;fs.writeFileSync(tmp,JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(tmp,dbPath)}
  function credentialsFor(item){
    if(!item.secrets)return {};
    try{return decryptJson(item.secrets,key)}catch(error){
      const wrapped=new Error('Unable to decrypt stored NekoDeck credentials. Restore the original NEKODECK_MASTER_KEY (or /data/master.key) used when these widgets were created.');
      wrapped.code='NEKODECK_DECRYPT_FAILED';
      wrapped.cause=error;
      throw wrapped;
    }
  }
  function publicInstance(item){const c=credentialsFor(item);return {id:item.id,templateId:item.templateId,name:item.name,createdAt:item.createdAt,updatedAt:item.updatedAt,config:item.config||{},credentialStatus:{discordClientId:Boolean(c.discordClientId),discordClientSecret:Boolean(c.discordClientSecret),botToken:Boolean(c.botToken),providerApiKey:Boolean(c.providerApiKey),providerClientId:Boolean(c.providerClientId),providerClientSecret:Boolean(c.providerClientSecret),providerSession:Boolean(c.providerSession),providerConnected:Boolean(c.refreshToken||c.accessToken)},discordClientId:c.discordClientId||null}}
  return {
    listInstances(){return read().instances.map(publicInstance)},
    getPublicInstance(id){const i=read().instances.find(x=>x.id===id);return i?publicInstance(i):null},
    getPrivateInstance(id){const i=read().instances.find(x=>x.id===id);return i?{...i,credentials:credentialsFor(i)}:null},
    createInstance(input){const db=read(),now=new Date().toISOString(),i={id:crypto.randomUUID(),templateId:input.templateId,name:input.name,createdAt:now,updatedAt:now,config:input.config||{},state:{},secrets:encryptJson(input.credentials||{},key)};db.instances.unshift(i);write(db);return publicInstance(i)},
    deleteInstance(id){const db=read(),before=db.instances.length;db.instances=db.instances.filter(x=>x.id!==id);write(db);return db.instances.length!==before},
    mergeCredentials(id,patch){const db=read(),i=db.instances.find(x=>x.id===id);if(!i)return null;const current=credentialsFor(i);i.secrets=encryptJson({...current,...(patch||{})},key);i.updatedAt=new Date().toISOString();write(db);return publicInstance(i)},
    updateConfig(id,patch){const db=read(),i=db.instances.find(x=>x.id===id);if(!i)return null;i.config={...(i.config||{}),...(patch||{})};i.updatedAt=new Date().toISOString();write(db);return publicInstance(i)},
    getState(id){const i=read().instances.find(x=>x.id===id);return i?(i.state||{}):null},
    updateState(id,patch){const db=read(),i=db.instances.find(x=>x.id===id);if(!i)return null;i.state={...(i.state||{}),...(patch||{})};i.updatedAt=new Date().toISOString();write(db);return i.state},
    getSettings(){return read().settings},
    updateSettings(next){const db=read();db.settings={...db.settings,...next};write(db);return db.settings},
    _crypto:{encryptJson,decryptJson,key}
  };
}
module.exports = { createStore, encryptJson, decryptJson };
