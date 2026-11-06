// query-string 7 is required by Expo Router / React Navigation. Adapt its CJS
// import to decode-uri-component 0.5's patched linear decoder (ESM). This is
// deliberately fail-fast when the upstream source changes, never a blind patch.
const fs = require('node:fs');
const file = require.resolve('query-string');
const source = fs.readFileSync(file, 'utf8');
const original = "const decodeComponent = require('decode-uri-component');";
const replacement = "const decoderModule = require('decode-uri-component');\nconst decodeComponent = decoderModule.default || decoderModule;";
if (!source.includes(replacement)) {
  if (!source.includes(original) || source.split(original).length !== 2) throw new Error('Review query-string decoder interop before installing updated dependencies');
  fs.writeFileSync(file, source.replace(original, replacement));
}

// auth-js 2.108.1 releases its custom lock before INITIAL_SESSION finishes.
// A refresh in that callback can otherwise overwrite a later account login.
// Match only this callback, patch all runtime entry points, and fail on drift.
const path = require('node:path');
const authRoot = path.dirname(require.resolve('@supabase/auth-js/package.json'));
const authVersion = JSON.parse(fs.readFileSync(path.join(authRoot, 'package.json'), 'utf8')).version;
if (authVersion !== '2.108.1') throw new Error(`Review the Auth INITIAL_SESSION lock fix for ${authVersion}`);
const authFiles = ['src/GoTrueClient.ts', 'dist/main/GoTrueClient.js', 'dist/module/GoTrueClient.js'];
const patches = authFiles.map(relative => {
  const filename = path.join(authRoot, relative);
  const text = fs.readFileSync(filename, 'utf8');
  const anchor = /(await this\._acquireLock\(this\.lockAcquireTimeout, async \(\) => \{\r?\n\s+)(return )?(this\._emitInitialSession\(id\);?\r?\n\s+\})/g;
  const matches = [...text.matchAll(anchor)];
  if (matches.length !== 1) throw new Error(`Review Auth INITIAL_SESSION lock anchor: ${relative}`);
  return { filename, text: text.replace(anchor, '$1return $3') };
});
for (const patch of patches) fs.writeFileSync(patch.filename, patch.text);
