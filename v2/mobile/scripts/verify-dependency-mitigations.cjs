const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./patch-dependency-interop.cjs');
const query = require('query-string');
assert.equal(query.parse('career=ingenier%C3%ADa+inform%C3%A1tica').career, 'ingeniería informática');
const started = Date.now();
const invalid = '%C0%AF'.repeat(20_000);
assert.equal(query.parse(`value=${invalid}`).value, invalid);
assert.ok(Date.now()-started < 2000, 'Malformed URL decoding must not hang');
require('../metro.config');
const size = require('image-size');
const { typeHandlers } = require(path.join(path.dirname(require.resolve('image-size')), 'types/index.js'));
for (const type of ['icns','heif','jxl','jxl-stream']) {
  assert.equal(typeHandlers[type].validate(Buffer.alloc(64)), false);
  assert.throws(() => typeHandlers[type].calculate(Buffer.alloc(64)), /Unsupported bundled image format/);
}
// Zero-sized malformed JXL boxes reached an infinite loop in the old detector.
for (const hex of ['69636e730000001069636e3800000000','00000018667479706865696300000000686569636d696631','000000004a584c200d0a870a000000006a786c70']) {
  assert.throws(() => size.imageSize(Buffer.from(hex,'hex')), /unsupported file type|disabled file type/);
}
const png = fs.readFileSync(path.join(__dirname,'../assets/images/icon.png'));
const dimensions = size.imageSize(png);
assert.ok(dimensions.width>0 && dimensions.height>0);
console.log('Dependency mitigations passed: valid Unicode, 120k malformed URI, 4 blocked parsers, corrupt containers and app PNG');
