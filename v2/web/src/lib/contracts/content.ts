import { createHash } from "node:crypto";
import type { ContractAnswers } from "./questions";

/**
 * Hash determinista del contenido acordado de un contrato. Se calcula en
 * servidor al ENVIAR (send_contract) y cada firma guarda este mismo valor, de
 * modo que cualquiera puede verificar que todas las partes firmaron exactamente
 * las mismas respuestas. Las claves se ordenan para que el hash no dependa del
 * orden de inserción del JSON.
 */
export function contentSha256(answers: ContractAnswers): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(answers).sort()) {
    const v = answers[key];
    if (v !== null && v !== undefined && v !== "") sorted[key] = v;
  }
  return createHash("sha256").update(JSON.stringify(sorted), "utf8").digest("hex");
}
