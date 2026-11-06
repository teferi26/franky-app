// Detección de webviews in-app (Instagram, TikTok, WhatsApp…) a partir del
// user agent, como función PURA: sin tocar `navigator`, para poder usarla
// tanto en cliente (lib/in-app-browser.ts) como en servidor si hace falta.

export const IN_APP_MARKERS: [RegExp, string][] = [
  [/instagram/i, "Instagram"],
  [/fbav|fban|fb_iab/i, "Facebook"],
  [/tiktok|musical_ly|bytedancewebview/i, "TikTok"],
  [/snapchat/i, "Snapchat"],
  [/whatsapp/i, "WhatsApp"],
  [/telegram/i, "Telegram"],
  [/twitter/i, "X"],
  [/linkedinapp/i, "LinkedIn"],
  [/pinterest/i, "Pinterest"],
  [/micromessenger/i, "WeChat"],
  [/\bline\//i, "LINE"],
  [/\bgsa\b/i, "la app de Google"],
];

/** Nombre legible de la app cuyo webview corresponde al UA, o null si es un navegador normal. */
export function inAppBrowserNameFromUA(ua: string): string | null {
  for (const [re, name] of IN_APP_MARKERS) {
    if (re.test(ua)) return name;
  }
  // Marcador genérico de WebView Android ("; wv)"): el Chrome normal no lo lleva.
  if (/android/i.test(ua) && /; wv\)/i.test(ua)) return "esta app";
  return null;
}
