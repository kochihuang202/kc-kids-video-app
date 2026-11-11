const path = require('node:path');
const { Worker } = require('node:worker_threads');

// One worker owns one FIFO. Encoding and native decoding never occupy Electron's
// main thread, and a publication cannot launch an unbounded set of native jobs.
function createShareImages({ cacheDirectory }) {
  if (!cacheDirectory) throw new Error('Image derivative cacheDirectory is required');
  const worker = new Worker(path.join(__dirname, 'share-images-worker.cjs'), {
    workerData: { cacheDirectory: path.resolve(cacheDirectory) },
  });
  let sequence = 0, disposed = false;
  const pending = new Map();
  const fail = error => {
    for (const item of pending.values()) item.reject(error);
    pending.clear();
  };
  worker.on('message', message => {
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
    else item.resolve(message.result);
  });
  worker.on('error', error => { disposed = true; fail(error); });
  worker.on('exit', code => {
    disposed = true;
    fail(new Error(`Image publication worker exited (${code})`));
  });
  return {
    prepare(options) {
      if (disposed) return Promise.reject(new Error('Image publication worker is disposed'));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, options });
      });
    },
    async dispose() {
      disposed = true;
      fail(new Error('Image publication worker is disposed'));
      await worker.terminate();
    },
  };
}

module.exports = { createShareImages };
