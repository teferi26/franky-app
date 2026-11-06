// PKI sintética para probar la verificación de JWS de Apple sin red: una CA
// raíz, un intermedio y una hoja con los mismos OID que usa Apple, firmados
// con claves P-256 generadas al vuelo. Los certificados se codifican en DER a
// mano porque node:crypto sabe leerlos pero no crearlos.
import { X509Certificate, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

function length(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag: number, ...content: Buffer[]) => {
  const body = Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), length(body.length), body]);
};
const seq = (...c: Buffer[]) => tlv(0x30, ...c);
const set = (...c: Buffer[]) => tlv(0x31, ...c);
const int = (n: number) => tlv(0x02, Buffer.from([n & 0x7f]));
const bool = (v: boolean) => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const octets = (b: Buffer) => tlv(0x04, b);
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, 'utf8'));
function oid(dotted: string): Buffer {
  const parts = dotted.split('.').map(Number);
  const out = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const stack = [part & 0x7f];
    let v = part >> 7;
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v >>= 7;
    }
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}
function time(date: Date): Buffer {
  const s = date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return tlv(0x18, Buffer.from(s + 'Z'));
}
const name = (cn: string) => seq(set(seq(oid('2.5.4.3'), utf8(cn))));
const ecdsaSha256 = seq(oid('1.2.840.10045.4.3.2'));

export const LEAF_OID = '1.2.840.113635.100.6.11.1';
export const INTERMEDIATE_OID = '1.2.840.113635.100.6.2.1';

export interface TestCert {
  cert: X509Certificate;
  der: Buffer;
  key: KeyObject;
  cn: string;
}

let serial = 1;
export function makeCert(opts: {
  cn: string;
  issuer?: TestCert;
  ca: boolean;
  appleOid?: string;
  notBefore?: Date;
  notAfter?: Date;
}): TestCert {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const issuerName = opts.issuer?.cn ?? opts.cn;
  const signer = opts.issuer?.key ?? privateKey;
  const extensions = [
    seq(oid('2.5.29.19'), bool(true), octets(opts.ca ? seq(bool(true)) : seq())),
    ...(opts.appleOid ? [seq(oid(opts.appleOid), octets(Buffer.from([0x05, 0x00])))] : []),
  ];
  const tbs = seq(
    tlv(0xa0, int(2)),
    int(serial++),
    ecdsaSha256,
    name(issuerName),
    seq(time(opts.notBefore ?? new Date(Date.now() - 365 * 86_400_000)), time(opts.notAfter ?? new Date(Date.now() + 365 * 86_400_000))),
    name(opts.cn),
    publicKey.export({ type: 'spki', format: 'der' }),
    tlv(0xa3, seq(...extensions)),
  );
  const signature = sign('sha256', tbs, { key: signer, dsaEncoding: 'der' });
  const der = seq(tbs, ecdsaSha256, tlv(0x03, Buffer.from([0]), signature));
  return { cert: new X509Certificate(der), der, key: privateKey, cn: opts.cn };
}

export interface TestPki {
  root: TestCert;
  intermediate: TestCert;
  leaf: TestCert;
}

export function makePki(): TestPki {
  const root = makeCert({ cn: 'Test Root CA - G3', ca: true });
  const intermediate = makeCert({ cn: 'Test WWDR - G6', issuer: root, ca: true, appleOid: INTERMEDIATE_OID });
  const leaf = makeCert({ cn: 'Test Prod ECC Mac App Store', issuer: intermediate, ca: false, appleOid: LEAF_OID });
  return { root, intermediate, leaf };
}

let shared: TestPki | null = null;
export function testPki(): TestPki {
  shared ??= makePki();
  return shared;
}

const b64url = (b: Buffer) => b.toString('base64url');

/** Firma un JWS ES256 con la hoja y la cadena en x5c, como hace Apple. */
export function signJws(payload: unknown, chain: TestCert[] = [testPki().leaf, testPki().intermediate, testPki().root], alg = 'ES256'): string {
  const header = { alg, x5c: chain.map((c) => c.der.toString('base64')) };
  const input = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const signature = sign('sha256', Buffer.from(input), { key: chain[0].key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(signature)}`;
}
