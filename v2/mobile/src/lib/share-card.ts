// ─── Compartir a stories: tarjeta de texto (mejora 60) ───────────────────
// NOTA IMPORTANTE: el enunciado pedía generar una imagen cuadrada compartible
// con react-native-view-shot. Se comprobó package.json y esa librería NO
// está instalada en el proyecto (y la tarea prohíbe tocar package.json o
// instalar paquetes). Por eso este helper sigue el plan B ya previsto:
// compone un texto atractivo (título + subtítulo + pie + enlace) y lo pasa
// a la hoja nativa de compartir de React Native (Share.share), el mismo
// mecanismo que ya usa app/evento/[id].tsx para compartir eventos. Si algún
// día se añade react-native-view-shot, este archivo es el sitio donde
// implementar la generación de la imagen real.
import { Share } from 'react-native';

export type ShareCardInput = {
  /** Título principal (p. ej. el nombre de la beca). */
  title: string;
  /** Dato destacado, opcional (importe, plazo…). */
  subtitle?: string | null;
  /** Pie de la tarjeta, opcional (una frase corta de cierre). */
  footer?: string | null;
  /** Enlace a incluir al final del mensaje. */
  url?: string | null;
};

// Compone el texto de la "tarjeta": puramente textual, sin efectos, para
// poder probarlo sin depender de la hoja nativa de compartir.
export function buildShareCardText({ title, subtitle, footer, url }: ShareCardInput): string {
  const lines = [`✨ ${title}`];
  if (subtitle) lines.push(subtitle);
  if (footer) lines.push(footer);
  if (url) lines.push(url);
  return lines.join('\n');
}

// Abre la hoja nativa de compartir con el texto compuesto. Fail-soft: si el
// usuario cancela o el sistema no puede abrir la hoja, se devuelve ok:false
// sin lanzar ninguna excepción hacia quien lo llama.
export async function shareCard(input: ShareCardInput): Promise<{ ok: boolean }> {
  try {
    await Share.share({ message: buildShareCardText(input) });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
