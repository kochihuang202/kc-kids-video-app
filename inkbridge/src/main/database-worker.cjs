'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { WorkspaceDatabase } = require('./database.cjs');
const serializeError = error => ({ name: error.name, message: error.message, code: error.code || 'DATABASE_ERROR', details: error.details });
let database;
try {
  database = new WorkspaceDatabase(workerData.filename);
  parentPort.postMessage({ type: 'ready' });
} catch (error) {
  parentPort.postMessage({ type: 'fatal', error: serializeError(error) });
  parentPort.close();
}

if (database) parentPort.on('message', ({ id, method, payload }) => {
  try {
    let result;
    if (method === 'load') result = database.load();
    else if(method==='summary')result={workspaceId:database.workspaceId,revision:database.revision()};
    else if (method === 'commit') result = database.commit(payload);
    else if (method === 'history') result = database.history(payload);
    else if (method === 'snapshot') {
      // The single writer processes no commits between VACUUM INTO and ACK.
      // The caller supplies an unused LOCAL staging filename, never OneDrive.
      database.db.prepare('VACUUM INTO ?').run(payload);
      result = {workspaceId: database.workspaceId, revision: database.revision()};
    }
    else if (method === 'close') result = database.close();
    else throw Object.assign(new Error('Unknown database worker method'), { code: 'INVALID_REQUEST' });
    parentPort.postMessage({ id, result });
    if (method === 'close') parentPort.close();
  } catch (error) { parentPort.postMessage({ id, error: serializeError(error) }); }
});
