import { NextResponse } from "next/server";

/**
 * assetlinks.json: el equivalente de Android a los universal links de iOS.
 *
 * Mismo problema que el archivo de Apple: el que había en public/ llevaba
 * `"REEMPLAZAR_CON_SHA256_DE_LA_FIRMA"`, así que la verificación de App Links
 * fallaba y los enlaces de franky.es NO abrían la app. La huella de la firma es
 * un dato de la cuenta, no del código: se lee de ANDROID_CERT_SHA256.
 *
 * Dónde está la huella:
 *   npx eas credentials    → Android → production → keystore → SHA-256 fingerprint
 * o en Play Console → Test and release → Setup → App signing (la de "App signing
 * key certificate", NO la de upload, si usas Play App Signing).
 *
 * Se admiten varias separadas por comas: normalmente hacen falta la de Play App
 * Signing y la de upload/EAS mientras convivan.
 *
 * Se sirve en /.well-known/assetlinks.json vía rewrite de next.config.ts.
 */
export const dynamic = "force-dynamic";

const PACKAGE = (process.env.ANDROID_PACKAGE ?? "es.franky.app").trim();

// Public certificate fingerprint read from the existing EAS production keystore,
// 2026-09-05. Does not contain a key or credential. Play App Signing may use a
// different certificate: add that verified fingerprint to ANDROID_CERT_SHA256.
const EAS_CERT_SHA256 = "94:7C:14:52:84:FE:E3:CC:A8:7F:31:A1:B6:57:CC:86:38:6D:61:2F:5D:49:A0:D1:6F:8D:58:54:94:7E:E7:AE";

function huellas(): string[] {
  return (process.env.ANDROID_CERT_SHA256 ?? EAS_CERT_SHA256)
    .split(",")
    .map((h) => h.trim().toUpperCase())
    .filter((h) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(h));
}

export async function GET() {
  const fingerprints = huellas();

  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: PACKAGE,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      // Sin huella válida se sirve una lista vacía: Android no verifica y los
      // enlaces se abren en el navegador (lo que ya pasaba con el marcador),
      // pero al menos el archivo es válido y se ve que falta configurar.
      ...(fingerprints.length ? {} : { "X-Franky-Aviso": "falta ANDROID_CERT_SHA256" }),
    },
  });
}
