import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PKPass } from "passkit-generator";
import { importPKCS8, SignJWT } from "jose";
import { CARD_SITE } from "./franky-card-api";
import type { CardCredential, CardPersonal } from "../../../shared/franky-card";

const pem = (key: string) => (process.env[key] ?? "").replace(/\\n/g, "\n");
export function cardWalletAvailability() {
  return {
    appleWallet:
      process.env.FRANKY_CARD_APPLE_WALLET_ENABLED === "true" &&
      [
        "CARD_APPLE_PASS_TYPE_ID",
        "CARD_APPLE_TEAM_ID",
        "CARD_APPLE_WWDR_CERT",
        "CARD_APPLE_SIGNER_CERT",
        "CARD_APPLE_SIGNER_KEY",
      ].every((k) => !!process.env[k]),
    googleWallet:
      process.env.FRANKY_CARD_GOOGLE_WALLET_ENABLED === "true" &&
      [
        "CARD_GOOGLE_ISSUER_ID",
        "CARD_GOOGLE_CLASS_ID",
        "CARD_GOOGLE_CLIENT_EMAIL",
        "CARD_GOOGLE_PRIVATE_KEY",
      ].every((k) => !!process.env[k]),
  };
}
/** Wallet is a revocable lookup credential, never proof of payment or a redeemable voucher. */
export async function buildAppleCard(
  userId: string,
  card: CardPersonal,
  credential: CardCredential,
  photo?: Buffer,
) {
  if (!cardWalletAvailability().appleWallet || !card.profile)
    throw Error("wallet_unavailable");
  const icon = await readFile(
    path.join(process.cwd(), "public/img/franky-icon.png"),
  );
  const assets: Record<string, Buffer> = {};
  for (const [suffix, scale] of [
    ["", 1],
    ["@2x", 2],
    ["@3x", 3],
  ] as const) {
    assets[`icon${suffix}.png`] = await sharp(icon)
      .resize(29 * scale, 29 * scale)
      .png()
      .toBuffer();
    if (photo)
      assets[`thumbnail${suffix}.png`] = await sharp(photo, {
        limitInputPixels: 16_777_216,
        failOn: "error",
        animated: false,
      })
        .resize(90 * scale, 90 * scale, { fit: "cover" })
        .png()
        .toBuffer();
  }
  const pass = new PKPass(
    assets,
    {
      wwdr: pem("CARD_APPLE_WWDR_CERT"),
      signerCert: pem("CARD_APPLE_SIGNER_CERT"),
      signerKey: pem("CARD_APPLE_SIGNER_KEY"),
      signerKeyPassphrase: process.env.CARD_APPLE_SIGNER_PASSPHRASE,
    },
    {
      passTypeIdentifier: process.env.CARD_APPLE_PASS_TYPE_ID!,
      teamIdentifier: process.env.CARD_APPLE_TEAM_ID!,
      serialNumber: createHash("sha256")
        .update(`${userId}:${credential.token}`)
        .digest("hex"),
      organizationName: "Franky",
      description: "Franky Card · Descuentos y fidelización",
      logoText: "franky card",
      backgroundColor: "rgb(33, 20, 62)",
      foregroundColor: "rgb(255, 255, 255)",
      labelColor: "rgb(207, 191, 247)",
      sharingProhibited: true,
    },
  );
  pass.type = "generic";
  pass.primaryFields.push({
    key: "name",
    label: "TITULAR",
    value: card.profile.full_name,
  });
  pass.secondaryFields.push({
    key: "validate",
    label: "DESCUENTOS Y SELLOS",
    value: "Confirma cada uso en Franky",
  });
  if (card.profile.academic_visibility) {
    if (card.profile.university)
      pass.auxiliaryFields.push({
        key: "uni",
        label: "UNIVERSIDAD",
        value: card.profile.university,
      });
    if (card.profile.studies)
      pass.backFields.push({
        key: "studies",
        label: "Estudios declarados",
        value: card.profile.studies,
      });
    if (card.profile.cohort_year)
      pass.backFields.push({
        key: "cohort",
        label: "Promoción declarada",
        value: String(card.profile.cohort_year),
      });
  }
  pass.backFields.push({
    key: "terms",
    label: "Cómo utilizarla",
    value:
      "El comercio escanea este código y tú confirmas la operación en Franky. El descuento y la vigencia se comprueban en cada uso. Los sellos ganados se conservan. Esta tarjeta no acredita matrícula universitaria ni sustituye la TIU.",
  });
  pass.backFields.push({
    key: "link",
    label: "Abrir mi tarjeta",
    value: `${CARD_SITE}/franky-card`,
  });
  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: credential.token,
    messageEncoding: "iso-8859-1",
    altText: "Confirma el uso en Franky",
  });
  return pass.getAsBuffer();
}

export async function buildGoogleCard(
  userId: string,
  card: CardPersonal,
  credential: CardCredential,
) {
  if (!cardWalletAvailability().googleWallet || !card.profile)
    throw Error("wallet_unavailable");
  const issuer = process.env.CARD_GOOGLE_ISSUER_ID!;
  const classId = process.env.CARD_GOOGLE_CLASS_ID!;
  if (
    !/^\d+$/.test(issuer) ||
    !classId.startsWith(issuer + ".") ||
    !/^[\w.-]+$/.test(classId)
  )
    throw Error("wallet_configuration_invalid");
  const key = await importPKCS8(pem("CARD_GOOGLE_PRIVATE_KEY"), "RS256");
  const now = Math.floor(Date.now() / 1000);
  const authToken = await new SignJWT({
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(process.env.CARD_GOOGLE_CLIENT_EMAIL!)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
  const oauth = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: authToken,
    }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!oauth.ok) throw Error("wallet_provider_unavailable");
  const token = (await oauth.json()) as { access_token?: string };
  if (!token.access_token) throw Error("wallet_provider_unavailable");
  // Insert server-side: no personal details or barcode appear in the browser save JWT.
  const objectId = `${issuer}.franky_${createHash("sha256")
    .update(userId + credential.token)
    .digest("hex")
    .slice(0, 40)}`;
  const object = {
    id: objectId,
    classId,
    state: "ACTIVE",
    hexBackgroundColor: "#21143e",
    cardTitle: { defaultValue: { language: "es", value: "Franky Card" } },
    header: { defaultValue: { language: "es", value: card.profile.full_name } },
    subheader: {
      defaultValue: { language: "es", value: "Confirma cada uso en Franky" },
    },
    barcode: {
      type: "QR_CODE",
      value: credential.token,
      alternateText: "Abre Franky para confirmar",
    },
    passConstraints: { screenshotEligibility: "INELIGIBLE" },
    textModulesData: [
      {
        id: "how",
        header: "Descuentos y fidelización",
        body: "La vigencia y las condiciones se comprueban en cada uso. Conservas tus sellos ganados. No sustituye la TIU.",
      },
    ],
    linksModuleData: {
      uris: [
        {
          id: "open",
          uri: `${CARD_SITE}/franky-card`,
          description: "Abrir mi tarjeta",
        },
      ],
    },
  };
  const result = await fetch(
    "https://walletobjects.googleapis.com/walletobjects/v1/genericObject",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(object),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  if (!result.ok && result.status !== 409)
    throw Error("wallet_provider_unavailable");
  const jwt = await new SignJWT({
    aud: "google",
    typ: "savetowallet",
    origins: [CARD_SITE],
    payload: { genericObjects: [{ id: objectId }] },
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(process.env.CARD_GOOGLE_CLIENT_EMAIL!)
    .setIssuedAt(now)
    .setJti(randomUUID())
    .sign(key);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
