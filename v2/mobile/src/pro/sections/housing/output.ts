import { Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { toast } from "@/lib/toast";

/**
 * Sacar papeles de Franky Pro en el móvil: la web abre el documento para
 * imprimir o descarga el CSV; aquí se guarda en un fichero temporal y se abre
 * la hoja de compartir (Archivos, correo, WhatsApp, imprimir).
 */

const MIME = {
  csv: { mimeType: "text/csv", UTI: "public.comma-separated-values-text" },
  html: { mimeType: "text/html", UTI: "public.html" },
} as const;

/** Nombre de fichero sin tildes ni espacios. */
export function slugFile(...parts: string[]) {
  return parts
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Comparte un documento como fichero. Si el sistema no deja compartir
 * ficheros, se comparte el texto tal cual para no perderlo.
 */
export async function shareDocument(content: string, name: string, kind: keyof typeof MIME, title: string) {
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error("sin compartir");
    const file = new File(Paths.cache, `${name}.${kind}`);
    if (file.exists) file.delete();
    file.create();
    // La marca BOM hace que Excel lea el CSV como UTF-8.
    file.write(kind === "csv" ? `﻿${content}` : content);
    await Sharing.shareAsync(file.uri, { ...MIME[kind], dialogTitle: title });
  } catch {
    try {
      await Share.share({ message: content, title });
    } catch {
      toast("No se ha podido compartir", { kind: "error", body: "Inténtalo de nuevo en un momento." });
    }
  }
}
