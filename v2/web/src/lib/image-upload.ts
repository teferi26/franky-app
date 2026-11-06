/**
 * Preparación de imágenes ANTES de subirlas a Supabase Storage.
 *
 * El problema real que resuelve (reportado por inmobiliarias el 05-ago-2026:
 * "no me deja publicar pisos"): las fotos hechas con un iPhone son HEIC, y los
 * buckets solo aceptan jpeg/png/webp/gif. Subirlas devolvía un 415
 * `mime type image/heic is not supported`, la foto no se añadía y, como el
 * alta de piso exige al menos una foto, el botón de publicar no se activaba
 * nunca. Pasaba en TODA la web (avatar, FOMO, Crush, eventos, chat), no solo
 * en el alta de pisos.
 *
 * Qué hace: reconvierte la imagen a JPEG en el navegador antes de subirla.
 * De paso la redimensiona, lo que ahorra muchísimo tiempo a quien sube 20
 * fotos de 5 MB desde el móvil, y quita los metadatos EXIF (que llevan la
 * ubicación GPS de la casa).
 *
 * Regla de oro heredada del incidente del móvil: NUNCA pasar `file.type` en
 * crudo al Storage. Aquí el contentType siempre sale de esta función.
 */

/** Tipos que aceptan los buckets de imagen del proyecto. */
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Tipos de vídeo que acepta el bucket business-photos. */
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"];

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/**
 * Tipo real del archivo. Algunos navegadores (y iOS al compartir desde Ficheros)
 * mandan `type` vacío, así que se cae a la extensión.
 */
export function detectMime(file: File): string {
  if (file.type) return file.type.toLowerCase();
  return EXT_TO_MIME[extOf(file.name)] ?? "";
}

export function isVideoFile(file: File): boolean {
  return detectMime(file).startsWith("video/");
}

export function isImageFile(file: File): boolean {
  const m = detectMime(file);
  return m.startsWith("image/") || m === "";
}

export type PreparedUpload =
  | { ok: true; blob: Blob; contentType: string; ext: string; width?: number; height?: number }
  | { ok: false; message: string };

/**
 * Por debajo de esto una foto se ve borrosa en la ficha del piso, que la
 * muestra a más de 1000 px de ancho. No se bloquea la subida (mejor una foto
 * mala que ninguna), pero al propietario se le avisa.
 */
export const MIN_GOOD_IMAGE_PX = 800;

/** Decodifica el archivo a un bitmap respetando la orientación EXIF. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari antiguo no acepta las opciones: se reintenta sin ellas.
      return await createImageBitmap(file);
    }
  }
  // Último recurso: <img>, que también aplica la orientación EXIF.
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } finally {
    // El objeto ya está decodificado en memoria; liberar la URL es seguro.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Convierte cualquier imagen a JPEG apta para el Storage.
 *
 * Los vídeos y los GIF (perderían la animación) pasan tal cual, solo con el
 * contentType normalizado.
 */
export async function prepareImageForUpload(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<PreparedUpload> {
  const maxDimension = opts.maxDimension ?? 2560;
  const quality = opts.quality ?? 0.85;
  const mime = detectMime(file);

  if (mime.startsWith("video/")) {
    if (!ALLOWED_VIDEO_MIME.includes(mime)) {
      return { ok: false, message: "Ese formato de vídeo no vale. Sube un MP4, MOV o WEBM." };
    }
    return { ok: true, blob: file, contentType: mime, ext: extOf(file.name) || "mp4" };
  }

  // El GIF se sube tal cual: reconvertirlo lo dejaría en una foto fija.
  if (mime === "image/gif") {
    return { ok: true, blob: file, contentType: "image/gif", ext: "gif" };
  }

  try {
    const source = await decode(file);
    const sw = "width" in source ? source.width : 0;
    const sh = "height" in source ? source.height : 0;
    if (!sw || !sh) throw new Error("sin dimensiones");

    const escala = Math.min(1, maxDimension / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * escala));
    const h = Math.max(1, Math.round(sh * escala));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin contexto 2d");
    // Fondo blanco: si el PNG era transparente, el JPEG saldría con fondo negro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
    if ("close" in source && typeof source.close === "function") source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("toBlob vacío");

    return { ok: true, blob, contentType: "image/jpeg", ext: "jpg", width: w, height: h };
  } catch {
    // No se ha podido decodificar. Si el formato ya era válido, se sube tal
    // cual (mejor eso que perder la foto); si no, hay que decirle al usuario
    // qué hacer, porque el error crudo del Storage no le dice nada.
    if (ALLOWED_IMAGE_MIME.includes(mime)) {
      return { ok: true, blob: file, contentType: mime, ext: extOf(file.name) || "jpg" };
    }
    if (mime === "image/heic" || mime === "image/heif") {
      return {
        ok: false,
        message:
          "Esta foto está en formato HEIC (el de la cámara del iPhone) y tu navegador no puede convertirla. " +
          "Ábrela desde otro dispositivo, o en el iPhone entra en Ajustes → Cámara → Formatos y elige 'Más compatible'.",
      };
    }
    return { ok: false, message: "No hemos podido leer esta imagen. Prueba con un JPG o un PNG." };
  }
}
