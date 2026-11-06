// ─── Subida de media a Supabase Storage desde la app ─────────────────────
// Hay DOS caminos, y elegir el equivocado se paga caro:
//
//   · uploadMedia      para fotos y audios (ficheros pequeños). Hace
//                      fetch(uri) → arrayBuffer → upload, o sea que se trae el
//                      fichero ENTERO a memoria. En React Native no se puede
//                      pasar un File/FormData directo al SDK de Supabase.
//   · uploadLargeFile  para VÍDEO. Sube por XHR + FormData, leyendo del disco
//                      a trozos, con progreso. Con uploadMedia un vídeo de
//                      cientos de MB deja la app sin memoria y se cierra sola.
//
// Destinos y reglas:
//   fomo-media / ligar-media son nombres lógicos: se redirigen al staging
//   privado y solo se publican tras aprobar la publicación asociada.
//   avatars contiene imágenes públicas de perfil/eventos/comunidades/mercado;
//   la primera carpeta DEBE ser el UID y permite subcarpetas por finalidad.
//   chat-media  (privado)  imagen ≤5MB, audio ≤2MB, vídeo ≤1GB — signed URL
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY, UPLOAD_TIMEOUT_MS, fetchConTimeout } from './supabase';
import { withRetry, isRetryableError } from './retry';
import type { OwnedRequest } from './owned-request';
import { uploadPrivateSocialFile } from './social-media-upload';

/** Ancho máximo al que se reescalan las fotos antes de subirlas. */
const MAX_IMAGE_WIDTH = 1440;

/**
 * Tope de un vídeo, en bytes. 1 GB, que a la calidad con la que graba un móvil
 * son unos 10-15 minutos.
 *
 * DE DÓNDE SALE ESTE NÚMERO (para que nadie lo vuelva a tocar a ciegas): hay
 * TRES topes encadenados y manda el más pequeño de los tres.
 *   1. Este, el de la app.
 *   2. `file_size_limit` de cada bucket (migración 160).
 *   3. El tope global del proyecto en Supabase → Storage → Settings, que en el
 *      plan gratuito NO se puede subir de 50 MB. Con el plan Pro sí.
 * Subir solo el número 1 no sirve de nada: Storage devuelve 413 igual.
 *
 * Para vídeos de horas esto no basta: haría falta subida reanudable (TUS), y
 * aun así una subida de varios GB desde un móvil se corta con cualquier cambio
 * de red. Eso es otro proyecto (Cloudflare Stream o Mux).
 */
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;

/**
 * Normaliza a JPEG una imagen recién elegida con expo-image-picker.
 *
 * POR QUÉ EXISTE (bug real, reportado por usuarios el 26-jul-2026): el iPhone
 * guarda las fotos en **HEIC**, y `asset.mimeType` las declara como
 * `image/heic`. Todos nuestros buckets tienen `allowed_mime_types` limitado a
 * jpeg/png/webp, así que Storage responde
 * `mime type image/heic is not supported` y la subida falla. Verificado contra
 * producción: `image/heic`, `image/heif` y `application/octet-stream` son
 * RECHAZADOS por `avatars` y por `fomo-media`.
 *
 * Por eso cambiar la foto de perfil no funcionaba desde el iPhone mientras que
 * publicar en FOMO sí: `publicar.tsx` ya pasaba por el manipulador (aunque solo
 * cuando la foto medía más de 1440 px, otro agujero que esto cierra).
 *
 * Convertimos siempre, no solo al reescalar: una foto HEIC estrecha también hay
 * que transcodificarla. Si el manipulador falla devolvemos el mime ORIGINAL a
 * propósito, para que la subida dé un error claro en vez de guardar un HEIC
 * etiquetado como JPEG (Storage se fía del contentType y no lo inspecciona; el
 * navegador después no sabría pintarlo).
 */
export async function normalizeImage(
  uri: string,
  width?: number | null,
  maxWidth: number = MAX_IMAGE_WIDTH,
  fallbackMime: string = 'image/jpeg',
): Promise<{ uri: string; mime: string }> {
  try {
    const ops = (width ?? 0) > maxWidth ? [{ resize: { width: maxWidth } }] : [];
    const out = await ImageManipulator.manipulateAsync(uri, ops, {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: out.uri, mime: 'image/jpeg' };
  } catch {
    return { uri, mime: fallbackMime };
  }
}

/**
 * Elegir foto + normalizar + subir, que es lo que quieren todas las pantallas.
 * Centralizado para que ninguna vuelva a pasar `asset.mimeType` en crudo.
 */
export async function uploadPickedImage(
  bucket: 'fomo-media' | 'ligar-media' | 'community-media' | 'chat-media' | 'avatars',
  folder: string,
  asset: { uri: string; width?: number | null; mimeType?: string | null },
  maxBytes: number,
  request?: OwnedRequest,
): Promise<UploadResult> {
  request?.check();
  const img = await normalizeImage(asset.uri, asset.width, MAX_IMAGE_WIDTH, asset.mimeType ?? 'image/jpeg');
  request?.check();
  return uploadMedia(bucket, folder, img.uri, img.mime, maxBytes, request);
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  // OJO: 'audio/m4a' NO es un MIME válido y NINGÚN bucket lo admite (el bueno
  // es 'audio/mp4'). Se deja aquí solo por si algún asset lo declara así, pero
  // nunca debe pasarse como contentType a uploadMedia.
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

function randomName(contentType: string): string {
  const ext = EXT_BY_MIME[contentType] ?? contentType.split('/')[1] ?? 'bin';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

export type UploadResult =
  | { ok: true; path: string; publicUrl: string }
  | { ok: false; message: string };

/**
 * Sube un fichero local (uri de expo-image-picker / expo-audio) al bucket.
 * `folder` es la primera carpeta del path: el uid del usuario en fomo-media y
 * ligar-media, o el id de la conversación en chat-media.
 * `publicUrl` solo es servible en buckets públicos (fomo/ligar); para
 * chat-media usa el `path` con createSignedUrl.
 */
export async function uploadMedia(
  bucket: 'fomo-media' | 'ligar-media' | 'community-media' | 'chat-media' | 'avatars',
  folder: string,
  uri: string,
  contentType: string,
  maxBytes: number,
  request?: OwnedRequest,
): Promise<UploadResult> {
  if (bucket === 'fomo-media' || bucket === 'ligar-media' || bucket === 'community-media') return uploadPrivateSocialFile(uri,contentType,maxBytes,undefined,request?.signal,folder);
  try {
    request?.check();
    const resp = await fetch(uri);
    const blob = await resp.arrayBuffer();
    request?.check();
    if (blob.byteLength > maxBytes) {
      const mb = Math.round(maxBytes / 1024 / 1024);
      return { ok: false, message: `El archivo supera el límite de ${mb} MB.` };
    }
    const path = `${folder}/${randomName(contentType)}`;
    try {
      // Reintento con backoff (mejora 32): una subida que falla por red o por
      // un 5xx puntual del storage se reintenta sola antes de rendirse.
      await withRetry(
        async () => {
          request?.check();
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(path, blob, { contentType, upsert: false, ...(request ? { headers: { Authorization: request.authorization } } : {}) });
          request?.check();
          if (uploadError) throw uploadError;
        },
        { maxAttempts: 3, shouldRetry: isRetryableError },
      );
    } catch (err) {
      // Fail-soft: agotados los reintentos, informamos sin romper la app. El
      // rechazo por tipo de archivo se traduce, porque el mensaje crudo de
      // Storage ("mime type image/heic is not supported") no le dice nada a
      // quien solo quería cambiarse la foto.
      const raw = (err as { message?: string } | null)?.message ?? '';
      if (/mime type/i.test(raw)) {
        // El texto se elige por el TIPO de fichero que se estaba subiendo. Antes
        // era siempre "imagen" (se escribió para el bug del HEIC), así que al
        // fallar una nota de voz salía "Ese formato de imagen no es compatible.
        // Prueba con otra foto", que no tenía ningún sentido.
        const kind = contentType.split('/')[0];
        return {
          ok: false,
          message:
            kind === 'audio' ? 'Ese formato de audio no es compatible. Vuelve a grabar la nota de voz.'
            : kind === 'video' ? 'Ese formato de vídeo no es compatible. Prueba con otro vídeo.'
            : 'Ese formato de imagen no es compatible. Prueba con otra foto.',
        };
      }
      return { ok: false, message: 'No se pudo subir el archivo.' };
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { ok: true, path, publicUrl: data.publicUrl };
  } catch {
    return { ok: false, message: 'Sin conexión al subir el archivo.' };
  }
}

/**
 * Sube un fichero GRANDE (vídeo) sin cargarlo en memoria.
 *
 * POR QUÉ NO SIRVE uploadMedia: hace `fetch(uri) → arrayBuffer()`, es decir, se
 * trae el fichero ENTERO a la memoria de JavaScript antes de subirlo. Con los
 * 50 MB de antes colaba; con vídeos de cientos de MB la app se queda sin
 * memoria y se cierra sola, sin ningún mensaje.
 *
 * Aquí se usa XMLHttpRequest con FormData y `{ uri }`: React Native detecta que
 * es un fichero local y lo lee del disco a trozos mientras lo envía, así que la
 * memoria no crece. De paso da progreso real, que en una subida de varios
 * minutos es la diferencia entre "está subiendo" y "se ha colgado".
 *
 * No usa el SDK de Supabase a propósito (no expone streaming), sino el endpoint
 * REST de Storage, que acepta multipart/form-data.
 *
 * `signal` (opcional) permite cancelar desde fuera (botón "Cancelar subida"):
 * aborta el XHR y la promesa resuelve con "Subida cancelada". Sin una vía de
 * cancelación, una subida colgada encerraba al usuario en la vista previa.
 */
export async function uploadLargeFile(
  bucket: 'fomo-media' | 'ligar-media' | 'chat-media' | 'avatars',
  folder: string,
  uri: string,
  contentType: string,
  maxBytes: number,
  onProgress?: (fraccion: number) => void,
  signal?: AbortSignal,
  request?: OwnedRequest,
): Promise<UploadResult> {
  request?.check();
  signal = request?.signal ?? signal;
  if (bucket === 'fomo-media' || bucket === 'ligar-media') return uploadPrivateSocialFile(uri,contentType,maxBytes,onProgress,signal,folder);
  if (signal?.aborted) return { ok: false, message: 'Subida cancelada.' };
  const authorization = request?.authorization ?? await (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : null;
  })();
  request?.check();
  if (!authorization) return { ok: false, message: 'Inicia sesión para subir el vídeo.' };
  if (signal?.aborted) return { ok: false, message: 'Subida cancelada.' };

  const path = `${folder}/${randomName(contentType)}`;
  const destino = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

  return new Promise<UploadResult>((complete) => {
    let onAbort: (() => void) | undefined;
    const resolve = (result: UploadResult) => {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      try { request?.check(); } catch { complete({ ok: false, message: 'La sesión ha cambiado. Vuelve a entrar.' }); return; }
      complete(result);
    };
    try {
      request?.check();
      const form = new FormData();
      // El tipado de FormData en RN no contempla el objeto {uri,name,type} que
      // sí entiende su capa nativa, de ahí el cast.
      form.append('file', {
        uri,
        name: path.split('/').pop() ?? 'video.mp4',
        type: contentType,
      } as unknown as Blob);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', destino);
      xhr.setRequestHeader('Authorization', authorization);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('x-upsert', 'false');
      // Content-Type NO se toca: lo pone XHR con el boundary del multipart.

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (!signal?.aborted && e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          resolve({ ok: true, path, publicUrl: data.publicUrl });
          return;
        }
        // Storage devuelve 413 cuando el fichero supera el tope del bucket o el
        // del proyecto (Supabase → Storage → Settings). Se distingue del resto
        // porque es el único que el usuario puede entender y evitar.
        if (xhr.status === 413) {
          const mb = Math.round(maxBytes / 1024 / 1024);
          resolve({ ok: false, message: `El vídeo es demasiado grande (el máximo son ${mb} MB).` });
          return;
        }
        resolve({ ok: false, message: `No se pudo subir el vídeo (error ${xhr.status}).` });
      };
      xhr.onerror = () => resolve({ ok: false, message: 'Se cortó la conexión al subir el vídeo.' });
      xhr.onabort = () => resolve({ ok: false, message: 'Subida cancelada.' });
      // Tope de INACTIVIDAD, no de duración total: en React Native `timeout` se
      // traduce a NSURLRequest.timeoutInterval (iOS) y a los read/write timeout
      // de OkHttp (Android), que se reinician con cada paquete. Una subida de
      // 500 MB que avanza no lo dispara; una que se queda muda 90 s (red caída
      // a medias) sí, en vez de dejar "Subiendo…" para siempre.
      xhr.timeout = UPLOAD_TIMEOUT_MS;
      xhr.ontimeout = () => resolve({
        ok: false,
        message: 'La subida se quedó parada. Revisa tu conexión e inténtalo de nuevo.',
      });
      onAbort = () => xhr.abort();
      signal?.addEventListener('abort', onAbort);
      if (signal?.aborted) { resolve({ ok: false, message: 'Subida cancelada.' }); return; }
      request?.check();
      xhr.send(form);
    } catch {
      resolve({ ok: false, message: 'No se pudo subir el vídeo.' });
    }
  });
}

/** URL firmada (1 h) para media privada de chats. */
export async function signedChatMediaUrl(path: string, request?: OwnedRequest): Promise<string | null> {
  if (request) {
    request.check();
    const objectPath = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetchConTimeout(`${SUPABASE_URL}/storage/v1/object/sign/chat-media/${objectPath}`, {
      method: 'POST', headers: { Authorization: request.authorization, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 }), signal: request.signal,
    });
    request.check();
    if (!response.ok) return null;
    const data = await response.json() as { signedURL?: string };
    request.check();
    if (!data.signedURL?.startsWith('/object/sign/chat-media/')) return null;
    return encodeURI(`${SUPABASE_URL}/storage/v1${data.signedURL}`);
  }
  const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
