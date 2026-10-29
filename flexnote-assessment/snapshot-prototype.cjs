// ISOLATED feasibility prototype. No FlexNote patch, scheduler, UI or production installer.
// The caller supplies the installed, privately extracted node-sqlite3 binding.
const fs = require('node:fs/promises');
const fss = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { inherits } = require('node:util');
const { EventEmitter } = require('node:events');

function nativeApi(bindingPath) {
  const b = require(bindingPath);
  for (const Type of [b.Database, b.Statement, b.Backup]) inherits(Type, EventEmitter);
  const open = (file, readOnly = false) => new Promise((resolve, reject) => {
    const db = new b.Database(file, readOnly ? b.OPEN_READONLY : b.OPEN_READWRITE | b.OPEN_CREATE,
      error => error ? reject(error) : resolve(db));
  });
  const close = db => new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve()));
  const exec = (db, sql) => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
  const query = (db, sql, params = []) => new Promise((resolve, reject) => {
    const stmt = new b.Statement(db, sql, error => {
      if (error) return reject(error);
      stmt.all(params, (error, rows) => stmt.finalize(endError =>
        error || endError ? reject(error || endError) : resolve(rows)));
    });
  });
  async function backupFile(source, target) {
    // Never overwrite an existing target. The source is opened read-only.
    try { await fs.access(target); throw Error('Backup target already exists'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    const db = await open(source, true);
    try {
      const mode = (await query(db, 'PRAGMA journal_mode'))[0].journal_mode;
      // Fail closed for the vulnerable shipped engine. No source checkpoint or mode change.
      if (mode === 'wal') throw Error('WAL online backup disabled in this prototype; require patched engine and coordination');
      await new Promise((resolve, reject) => {
        const backup = new b.Backup(db, target, 'main', 'main', true, error => {
          if (error) return reject(error);
          backup.retryErrors = [b.BUSY, b.LOCKED];
          backup.step(-1, stepError => backup.finish(finishError =>
            stepError || finishError ? reject(stepError || finishError) : resolve()));
        });
      });
    } finally { await close(db); }
  }
  return { open, close, exec, query, backupFile, version: b.VERSION };
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fss.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function within(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes(':')) throw Error('Invalid relative path');
  const normalized = relative.replaceAll('\\', '/');
  if (normalized.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe relative path');
  const target = path.resolve(root, normalized);
  const rel = path.relative(path.resolve(root), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Path escapes root');
  return target;
}
async function durableWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  const handle = await fs.open(temp, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temp, file);
}
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fingerprint = m => digest({ database: m.database.sha256, assets: m.assets });
function failAt(actual, wanted) { if (actual === wanted) throw Error('Injected interruption: ' + actual); }
async function schemaIdentity(api, db) {
  const schema = await api.query(db, 'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name');
  const migrationTable = schema.some(row => row.type === 'table' && row.name === 'knex_migrations');
  const migrations = migrationTable ? await api.query(db, 'SELECT name FROM knex_migrations ORDER BY id') : [];
  return { fingerprint: digest(schema), migrations: migrations.map(row => row.name) };
}

class SnapshotPrototype {
  constructor(options) {
    Object.assign(this, options);
    for (const key of ['workspaceId', 'deviceId']) {
      if (!/^[A-Za-z0-9_-]+$/.test(this[key] || '')) throw Error('Invalid ' + key);
    }
    for (const key of ['localRoot', 'exchangeRoot']) this[key] = path.resolve(this[key]);
    if (this.localRoot === this.exchangeRoot || this.localRoot.startsWith(this.exchangeRoot + path.sep) || this.exchangeRoot.startsWith(this.localRoot + path.sep)) throw Error('Local and exchange roots must be separate');
    this.api = nativeApi(this.bindingPath);
    this.appVersion = this.appVersion || '1.1.65';
    this.working = path.join(this.localRoot, 'working');
    this.dbName = `db_${this.workspaceId}.sqlite3`;
    this.queue = Promise.resolve();
    this.flush = this.flush || (async () => {});
    this.withBarrier = this.withBarrier || (async fn => fn());
    this.closeWorking = this.closeWorking || (async () => {});
    this.reopenWorking = this.reopenWorking || (async () => {});
    this.isLocallyAvailable = this.isLocallyAvailable || (async () => true);
  }
  exclusive(fn) {
    const operation = this.queue.then(fn);
    this.queue = operation.catch(() => {});
    return operation;
  }
  async init() {
    // A marker is mandatory: the prototype must never accidentally target production data.
    const marker = JSON.parse(await fs.readFile(path.join(this.working, 'isolated-prototype.json'), 'utf8'));
    if (marker.isolated !== true || marker.workspaceId !== this.workspaceId) throw Error('Not an isolated test workspace');
    await fs.mkdir(path.join(this.exchangeRoot, 'snapshots', this.workspaceId), { recursive: true });
    await fs.mkdir(path.join(this.exchangeRoot, 'assets'), { recursive: true });
    try { this.state = JSON.parse(await fs.readFile(path.join(this.localRoot, 'state.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.state = { snapshotId: null, fingerprint: null }; }
    return this;
  }
  async saveState(state) {
    await durableWrite(path.join(this.localRoot, 'state.json'), JSON.stringify(state, null, 2));
    this.state = state;
  }
  async capture(reason = 'manual', fault) {
    return this.exclusive(() => this.withBarrier(async () => {
      await this.flush();
      return this.captureLocked(reason, fault);
    }));
  }
  async captureLocked(reason, fault) {
    const id = crypto.randomUUID();
    const staging = path.join(this.localRoot, 'staging', id);
    await fs.mkdir(staging, { recursive: true });
    const candidate = path.join(staging, 'database.sqlite3');
    await this.api.backupFile(path.join(this.working, this.dbName), candidate);
    // SQLite 3.44 FTS5 integrity validation requires a writable temporary copy.
    // Only the isolated candidate is opened RW; the working source stays read-only.
    const db = await this.api.open(candidate);
    let records, schema;
    try {
      const integrity = await this.api.query(db, 'PRAGMA integrity_check');
      if (integrity.some(r => r.integrity_check !== 'ok')) throw Error('Database integrity failed');
      records = await this.api.query(db, 'SELECT id,filePath,useLink FROM files ORDER BY id');
      schema = await schemaIdentity(this.api, db);
    } finally { await this.api.close(db); }
    const assets = [];
    for (const row of records) {
      if (row.useLink) throw Error('External links require explicit collection; incomplete snapshot refused');
      const source = within(this.working, row.filePath);
      const real = await fs.realpath(source);
      const rel = path.relative(this.working, real);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw Error('Asset symlink escapes workspace');
      const hash = await hashFile(real), size = (await fs.stat(real)).size;
      let extension = path.extname(row.filePath).toLowerCase();
      if (!/^\.[a-z0-9]+$/.test(extension)) extension = '.bin';
      const objectPath = `assets/${hash.slice(0, 2)}/${hash}${extension}`;
      const object = within(this.exchangeRoot, objectPath);
      await fs.mkdir(path.dirname(object), { recursive: true });
      try {
        await fs.copyFile(real, object, fss.constants.COPYFILE_EXCL);
        const handle = await fs.open(object, 'r+');
        try { await handle.sync(); } finally { await handle.close(); }
      } catch (e) { if (e.code !== 'EEXIST') throw e; }
      // An existing content-addressed object is NEVER overwritten, even if corrupt.
      if ((await fs.stat(object)).size !== size || await hashFile(object) !== hash) throw Error('Asset hash mismatch');
      assets.push({ fileId: row.id, logicalPath: row.filePath.replaceAll('\\', '/'), objectPath, sha256: hash, bytes: size });
    }
    const manifest = { formatVersion: 1, workspaceId: this.workspaceId, snapshotId: id,
      sourceComputerId: this.deviceId, createdAt: new Date().toISOString(), parentVersionId: this.state.snapshotId,
      reason, appVersion: this.appVersion, sqliteVersion: this.api.version, schema,
      database: { path: 'database.sqlite3', sha256: await hashFile(candidate), bytes: (await fs.stat(candidate)).size }, assets };
    manifest.fingerprint = fingerprint(manifest);
    if (manifest.fingerprint === this.state.fingerprint) return { created: false, snapshotId: this.state.snapshotId };
    failAt('after-assets', fault);
    const destination = path.join(this.exchangeRoot, 'snapshots', this.workspaceId, id);
    await fs.mkdir(destination); // Unique generation; never overwrite another generation.
    await fs.copyFile(candidate, path.join(destination, 'database.sqlite3'), fss.constants.COPYFILE_EXCL);
    failAt('after-database', fault);
    await durableWrite(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2));
    failAt('after-manifest', fault);
    await this.saveState({ snapshotId: id, fingerprint: manifest.fingerprint });
    return { created: true, snapshotId: id, manifest };
  }
  async validate(directory) {
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
    if (manifest.formatVersion !== 1 || manifest.workspaceId !== this.workspaceId || path.basename(directory) !== manifest.snapshotId || manifest.database.path !== 'database.sqlite3' || !Array.isArray(manifest.assets)) throw Error('Invalid manifest');
    if (!/^[a-f0-9-]{36}$/.test(manifest.snapshotId) || (manifest.parentVersionId !== null && !/^[a-f0-9-]{36}$/.test(manifest.parentVersionId)) || manifest.parentVersionId === manifest.snapshotId || !manifest.sourceComputerId || !Number.isFinite(Date.parse(manifest.createdAt))) throw Error('Invalid snapshot identity');
    if (manifest.appVersion !== this.appVersion) throw Error('Unsupported application version');
    if (manifest.sqliteVersion !== this.api.version) throw Error('Unsupported database engine version');
    if (fingerprint(manifest) !== manifest.fingerprint) throw Error('Manifest fingerprint mismatch');
    for (const entry of [{ objectPath: path.relative(this.exchangeRoot, path.join(directory, 'database.sqlite3')), ...manifest.database }, ...manifest.assets]) {
      const file = within(this.exchangeRoot, entry.objectPath);
      if (!await this.isLocallyAvailable(file)) throw Object.assign(Error('Not locally downloaded'), { code: 'PENDING' });
      const stat = await fs.stat(file);
      if (stat.size !== entry.bytes || await hashFile(file) !== entry.sha256) throw Error('Integrity mismatch');
    }
    const logical = new Set();
    for (const asset of manifest.assets) {
      within(this.working, asset.logicalPath);
      if (!/^assets\/[a-f0-9]{2}\/[a-f0-9]{64}\.[a-z0-9]+$/.test(asset.objectPath) || !asset.objectPath.includes(asset.sha256) || logical.has(asset.logicalPath)) throw Error('Invalid asset binding');
      logical.add(asset.logicalPath);
    }
    const db = await this.api.open(path.join(directory, 'database.sqlite3'), true);
    try {
      if ((await schemaIdentity(this.api, db)).fingerprint !== manifest.schema?.fingerprint) throw Error('Schema fingerprint mismatch');
      const references = await this.api.query(db, 'SELECT id,filePath,useLink FROM files ORDER BY id');
      const expected = references.map(row => ({ fileId: row.id, logicalPath: row.filePath.replaceAll('\\', '/') }));
      const actual = manifest.assets.map(row => ({ fileId: row.fileId, logicalPath: row.logicalPath }));
      if (references.some(row => row.useLink) || JSON.stringify(expected) !== JSON.stringify(actual)) throw Error('Asset manifest does not cover database references');
    }
    finally { await this.api.close(db); }
    return manifest;
  }
  async scan() {
    const base = path.join(this.exchangeRoot, 'snapshots', this.workspaceId);
    const results = [];
    for (const entry of await fs.readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const item = { snapshotId: entry.name };
      try { item.manifest = await this.validate(path.join(base, entry.name)); item.integrity = 'complete'; }
      catch (error) { item.integrity = error.code === 'ENOENT' || error.code === 'PENDING' ? 'incomplete' : 'invalid'; item.error = error.message; }
      results.push(item);
    }
    const graph = new Map(results.filter(r => r.manifest).map(r => [r.snapshotId, r.manifest]));
    const ancestors = id => {
      const seen = new Set();
      while (id && !seen.has(id)) { seen.add(id); const m = graph.get(id); if (!m) return { seen, complete: false }; id = m.parentVersionId; }
      return { seen, complete: !id };
    };
    for (const item of results) {
      if (item.integrity !== 'complete') { item.relation = item.integrity; continue; }
      if (item.snapshotId === this.state.snapshotId) item.relation = 'current';
      else {
        const a = ancestors(item.snapshotId), b = ancestors(this.state.snapshotId);
        if (a.seen.has(this.state.snapshotId)) item.relation = 'newer-in-chain';
        else if (b.seen.has(item.snapshotId)) item.relation = 'older-in-chain';
        else item.relation = a.complete && b.complete ? 'branch' : 'unknown-lineage';
      }
    }
    return results;
  }
  async load(snapshotId, fault) {
    if (!/^[a-f0-9-]{36}$/.test(snapshotId)) throw Error('Invalid snapshot ID');
    return this.exclusive(() => this.withBarrier(async () => {
      await this.flush();
      await this.captureLocked('before-load'); // Preserve every dirty edit before switching branches.
      const previous = { ...this.state };
      const snapshot = path.join(this.exchangeRoot, 'snapshots', this.workspaceId, snapshotId);
      const manifest = await this.validate(snapshot);
      const currentDb = await this.api.open(path.join(this.working, this.dbName), true);
      try { if ((await schemaIdentity(this.api, currentDb)).fingerprint !== manifest.schema.fingerprint) throw Error('Schema migration requires separate validation'); }
      finally { await this.api.close(currentDb); }
      const staging = path.join(this.localRoot, 'restore-' + crypto.randomUUID());
      await fs.mkdir(staging);
      await this.api.backupFile(path.join(snapshot, 'database.sqlite3'), path.join(staging, this.dbName));
      for (const asset of manifest.assets) {
        const target = within(staging, asset.logicalPath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(within(this.exchangeRoot, asset.objectPath), target, fss.constants.COPYFILE_EXCL);
        if (await hashFile(target) !== asset.sha256) throw Error('Restore asset mismatch');
      }
      await durableWrite(path.join(staging, 'isolated-prototype.json'), JSON.stringify({ isolated: true, workspaceId: this.workspaceId }));
      const db = await this.api.open(path.join(staging, this.dbName));
      try { if ((await this.api.query(db, 'PRAGMA integrity_check')).some(r => r.integrity_check !== 'ok')) throw Error('Restored database integrity failed'); }
      finally { await this.api.close(db); }
      await this.closeWorking();
      const rollback = path.join(this.localRoot, 'rollback-' + crypto.randomUUID());
      let movedOld = false, movedNew = false;
      try {
        await durableWrite(path.join(this.localRoot, 'load-intent.json'), JSON.stringify({ previous, selected: snapshotId, staging, rollback }));
        await fs.rename(this.working, rollback); movedOld = true;
        failAt('after-old-moved', fault);
        await fs.rename(staging, this.working); movedNew = true;
        failAt('after-swap', fault);
        await this.reopenWorking();
        await this.saveState({ snapshotId, fingerprint: manifest.fingerprint });
        await durableWrite(path.join(this.localRoot, 'load-intent.json'), JSON.stringify({ completed: true, selected: snapshotId }));
        return manifest;
      } catch (error) {
        if (movedNew) await fs.rename(this.working, path.join(this.localRoot, 'failed-' + crypto.randomUUID()));
        if (movedOld) await fs.rename(rollback, this.working);
        await this.saveState(previous);
        await this.reopenWorking();
        throw error;
      }
    }));
  }
}

module.exports = { nativeApi, hashFile, SnapshotPrototype };
