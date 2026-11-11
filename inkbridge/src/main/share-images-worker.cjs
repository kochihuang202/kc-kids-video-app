const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parentPort, workerData } = require('node:worker_threads');
const sharp = require('sharp');
const bmp = require('bmp-js');

sharp.concurrency(2);
sharp.cache({ memory: 32, files: 0, items: 32 });
const encoderVersion = `share-webp-v1/sharp-${sharp.versions.sharp}/vips-${sharp.versions.vips}/webp-${sharp.versions.webp}/bmp-${require('bmp-js/package.json').version}`;
const cacheDirectory = workerData.cacheDirectory;
const TYPES = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };

async function digest(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function describe(filename, type, width = null, height = null) {
  return { path: filename, sha256: await digest(filename), size: (await fs.stat(filename)).size, type, width, height };
}

async function verifySource(sourcePath, record) {
  const sourceId = await digest(sourcePath), stat = await fs.stat(sourcePath);
  if ((record.sha256 && record.sha256 !== sourceId) || (record.id && record.id !== sourceId)
      || (record.size != null && record.size !== stat.size)) {
    throw new Error(`Attachment integrity failure: ${record.name || record.id || path.basename(sourcePath)}`);
  }
  return { sourceId, stat };
}

function dimensions(metadata) {
  const swap = metadata.orientation >= 5 && metadata.orientation <= 8;
  const width = metadata.width, height = metadata.pageHeight || metadata.height;
  return swap ? { width: height, height: width } : { width, height };
}

async function decodeBmp(sourcePath) {
  const bytes = await fs.readFile(sourcePath);
  if (bytes.length < 54 || bytes.readUInt32LE(14) !== 40 || bytes.readUInt32LE(30) !== 0
      || ![1, 4, 8, 24, 32].includes(bytes.readUInt16LE(28))) throw new Error('Unsupported BMP encoding');
  const width = bytes.readUInt32LE(18), height = Math.abs(bytes.readInt32LE(22));
  // Match sharp's documented default pixel safety limit before bmp-js allocates.
  if (!width || !height || width * height > 0x3fff * 0x3fff) throw new Error('BMP input pixel limit');
  const bits = bytes.readUInt16LE(28), palette = bits < 24 ? (bytes.readUInt32LE(46) || 2 ** bits) * 4 : 0;
  const offset = bytes.readUInt32LE(10), stride = Math.ceil(width * bits / 32) * 4;
  if (offset !== 54 + palette || offset + height * stride > bytes.length) throw new Error('Invalid BMP pixel layout');
  const decoded = bmp.decode(bytes), data = Buffer.alloc(decoded.data.length);
  // bmp-js returns ABGR. Non-alpha BMPs set A=0; their pixels are opaque.
  let hasAlpha = false;
  if (bits === 32) for (let i = 0; i < decoded.data.length; i += 4) if (decoded.data[i]) { hasAlpha = true; break; }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = decoded.data[i + 3]; data[i + 1] = decoded.data[i + 2]; data[i + 2] = decoded.data[i + 1];
    data[i + 3] = hasAlpha ? decoded.data[i] : 255;
  }
  return { data, raw: { width, height, channels: 4 }, metadata: { format: 'bmp', width, height } };
}

async function writeWebp(filename, input, metadata, options, preview) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    let pipeline = (input.raw ? sharp(input.data, { raw: input.raw }) : sharp(input, { animated: true })).autoOrient().toColourspace('srgb');
    if (preview) pipeline = pipeline.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true });
    const info = await pipeline.webp({
      ...options, effort: 4,
      ...(metadata.delay ? { delay: metadata.delay } : {}),
      ...(metadata.loop != null ? { loop: metadata.loop } : {}),
    }).toFile(temporary);
    await fs.rename(temporary, filename);
    return describe(filename, 'image/webp', info.width, info.pageHeight || info.height / (info.pages || 1));
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

async function loadCache(directory, sourcePath, sourceId) {
  try {
    const cached = JSON.parse(await fs.readFile(path.join(directory, 'result.json'), 'utf8'));
    if (cached.encoderVersion !== encoderVersion || cached.sourceId !== sourceId) return null;
    for (const item of [cached.full, cached.preview].filter(Boolean)) {
      if (item.original) { item.path = sourcePath; continue; }
      if (path.dirname(item.path) !== directory || (await fs.stat(item.path)).size !== item.size
          || await digest(item.path) !== item.sha256) return null;
    }
    cached.reused = true;
    return cached;
  } catch { return null; }
}

async function prepare({ sourcePath, fileRecord = {}, preset = 'clarity', forceLossless = false }) {
  if (!['clarity', 'compact'].includes(preset)) throw new Error('Unknown image publication preset');
  sourcePath = path.resolve(sourcePath);
  const relativeCache = path.relative(path.dirname(sourcePath), cacheDirectory);
  if (!relativeCache || (!relativeCache.startsWith('..' + path.sep) && relativeCache !== '..' && !path.isAbsolute(relativeCache))) {
    throw new Error('Image derivative cache must be outside the original CAS directory');
  }
  const { sourceId, stat } = await verifySource(sourcePath, fileRecord);
  const source = { path: sourcePath, sha256: sourceId, size: stat.size, type: fileRecord.mime || fileRecord.type || 'application/octet-stream', width: fileRecord.width || null, height: fileRecord.height || null, original: true };
  const bypass = reason => ({ full: source, preview: null, sourceId, reason, reused: false, encoderVersion });
  // Inspect only a tiny prefix: a PDF is passed through without a raster decode.
  const handle = await fs.open(sourcePath, 'r');
  let prefix;
  try { prefix = Buffer.alloc(8); await handle.read(prefix, 0, 8, 0); } finally { await handle.close(); }
  if (prefix.subarray(0, 5).toString() === '%PDF-') { source.type = 'application/pdf'; return bypass('pdf-bypass'); }
  let metadata, input = sourcePath;
  try {
    if (prefix.subarray(0, 2).toString() === 'BM') { source.type = 'image/bmp'; input = await decodeBmp(sourcePath); metadata = input.metadata; }
    else metadata = await sharp(sourcePath, { animated: true }).metadata();
  }
  catch { return bypass('unsupported-image'); }
  source.type = TYPES[metadata.format] || source.type;
  Object.assign(source, dimensions(metadata));
  if (!TYPES[metadata.format]) return bypass('unsupported-image');
  const profile = { preset, forceLossless: Boolean(forceLossless), encoderVersion, previewEdge: 512 };
  const key = crypto.createHash('sha256').update(sourceId + JSON.stringify(profile)).digest('hex');
  const directory = path.join(cacheDirectory, key);
  const cached = await loadCache(directory, sourcePath, sourceId);
  if (cached) return cached;
  await fs.mkdir(directory, { recursive: true });
  const options = { quality: preset === 'compact' ? 76 : 88,
    lossless: Boolean(forceLossless || (preset === 'clarity' && ['png', 'bmp'].includes(metadata.format))) };
  let full = source, reason = 'converted-webp';
  if (metadata.format === 'webp') reason = 'existing-webp';
  else if (source.width > 16383 || source.height > 16383) reason = 'webp-dimension-limit';
  else {
    try {
      const candidate = await writeWebp(path.join(directory, 'full.webp'), input, metadata, options, false);
      if (candidate.size >= source.size) { reason = 'source-smaller'; await fs.unlink(candidate.path); }
      else full = candidate;
    } catch { reason = 'webp-encode-unsupported'; }
  }
  let preview = null;
  try { preview = await writeWebp(path.join(directory, 'preview.webp'), input, metadata, options, true); }
  catch { if (reason === 'converted-webp') reason = 'preview-encode-unsupported'; }
  // A mutable or corrupt original must never become a valid publication cache.
  await verifySource(sourcePath, { ...fileRecord, sha256: sourceId, size: stat.size });
  const result = { full, preview, sourceId, reason, reused: false, encoderVersion };
  const temporary = path.join(directory, `result.${crypto.randomUUID()}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(result));
  await fs.rename(temporary, path.join(directory, 'result.json'));
  return result;
}

let queue = Promise.resolve();
parentPort.on('message', ({ id, options }) => {
  queue = queue.then(async () => {
    try { parentPort.postMessage({ id, result: await prepare(options) }); }
    catch (error) { parentPort.postMessage({ id, error: { message: error.message, code: error.code } }); }
  });
});
