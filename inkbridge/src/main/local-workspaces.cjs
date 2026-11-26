const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {UUID, writeJSON} = require('./sync-files.cjs');

const INITIAL = {version: 1, activeId: 'default', workspaces: [{id: 'default', name: '主要工作空間'}]};
const validId = id => typeof id === 'string' && (id === 'default' || UUID.test(id));
const validName = name => typeof name === 'string' && name.trim() && name.length <= 80 && !/[\x00-\x1f\x7f]/.test(name);

function createLocalWorkspaces(base) {
  const filename = path.join(base, 'Profile', 'local-workspaces.json');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = INITIAL;
  }
  const rows = state?.workspaces;
  if (state?.version !== 1 || !Array.isArray(rows) || rows.some(row => !validId(row?.id) || !validName(row?.name)) ||
      new Set(rows.map(row => row.id)).size !== rows.length || !rows.some(row => row.id === 'default') || !rows.some(row => row.id === state.activeId)) {
    throw Error('工作空間清單格式無效，請保留原檔');
  }

  function directory(id = state.activeId) {
    if (!validId(id)) throw Error('工作空間識別碼無效');
    if (id === 'default') return base;
    const parent = path.join(base, 'Spaces');
    const destination = path.join(parent, id);
    for (const entry of [parent, destination]) {
      const stat = fs.lstatSync(entry, {throwIfNoEntry: false});
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw Error('工作空間資料目錄無效');
    }
    return destination;
  }

  function change({method, id, name, direction}) {
    const index = state.workspaces.findIndex(row => row.id === id);
    if (method !== 'create' && index < 0) throw Error('找不到工作空間');
    const workspaces = state.workspaces.slice();
    let activeId = state.activeId;
    if (method === 'rename' || method === 'create') {
      if (!validName(name)) throw Error('請輸入 1 至 80 字的工作空間名稱');
      if (method === 'create') {
        activeId = randomUUID();
        workspaces.push({id: activeId, name: name.trim()});
      } else {
        workspaces[index] = {id, name: name.trim()};
      }
    } else if (method === 'select') {
      activeId = id;
    } else if (method === 'move' && (direction === -1 || direction === 1)) {
      const to = index + direction;
      if (to >= 0 && to < workspaces.length) [workspaces[index], workspaces[to]] = [workspaces[to], workspaces[index]];
    } else {
      throw Error('未知的工作空間操作');
    }
    return {...state, activeId, workspaces};
  }

  async function save(next) {
    await writeJSON(filename, next);
    state = next;
    return state;
  }
  return {directory, change, save, read: () => state};
}

module.exports = {createLocalWorkspaces};
