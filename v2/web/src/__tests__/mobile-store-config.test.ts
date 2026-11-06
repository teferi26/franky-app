import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const configure = require('../../../mobile/app.config.js');
const app = require('../../../mobile/app.json').expo;
const previous = process.env.GOOGLE_SERVICES_JSON;
const folders: string[] = [];
function firebaseFile(data: unknown) {
  const folder = mkdtempSync(join(tmpdir(), 'franky-firebase-config-'));
  folders.push(folder);
  const file = join(folder, 'google-services.json');
  writeFileSync(file, JSON.stringify(data));
  process.env.GOOGLE_SERVICES_JSON = file;
  return file;
}
afterEach(() => {
  if (previous === undefined) delete process.env.GOOGLE_SERVICES_JSON;
  else process.env.GOOGLE_SERVICES_JSON = previous;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});

describe('Native store config protects Firebase credentials and the approved UI', () => {
  it('keeps the entire approved config intact when Firebase is not configured', () => {
    delete process.env.GOOGLE_SERVICES_JSON;
    expect(configure({ config: app })).toBe(app);
  });
  it('rejects a service-account private key before it can enter the app archive', () => {
    firebaseFile({ type: 'service_account', private_key: 'synthetic-not-a-key' });
    expect(() => configure({ config: app })).toThrow(/clave privada/);
  });
  it('rejects a Firebase file for a different Android app', () => {
    firebaseFile({ project_info: { project_number: '12345' }, client: [{ client_info: {
      mobilesdk_app_id: '1:12345:android:fixture', android_client_info: { package_name: 'fixture.wrong.app' },
    } }] });
    expect(() => configure({ config: app })).toThrow(/no contiene/);
  });
  it('adds only the Firebase file path for the exact Franky application', () => {
    const file = firebaseFile({ project_info: { project_number: '12345' }, client: [{ client_info: {
      mobilesdk_app_id: '1:12345:android:fixture', android_client_info: { package_name: 'es.franky.app' },
    } }] });
    expect(configure({ config: app })).toEqual({ ...app, android: { ...app.android, googleServicesFile: file } });
  });
  it('does not echo malformed config contents in a build error', () => {
    const file = firebaseFile({}); writeFileSync(file, 'synthetic-sensitive-invalid-json');
    expect(() => configure({ config: app })).toThrow('GOOGLE_SERVICES_JSON debe apuntar al archivo Android descargado de Firebase.');
  });
});
