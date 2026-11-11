const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const sharp = require('sharp');
const bmp = require('bmp-js');
const { createShareImages } = require('../src/main/share-images.cjs');

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'inkbridge-share-images-'));
  const originals = path.join(directory, 'files');
  await fs.mkdir(originals);
  const images = createShareImages({ cacheDirectory: path.join(directory, 'derivatives') });
  t.after(async () => { await images.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  return {
    images, directory,
    async save(bytes, extension) {
      const id = hash(bytes), sourcePath = path.join(originals, `${id}.${extension}`);
      await fs.writeFile(sourcePath, bytes);
      return { sourcePath, fileRecord: { id, sha256: id, size: bytes.length, name: `Synthetic.${extension}` } };
    },
  };
}

function photo(width = 900, height = 600) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3, noise = ((x * 71 + y * 29) % 17) - 8;
    data[i] = Math.max(0, Math.min(255, 120 + 80 * Math.sin(x / 110) + noise));
    data[i + 1] = Math.max(0, Math.min(255, 110 + 85 * Math.cos(y / 97) + noise));
    data[i + 2] = Math.max(0, Math.min(255, 100 + 70 * Math.sin((x + y) / 130) + noise));
  }
  return sharp(data, { raw: { width, height, channels: 3 } });
}

function screenshot() {
  // Deliberately dense CJK-like square strokes on a transparent UI background.
  const width = 760, height = 380, pixels = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, gx = x % 36, gy = y % 36;
    const stroke = x > 16 && y > 16 && ((gx > 5 && gx < 29 && [7, 16, 26].some(n => Math.abs(gy - n) < 2)) || (gy > 5 && gy < 29 && [7, 17, 27].some(n => Math.abs(gx - n) < 2)));
    pixels[i] = stroke ? 23 : 249; pixels[i + 1] = stroke ? 39 : 250; pixels[i + 2] = stroke ? 61 : 252;
    pixels[i + 3] = x < 12 ? 96 : 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } });
}

async function rgba(filename) { return sharp(filename).ensureAlpha().raw().toBuffer(); }

test('photo WebP preserves dimensions, creates512 preview, caches by profile and leaves CAS untouched', async t => {
  const f = await fixture(t), source = await f.save(await photo().jpeg({ quality: 96 }).toBuffer(), 'jpg');
  const result = await f.images.prepare(source);
  assert.equal(result.reason, 'converted-webp'); assert.equal(result.full.type, 'image/webp');
  assert(result.full.size < source.fileRecord.size); assert.deepEqual([result.full.width, result.full.height], [900, 600]);
  assert.equal(result.preview.width, 512); assert.equal(result.preview.height, 341);
  assert.equal(hash(await fs.readFile(source.sourcePath)), source.fileRecord.id);
  assert.equal(result.reused, false); assert.equal((await f.images.prepare(source)).reused, true);
  const compact = await f.images.prepare({ ...source, preset: 'compact' });
  assert.notEqual(compact.full.path, result.full.path); assert(compact.full.size < result.full.size);
  assert.equal(compact.encoderVersion, result.encoderVersion);
});

test('clarity CJK-like screenshot retains every pixel and partial alpha with lossless WebP', async t => {
  const f = await fixture(t), source = await f.save(await screenshot().png({ compressionLevel: 0 }).toBuffer(), 'png');
  const result = await f.images.prepare(source);
  assert.equal(result.reason, 'converted-webp'); assert.equal((await sharp(result.full.path).metadata()).hasAlpha, true);
  assert.deepEqual(await rgba(result.full.path), await rgba(source.sourcePath));
  assert.equal(hash(await fs.readFile(source.sourcePath)), source.fileRecord.id);
  const compactLossless = await f.images.prepare({ ...source, preset: 'compact', forceLossless: true });
  assert.deepEqual(await rgba(compactLossless.full.path), await rgba(source.sourcePath));
  assert.notEqual(compactLossless.full.path, result.full.path);
});

test('24-bit BMP becomes lossless opaque WebP and32-bit BMP preserves meaningful alpha', async t => {
  const f = await fixture(t), width = 200, height = 100;
  const rgba = await screenshot().resize(width, height).ensureAlpha().raw().toBuffer();
  const abgr = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    abgr[i] = rgba[i + 3]; abgr[i + 1] = rgba[i + 2]; abgr[i + 2] = rgba[i + 1]; abgr[i + 3] = rgba[i];
  }
  const encoded = bmp.encode({ data: abgr, width, height }).data;
  const source24 = await f.save(encoded, 'bmp'), result24 = await f.images.prepare(source24);
  assert.equal(result24.full.type, 'image/webp'); assert.equal(result24.reason, 'converted-webp');
  const expected24 = Buffer.from(rgba);
  for (let i = 3; i < expected24.length; i += 4) expected24[i] = 255;
  assert.deepEqual(await sharp(result24.full.path).ensureAlpha().raw().toBuffer(), expected24);
  const encoded32 = Buffer.alloc(54 + width * height * 4);
  encoded.copy(encoded32, 0, 0, 54); encoded32.writeUInt32LE(encoded32.length, 2);
  encoded32.writeUInt16LE(32, 28); encoded32.writeUInt32LE(width * height * 4, 34);
  for (let i = 0; i < rgba.length; i += 4) {
    encoded32[i + 54] = rgba[i + 2]; encoded32[i + 55] = rgba[i + 1];
    encoded32[i + 56] = rgba[i]; encoded32[i + 57] = rgba[i + 3];
  }
  const source32 = await f.save(encoded32, 'bmp'), result32 = await f.images.prepare(source32);
  assert.equal(result32.reason, 'converted-webp');
  assert.deepEqual(await sharp(result32.full.path).ensureAlpha().raw().toBuffer(), rgba);
  assert.equal(hash(await fs.readFile(source24.sourcePath)), source24.fileRecord.id);
  assert.equal(hash(await fs.readFile(source32.sourcePath)), source32.fileRecord.id);
});

test('EXIF orientation is physically normalized and output is sRGB without source metadata', async t => {
  const f = await fixture(t), source = await f.save(await photo(900, 600).jpeg({ quality: 96 }).withMetadata({ orientation: 6 }).toBuffer(), 'jpg');
  const result = await f.images.prepare(source), metadata = await sharp(result.full.path).metadata();
  assert.equal(result.reason, 'converted-webp'); assert.deepEqual([result.full.width, result.full.height], [600, 900]);
  assert.equal(metadata.orientation, undefined); assert.equal(metadata.space, 'srgb'); assert.equal(metadata.exif, undefined);
  const expected = await sharp(source.sourcePath).autoOrient().raw().toBuffer();
  const actual = await sharp(result.full.path).raw().toBuffer();
  let error = 0; for (let i = 0; i < actual.length; i++) error += Math.abs(actual[i] - expected[i]);
  assert(error / actual.length < 5);
});

test('animated GIF derivatives retain all frames, frame timing, loop and per-frame dimensions', async t => {
  const f = await fixture(t), width = 720, height = 480, pixels = Buffer.alloc(width * height * 2 * 3);
  for (let y = 0; y < height * 2; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3; pixels[i] = y < height ? 220 : 30; pixels[i + 1] = x % 250; pixels[i + 2] = y % 250;
  }
  const gif = await sharp(pixels, { raw: { width, height: height * 2, channels: 3, pageHeight: height } }).gif({ delay: [80, 170], loop: 3 }).toBuffer();
  const source = await f.save(gif, 'gif'), result = await f.images.prepare(source);
  for (const item of [result.full, result.preview]) {
    const metadata = await sharp(item.path, { animated: true }).metadata();
    assert.equal(metadata.pages, 2); assert.deepEqual(metadata.delay, [80, 170]); assert.equal(metadata.loop, 3);
    assert.equal(item.width, metadata.width); assert.equal(item.height, metadata.pageHeight);
  }
  assert.equal(result.preview.width, 512); assert.equal(result.preview.height, 341);
  assert.equal(hash(await fs.readFile(source.sourcePath)), source.fileRecord.id);
});

test('existing WebP passes through exactly while obtaining a WebP preview', async t => {
  const f = await fixture(t), source = await f.save(await photo().webp({ quality: 83 }).toBuffer(), 'webp');
  const result = await f.images.prepare(source);
  assert.equal(result.reason, 'existing-webp'); assert.equal(result.full.path, source.sourcePath);
  assert.equal(result.full.sha256, source.fileRecord.id); assert.equal(result.preview.type, 'image/webp');
});

test('corrupt derivative cache is regenerated and unsupported files do not stop the worker queue', async t => {
  const f = await fixture(t), source = await f.save(await photo().jpeg({ quality: 96 }).toBuffer(), 'jpg');
  const first = await f.images.prepare(source);
  await fs.writeFile(first.full.path, Buffer.alloc(first.full.size));
  const rebuilt = await f.images.prepare(source);
  assert.equal(rebuilt.reused, false); assert.equal(rebuilt.full.sha256, first.full.sha256);
  assert.equal((await sharp(rebuilt.full.path).metadata()).format, 'webp');
  const unsupported = await f.save(Buffer.from('Synthetic unsupported attachment'), 'bin');
  const [bypassed, reused] = await Promise.all([f.images.prepare(unsupported), f.images.prepare(source)]);
  assert.equal(bypassed.reason, 'unsupported-image'); assert.equal(bypassed.full.path, unsupported.sourcePath);
  assert.equal(bypassed.preview, null); assert.equal(reused.reused, true);
  await assert.rejects(f.images.prepare({ ...source, preset: 'unknown' }), /Unknown image publication preset/);
  assert.equal((await f.images.prepare(source)).reused, true);
});

test('small or oversized images retain originals, PDF is bypassed, and corruption is rejected even on cache hits', async t => {
  const f = await fixture(t), tiny = await f.save(await sharp({ create: { width: 1, height: 1, channels: 3, background: 'white' } }).gif().toBuffer(), 'gif');
  const small = await f.images.prepare(tiny); assert.equal(small.full.path, tiny.sourcePath); assert.equal(small.reason, 'source-smaller');
  const wide = await f.save(await sharp({ create: { width: 16384, height: 2, channels: 3, background: 'red' } }).png().toBuffer(), 'png');
  const limit = await f.images.prepare(wide); assert.equal(limit.reason, 'webp-dimension-limit'); assert.equal(limit.full.path, wide.sourcePath); assert(limit.preview.width <= 512);
  const pdf = await f.save(Buffer.from('%PDF-1.7\nSynthetic non-raster PDF\n%%EOF'), 'pdf');
  const bypass = await f.images.prepare(pdf); assert.equal(bypass.reason, 'pdf-bypass'); assert.equal(bypass.preview, null); assert.equal(bypass.full.type, 'application/pdf');
  await fs.writeFile(tiny.sourcePath, Buffer.alloc(tiny.fileRecord.size));
  await assert.rejects(f.images.prepare(tiny), /integrity failure/);
});
