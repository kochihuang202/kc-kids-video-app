// Audit read-only PRIVATE database copies with the actual shipped Backup API.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { nativeApi, hashFile } = require('./snapshot-prototype.cjs');

async function main() {
  const [binding, sourcesJson, output] = process.argv.slice(2);
  if (!binding || !sourcesJson || !output) throw Error('Usage: node audit-native-backup.cjs BINDING PRIVATE-SOURCES.json NEW-OUTPUT');
  await fs.mkdir(output); // Must be a new directory; never overwrite an existing run.
  const api = nativeApi(binding);
  const sources = JSON.parse(await fs.readFile(sourcesJson, 'utf8'));
  const report = { engine: api.version, sourceKind: 'private independent per-database copies; not a cross-database capture', databases: [] };
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i], saved = path.join(output, `snapshot-${i}.sqlite3`), restored = path.join(output, `restored-${i}.sqlite3`);
    const sourceHash = await hashFile(source);
    await api.backupFile(source, saved);
    await api.backupFile(saved, restored);
    assert.equal(await hashFile(source), sourceHash, 'source copy changed');
    const savedHash = await hashFile(saved), restoredHash = await hashFile(restored);
    // Equal complete images prove preservation of BLOB history and index/shadow pages,
    // without requiring us to decode private rows or load vec0.
    assert.equal(restoredHash, savedHash, 'restored database image differs');
    const db = await api.open(restored);
    try {
      const integrity = await api.query(db, 'PRAGMA integrity_check');
      assert.ok(integrity.every(row => row.integrity_check === 'ok'), JSON.stringify(integrity));
      const schema = await api.query(db, 'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name');
      const original = await api.open(source, true);
      try { assert.deepEqual(schema, await api.query(original, 'SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name')); }
      finally { await api.close(original); }
      report.databases.push({ alias: i === 0 ? 'catalog' : `W${i-1}`, bytes: (await fs.stat(source)).size,
        schemaObjects: schema.length, fullRestoreImageMatches: true, integrity: 'ok', sourceUnchanged: true });
    } finally { await api.close(db); }
  }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
