// Synthetic local video for tests: a moving test pattern with a burned-in frame
// counter, H.264/MP4 with faststart so Range seeking works. Requires ffmpeg on PATH.
const { execFileSync } = require('node:child_process'), fs = require('node:fs');
module.exports = function videoFixture(file, { seconds = 30, width = 640, height = 360 } = {}) {
    try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', windowsHide: true }); }
    catch { throw Error('The video checks need ffmpeg on PATH to generate their synthetic fixture'); }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=duration=${seconds}:size=${width}x${height}:rate=25`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '25', '-movflags', '+faststart', file], { windowsHide: true });
    return fs.statSync(file).size;
};
