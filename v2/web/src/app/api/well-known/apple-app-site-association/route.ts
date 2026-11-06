import { NextResponse } from "next/server";

/**
 * apple-app-site-association: le dice a iOS que los enlaces de franky.es los
 * abre la app instalada (universal links).
 *
 * POR QUÉ ES UNA RUTA Y NO UN ARCHIVO ESTÁTICO
 *
 * El archivo que había en public/ llevaba `"appID": "TEAMID.es.franky.app"`
 * literalmente, con el Team ID sin rellenar, así que iOS descartaba el archivo
 * y NINGÚN enlace abría la app. El Team ID es un dato de la cuenta de Apple, no
 * del código: ahora se lee de la variable de entorno APPLE_TEAM_ID y se cambia
 * en Vercel sin tocar el repo (y sin volver a olvidarse de rellenarlo).
 *
 * Dónde está el Team ID: developer.apple.com → Account → Membership details, o
 * App Store Connect → Users and Access → Integrations → App Store Connect API.
 * Son 10 caracteres tipo `A1B2C3D4E5`.
 *
 * Sin la variable puesta se sirve `details: []` (nadie reclama los enlaces, se
 * abren en el navegador). Es lo mismo que pasaba antes con el marcador, pero sin
 * fingir que está configurado.
 *
 * La ruta se sirve en /.well-known/apple-app-site-association mediante un
 * rewrite de next.config.ts (el muro de auth ya excluye /.well-known).
 */
export const dynamic = "force-dynamic";

// Team ID de la cuenta de desarrollador de Franky (X5D8A42K4R, cuenta
// individual), leído del propio `eas credentials` el 13-ago-2026.
//
// Va en el código y no solo en el entorno a propósito: NO es un secreto (este
// archivo lo publica en abierto, es su función) y así los enlaces universales
// funcionan sin depender de que alguien se acuerde de poner una variable. La
// variable APPLE_TEAM_ID sigue mandando por encima, para el día que cambie la
// cuenta (p. ej. si se pasa a una Organization).
const DEFAULT_TEAM_ID = "X5D8A42K4R";

const TEAM_ID = (process.env.APPLE_TEAM_ID?.trim() || DEFAULT_TEAM_ID).trim();
const BUNDLE_ID = (process.env.APPLE_BUNDLE_ID?.trim() || "es.franky.app").trim();

// Rutas que abre la app. Las NOT van primero: iOS aplica la primera que casa.
// Fuera quedan las que TIENEN que abrirse en el navegador (verificación de
// email, restablecer contraseña, OAuth, paneles) y la API.
const PATHS = [
  "NOT /api/*",
  "NOT /auth/*",
  "NOT /restablecer",
  "NOT /email-verificado",
  "NOT /admin/*",
  "NOT /propietario/*",
  "NOT /eventos/*/entradas",
  "NOT /eventos/*/codigos",
  "NOT /eventos/*/asistentes",
  "NOT /eventos/*/editar",
  "/pago/retorno",
  "/fomo",
  "/fomo/*",
  "/crush",
  "/universidades",
  "/universidades/*",
  "/carreras",
  "/carreras/*",
  "/uni/*",
  "/carrera/*",
  "/eventos",
  "/eventos/*",
  "/becas",
  "/becas/*",
  "/roomie-match",
  "/roomie-match/conexiones",
  "/ocio",
  "/ocio/*",
  "/notas-corte",
  "/perfil",
  "/perfil/*",
];

export async function GET() {
  const body = {
    applinks: {
      apps: [],
      details: TEAM_ID
        ? [{ appID: `${TEAM_ID}.${BUNDLE_ID}`, paths: PATHS }]
        : [],
    },
    // Sin Team ID no se declara nada: mejor que iOS ignore el archivo entero
    // (enlaces al navegador) que servir un appID inventado.
    ...(TEAM_ID
      ? {}
      : {
          _aviso:
            "Falta APPLE_TEAM_ID en el entorno: los universal links de iOS no funcionarán hasta que se defina.",
        }),
  };

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      // iOS cachea el archivo agresivamente vía su CDN; una hora es suficiente
      // para que un cambio de configuración se propague sin esperar días.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
