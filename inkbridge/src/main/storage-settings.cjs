const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

function createStorageSettings({filename, localDirectory, applicationDirectory}) {
  const overlaps = (a, b) => {
    const inside = (x, y) => { const r = path.relative(x, y); return !r || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); };
    return inside(a, b) || inside(b, a);
  };
  const read = () => {
    if (!fs.existsSync(filename)) return {version: 1, exchangeDirectory: '', localDirectory};
    const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (value.version !== 1 || typeof value.exchangeDirectory !== 'string') throw Error('本機儲存設定格式無效；請保留設定檔並聯絡開發者');
    return {...value, localDirectory};
  };
  const check = directory => {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw Error('請選擇絕對路徑資料夾');
    const resolved = fs.realpathSync(directory);
    if (!fs.statSync(resolved).isDirectory() || path.parse(resolved).root === resolved) throw Error('請選擇專用的交換資料夾');
    for (const protectedPath of [localDirectory, applicationDirectory])
      if (overlaps(resolved, fs.realpathSync(protectedPath))) throw Error('交換資料夾不可與程式或本機工作資料目錄重疊');
    fs.readdirSync(resolved);
    const probe = path.join(resolved, `.inkbridge-check-${randomUUID()}.tmp`);
    let fd;
    try {
      fd = fs.openSync(probe, 'wx'); fs.writeFileSync(fd, 'InkBridge'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      if (fs.readFileSync(probe, 'utf8') !== 'InkBridge') throw Error('資料夾讀寫驗證失敗');
    } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(probe)) fs.unlinkSync(probe); }
    const directories = ['snapshots', 'assets'].filter(name => fs.existsSync(path.join(resolved, name)) && fs.statSync(path.join(resolved, name)).isDirectory());
    return {directory: resolved, readable: true, writable: true, directories};
  };
  const save = directory => {
    const checked = check(directory), value = {version: 1, exchangeDirectory: checked.directory, updatedAt: new Date().toISOString()};
    const temp = `${filename}.${randomUUID()}.tmp`;
    let fd;
    try { fd = fs.openSync(temp, 'wx'); fs.writeFileSync(fd, JSON.stringify(value, null, 2)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined; fs.renameSync(temp, filename); }
    finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    return read();
  };
  return {read, check, save};
}
module.exports = {createStorageSettings};
