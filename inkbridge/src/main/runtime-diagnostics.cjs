const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {isMainThread, Worker, workerData} = require('node:worker_threads');

const logName = /^runtime-\d{13}-[a-f0-9-]{36}\.jsonl$/;
const maxBytes = 256 * 1024;
const maxRuns = 30;
const reasons = new Set(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction']);
const timestamp = time => new Date(time).toISOString();

function append(file, event, fields, force = false) {
  try {
    if (!force && fs.statSync(file).size >= maxBytes) return;
    fs.appendFileSync(file, JSON.stringify({at: timestamp(Date.now()), event, ...fields}) + '\n', {flag: 'a', flush: true});
  } catch (error) { /* Diagnostic I/O must not interrupt work. */ }
}

function errorDetails(error) {
  const name = String(error?.name || 'Error');
  const code = String(error?.code || '');
  const frames = String(error?.stack || '').split('\n').slice(1, 13)
    .flatMap(line => line.match(/(?:^|[/\\ (])([\w.-]+\.(?:[cm]?js|tsx?)(?::\d+){1,2})\)?\s*$/)?.[1] || []);
  return {name: /^(?:Type|Range|Reference|Syntax|Eval|URI|Aggregate)?Error$/.test(name) ? name : 'Error',
    ...(/^[A-Z][A-Z0-9_]{1,50}$/.test(code) && {code}), frames};
}

function watch({file, pulseFile, shared, tickMs, hangMs, heartbeatMs}) {
  const pulse = new BigInt64Array(shared);
  let observed = Date.now(), persisted = 0, hangStart = 0, reported = false;
  setInterval(() => {
    const now = Date.now(), mainPulse = Number(Atomics.load(pulse, 0));
    const workerGap = now - observed;
    observed = now;
    if (mainPulse !== persisted && mainPulse - persisted >= heartbeatMs) {
      try { fs.writeFileSync(pulseFile, String(mainPulse)); persisted = mainPulse; } catch (error) { /* retry */ }
    }
    if (workerGap < 0 || workerGap > hangMs / 2 || Atomics.load(pulse, 1)) {
      hangStart = Math.max(mainPulse, now);
      return;
    }
    if (now - mainPulse >= hangMs) {
      if (!reported && now - Math.max(mainPulse, hangStart) >= hangMs) {
        append(file, 'main-unresponsive', {lastHeartbeatAt: timestamp(mainPulse), elapsedMs: now - mainPulse});
        reported = true;
      }
    } else if (reported) {
      append(file, 'main-responsive', {});
      reported = false;
    }
  }, tickMs);
}

function startRuntimeDiagnostics({directory, version, tickMs = 1000, hangMs = 15000, heartbeatMs = 10000}) {
  const start = Date.now();
  const file = path.join(directory, `runtime-${start}-${randomUUID()}.jsonl`);
  const pulseFile = `${file}.heartbeat`;
  const record = (event, fields) => append(file, event, fields);
  const unavailable = {directory, capture: () => {}, finish: () => {}, suspended: () => {}};
  try {
    fs.mkdirSync(directory, {recursive: true});
    const older = fs.readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isFile() && logName.test(entry.name)).map(entry => entry.name).sort().reverse();
    fs.writeFileSync(file, '', {flag: 'wx'});
    record('session-start', {version, electron: process.versions.electron, pid: process.pid});
    if (older.length) {
      const previous = path.join(directory, older[0]);
      const previousLog = fs.readFileSync(previous, 'utf8');
      if (!/^\{"at":"[^"\r\n]+","event":"session-end","exitCode":0\}\r?$/m.test(previousLog)) {
        let lastContact = Number(older[0].slice(8, 21));
        try {
          const persisted = Number(fs.readFileSync(`${previous}.heartbeat`, 'utf8'));
          if (persisted >= lastContact && persisted <= start) lastContact = persisted;
        } catch (error) { /* No heartbeat before exit. */ }
        record('previous-session-interrupted', {previous: older[0], lastHeartbeatAt: timestamp(lastContact)});
      }
    }
    for (const old of older.slice(maxRuns - 1)) {
      const entry = path.join(directory, old);
      try {
        fs.rmSync(`${entry}.heartbeat`, {force: true});
        fs.rmSync(entry, {force: true});
      } catch (error) { /* An old log may currently be open in another app. */ }
    }
  } catch (error) { return unavailable; }

  const shared = new SharedArrayBuffer(16);
  const pulse = new BigInt64Array(shared);
  const beat = () => Atomics.store(pulse, 0, BigInt(Date.now()));
  beat();
  const timer = setInterval(beat, tickMs).unref();
  let worker;
  try {
    worker = new Worker(__filename, {workerData: {kind: 'inkbridge-watchdog', file, pulseFile, shared, tickMs, hangMs, heartbeatMs}});
    worker.on('error', error => record('watchdog-error', errorDetails(error)));
    worker.unref();
  } catch (error) { record('watchdog-error', errorDetails(error)); }
  const capture = (event, error, context = {}) => record(event, {...context, ...errorDetails(error)});
  let ended = false;
  function finish(exitCode) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    Atomics.store(pulse, 1, 1n);
    void worker?.terminate();
    append(file, exitCode === 0 ? 'session-end' : 'session-error-exit', {exitCode}, true);
  }
  return {directory, record, capture, finish, suspended(value) {
    if (!value) beat();
    Atomics.store(pulse, 1, value ? 1n : 0n);
  }};
}

function installRuntimeDiagnostics({app, powerMonitor, directory, version}) {
  const logger = startRuntimeDiagnostics({directory, version});
  if (!logger.record) return logger;
  process.on('uncaughtExceptionMonitor', error => logger.capture('main-exception', error));
  app.on('quit', (_event, exitCode) => logger.finish(exitCode));
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    logger.record('child-process-gone', {
      processType: /^[A-Za-z ]{1,30}$/.test(details.type || '') ? details.type : 'unknown',
      reason: reasons.has(details.reason) ? details.reason : 'unknown', exitCode: details.exitCode
    });
  });
  app.on('web-contents-created', (_event, contents) => {
    const windowId = contents.id;
    let hung = false;
    contents.on('unresponsive', () => {
      if (!hung) logger.record('renderer-unresponsive', {windowId});
      hung = true;
    });
    contents.on('responsive', () => {
      if (hung) logger.record('renderer-responsive', {windowId});
      hung = false;
    });
    contents.on('render-process-gone', (_event, details) => {
      if (details.reason !== 'clean-exit') logger.record('renderer-gone', {windowId,
        reason: reasons.has(details.reason) ? details.reason : 'unknown', exitCode: details.exitCode});
      hung = false;
    });
  });
  app.whenReady().then(() => {
    powerMonitor.on('suspend', () => logger.suspended(true));
    powerMonitor.on('resume', () => logger.suspended(false));
  }).catch(error => logger.capture('diagnostics-startup-error', error));
  return logger;
}

if (!isMainThread && workerData?.kind === 'inkbridge-watchdog') watch(workerData);
module.exports = {startRuntimeDiagnostics, installRuntimeDiagnostics};
