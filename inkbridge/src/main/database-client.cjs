'use strict';

const { Worker } = require('node:worker_threads');
const path = require('node:path');
const restoreError = value => Object.assign(new Error(value.message), { name: value.name || 'PersistenceError', code: value.code, details: value.details });

class DatabaseClient {
  constructor({ filename, timeoutMs = 30000 }) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid database timeout');
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.nextId = 1;
    this.state = 'opening';
    this.worker = new Worker(path.join(__dirname, 'database-worker.cjs'), { workerData: { filename } });
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    // Opening errors must not become unhandled if shutdown is requested before load.
    this.ready.catch(() => {});
    this.exited = new Promise(resolve => { this.resolveExit = resolve; });
    this.startupTimer = setTimeout(() => {
      this.fail(Object.assign(new Error('Database worker did not initialize'), { code: 'PERSISTENCE_TIMEOUT', details: { outcomeUnknown: false } }));
      void this.worker.terminate();
    }, timeoutMs);
    this.startupTimer.unref();
    this.worker.on('message', message => {
      if (message.type === 'ready') {
        clearTimeout(this.startupTimer);
        if (this.state === 'opening') this.state = 'ready';
        this.resolveReady();
        return;
      }
      if (message.type === 'fatal') { this.fail(restoreError(message.error)); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(restoreError(message.error));
      else pending.resolve(message.result);
    });
    this.worker.on('error', error => this.fail(error));
    this.worker.on('exit', code => {
      const expected = this.state === 'closing' && this.pending.size === 0;
      if (!expected && this.state !== 'failed') this.fail(Object.assign(new Error(`Database worker exited (${code})`), { code: 'DATABASE_WORKER_EXIT' }));
      if (expected) this.state = 'closed';
      this.resolveExit(code);
    });
  }

  fail(error) {
    if (this.state === 'failed' || this.state === 'closed') return;
    this.failure = error;
    clearTimeout(this.startupTimer);
    this.state = 'failed';
    this.rejectReady(error);
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }

  send(method, payload) {
    if (this.state === 'failed' || this.state === 'closed') return Promise.reject(this.failure || Object.assign(new Error('Database client is closed'), { code: 'DATABASE_CLOSED' }));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = Object.assign(new Error('Database worker did not acknowledge the operation'), { code: 'PERSISTENCE_TIMEOUT', details: { outcomeUnknown: method === 'commit' } });
        this.fail(error);
        void this.worker.terminate();
      }, this.timeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      try { this.worker.postMessage({ id, method, payload }); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }

  request(method, payload) {
    if (this.state === 'closing' || this.state === 'closed') return Promise.reject(Object.assign(new Error('Database client is closed'), { code: 'DATABASE_CLOSED' }));
    if (this.state === 'failed') return Promise.reject(this.failure);
    // Promise registration order preserves requests accepted before close().
    return this.ready.then(() => this.send(method, payload));
  }

  load() { return this.request('load'); }
  commit(request) { return this.request('commit', request); }
  history(request) { return this.request('history', request); }

  close() {
    if (this.closePromise) return this.closePromise;
    if (this.state === 'closed') return Promise.resolve();
    const failed = this.state === 'failed';
    if (!failed) this.state = 'closing';
    this.closePromise = (async () => {
      if (failed) { await this.worker.terminate(); return; }
      try {
        await this.ready;
        await this.send('close');
        let timer;
        try {
          await Promise.race([this.exited, new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error('Database worker did not exit after closing SQLite'), { code: 'DATABASE_CLOSE_TIMEOUT' })), this.timeoutMs);
            timer.unref();
          })]);
        } finally { clearTimeout(timer); }
      } catch (error) {
        await this.worker.terminate();
        throw error;
      }
    })();
    return this.closePromise;
  }
}

function createDatabaseClient(options) { return new DatabaseClient(options); }
module.exports = { DatabaseClient, createDatabaseClient };
