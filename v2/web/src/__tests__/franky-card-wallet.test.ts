// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  buildAppleCard,
  cardWalletAvailability,
} from "@/lib/franky-card-wallet";
import type { CardPersonal } from "../../../shared/franky-card";
vi.mock("@/lib/franky-card-api", () => ({ CARD_SITE: "https://franky.es" }));
const require = createRequire(import.meta.url);
// Transitive signing dependency of passkit-generator; the certificates below are disposable test fixtures.
const forge = require("node-forge");
const keys = forge.pki.rsa.generateKeyPair(1024),
  cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01";
cert.validity.notBefore = new Date(Date.now() - 60000);
cert.validity.notAfter = new Date(Date.now() + 86400000);
cert.setSubject([{ name: "commonName", value: "Franky local test only" }]);
cert.setIssuer(cert.subject.attributes);
cert.sign(keys.privateKey, forge.md.sha256.create());
const profile = {
  full_name: "Persona de prueba",
  photo_path: null,
  university: "Universidad privada de prueba",
  studies: "Estudios declarados",
  cohort_year: 2026,
  academic_visibility: false,
  student_verified_until: null,
};
const card = { profile, enabled: true, demo: false } as CardPersonal;
function zipEntries(buffer: Buffer) {
  const entries: Record<string, Buffer> = {};
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const compression = buffer.readUInt16LE(offset + 8),
      size = buffer.readUInt32LE(offset + 18),
      nameLength = buffer.readUInt16LE(offset + 26),
      extraLength = buffer.readUInt16LE(offset + 28),
      name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength,
      body = buffer.subarray(start, start + size);
    entries[name] = compression === 8 ? inflateRawSync(body) : body;
    offset = start + size;
  }
  return entries;
}
beforeEach(() => {
  vi.stubEnv("FRANKY_CARD_APPLE_WALLET_ENABLED", "true");
  vi.stubEnv("CARD_APPLE_PASS_TYPE_ID", "pass.es.franky.fixture");
  vi.stubEnv("CARD_APPLE_TEAM_ID", "FIXTURE123");
  vi.stubEnv("CARD_APPLE_WWDR_CERT", forge.pki.certificateToPem(cert));
  vi.stubEnv("CARD_APPLE_SIGNER_CERT", forge.pki.certificateToPem(cert));
  vi.stubEnv(
    "CARD_APPLE_SIGNER_KEY",
    forge.pki.privateKeyToPem(keys.privateKey),
  );
  vi.stubEnv("FRANKY_CARD_GOOGLE_WALLET_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());
describe("Actual Apple pass generation with local disposable certificates", () => {
  it("requires explicit activation and complete signing configuration", () => {
    expect(cardWalletAvailability().appleWallet).toBe(true);
    vi.stubEnv("CARD_APPLE_SIGNER_KEY", "");
    expect(cardWalletAvailability().appleWallet).toBe(false);
    expect(cardWalletAvailability().googleWallet).toBe(false);
  });
  it("blocks generation if Wallet is not configured", async () => {
    vi.stubEnv("FRANKY_CARD_APPLE_WALLET_ENABLED", "false");
    await expect(
      buildAppleCard("test-user", card, {
        token: "opaque",
        expires_at: null,
        kind: "wallet",
        card_active: true,
        loyalty_available: true,
      }),
    ).rejects.toThrow("wallet_unavailable");
  });
  it("produces a signed pass with a complete manifest and no academic or account identifiers by default", async () => {
    const buffer = await buildAppleCard("account-not-for-sharing", card, {
      token: "opaque-wallet-reference",
      expires_at: null,
      kind: "wallet",
      card_active: true,
      loyalty_available: true,
    });
    const entries = zipEntries(buffer),
      pass = JSON.parse(entries["pass.json"].toString()),
      manifest = JSON.parse(entries["manifest.json"].toString());
    expect(entries.signature.length).toBeGreaterThan(100);
    for (const [name, hash] of Object.entries(manifest))
      expect(createHash("sha1").update(entries[name]).digest("hex")).toBe(hash);
    expect(pass.sharingProhibited).toBe(true);
    expect(pass.barcodes[0].message).toBe("opaque-wallet-reference");
    expect(JSON.stringify(pass)).not.toContain("account-not-for-sharing");
    expect(JSON.stringify(pass)).not.toContain(profile.university);
    expect(pass.nfc).toBeUndefined();
    expect(pass.generic.primaryFields[0].value).toBe(profile.full_name);
    expect(entries["icon@2x.png"]).toBeDefined();
  });
  it("includes optional academic details only after the holder opts in, labelled as declared", async () => {
    const buffer = await buildAppleCard(
      "test-user",
      { ...card, profile: { ...profile, academic_visibility: true } },
      {
        token: "opaque",
        expires_at: null,
        kind: "wallet",
        card_active: false,
        loyalty_available: true,
      },
    );
    const pass = JSON.parse(zipEntries(buffer)["pass.json"].toString());
    expect(JSON.stringify(pass)).toContain(profile.university);
    expect(
      pass.generic.backFields.find((f: { key: string }) => f.key === "studies")
        .label,
    ).toBe("Estudios declarados");
    expect(JSON.stringify(pass)).not.toContain("Card activa");
  });
});
