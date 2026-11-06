// Precios de Franky (espejo de web/src/lib/pricing.ts).
//
// POR QUÉ EXISTE: `admin_monetization_summary(p_pricing jsonb)` (migración 044)
// NO tiene los precios dentro. Los pide como argumento a propósito, porque la
// fuente de verdad vive en el código de la app. La web se los pasa desde
// web/src/lib/pricing.ts; el móvil no tenía de dónde sacarlos y llamaba a la
// RPC sin argumentos, así que Postgres respondía
// «function public.admin_monetization_summary() does not exist» y, con el
// Promise.all de antes, ESE fallo tumbaba las ocho secciones del panel.
//
// Si cambias un precio, cámbialo en los DOS ficheros.
export const PRICING = {
  pro: { monthly: 4.99, yearly: 39.99 },
  premium: { monthly: 9.99, yearly: 79.99 },
  business_leisure: { monthly: 9.99, yearly: 100 },
  business_housing: { monthly: 9.99 },
} as const;
