import { z } from "zod";
import type { ProData } from "./types";
import type { ProCourtsData } from "./courts-types";
import { emptyCourtsData } from "./courts-base";
import { ProActionError, type ProCommand } from "./remote-actions";
import { ProRemoteError, type ProRpcClient } from "./remote-contracts";

/**
 * Datos propios del motor de pistas en la cuenta real.
 *
 * Turnos fijos, bonos, normas, americanas, liga, escuela, puestos, taquillas y
 * cierres de caja se guardan como un único documento por negocio
 * (`pro_courts_state`, migración 20260927100500_pro_courts_a.sql). Las
 * reservas y los cobros siguen en sus tablas y RPC de siempre: este documento
 * nunca los toca.
 *
 * Si la RPC aún no existe en la base de datos, la lectura devuelve `null` y
 * las pantallas enseñan su estado vacío en vez de romperse.
 */

/** Tope del documento: lo mismo que acepta el servidor. */
export const COURTS_STATE_MAX_BYTES = 900_000;

const stateSchema = z.object({
  organization_id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()).nullable(),
});

/** Códigos con los que PostgREST dice que la función no existe todavía. */
function missingFunction(error: { message: string; code?: string }) {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /does not exist|schema cache|Could not find the function/i.test(
      error.message,
    )
  );
}

/**
 * Convierte la respuesta del servidor en `ProCourtsData` completo. Los campos
 * que falten (un documento guardado por una versión anterior) toman su valor
 * por defecto, igual que hace `courtsOps` en la demo.
 */
export function parseProCourtsState(
  value: unknown,
  organizationId: string,
): ProCourtsData {
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success || parsed.data.organization_id !== organizationId) {
    throw new ProRemoteError(
      "Respuesta incompleta de pro_get_courts_state.",
      "pro_invalid_response",
    );
  }
  const base = emptyCourtsData();
  const stored = (parsed.data.data ?? {}) as Partial<ProCourtsData>;
  return {
    ...base,
    ...stored,
    policy: { ...base.policy, ...(stored.policy ?? {}) },
    revision: parsed.data.revision,
  };
}

export async function loadProCourtsState(
  client: ProRpcClient,
  organizationId: string,
): Promise<ProCourtsData | null> {
  const result = await client.rpc("pro_get_courts_state", {
    p_organization_id: organizationId,
  });
  if (result.error) {
    if (missingFunction(result.error)) return null;
    throw new ProRemoteError(result.error.message, result.error.code);
  }
  return parseProCourtsState(result.data, organizationId);
}

/**
 * Etiquetas de `update` que solo cambian el documento del motor. Las de
 * reservas (`court.create`, `court.cancelled`...) se traducen a las RPC de
 * reservas en `remote-actions.ts` y no pasan por aquí.
 */
export function isCourtsStateLabel(
  label: string,
  bookingCommands: Record<string, string>,
): boolean {
  return label.startsWith("court.") && !bookingCommands[label];
}

/** Partes de `ProData` que este guardado no puede cambiar. */
const UNTOUCHED: (keyof ProData)[] = [
  "bookings",
  "payments",
  "clients",
  "members",
  "resources",
  "openMatches",
];

function withoutRevision(state: ProCourtsData | undefined) {
  if (!state) return null;
  const copy: Partial<ProCourtsData> = { ...state };
  delete copy.revision;
  return copy;
}

export function planProCourtsStateCommand(
  label: string,
  before: ProData,
  after: ProData,
): ProCommand {
  const org = before.space.id;
  // Un cambio que además mueve reservas o cobros no se puede guardar de una
  // vez: el documento se guardaría y la reserva no, y el club vería datos que
  // no cuadran.
  const mixed = UNTOUCHED.some(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  if (mixed) {
    throw new ProActionError(
      "Este cambio mueve reservas o cobros. Hazlo desde la reserva.",
    );
  }
  const next = withoutRevision(after.courts);
  if (!next) throw new ProActionError("Actualiza la pantalla y vuelve a probar.");
  if (
    JSON.stringify(withoutRevision(before.courts)) === JSON.stringify(next)
  ) {
    throw new ProActionError("No hay cambios que guardar.");
  }
  if (JSON.stringify(next).length > COURTS_STATE_MAX_BYTES) {
    throw new ProActionError(
      "Hay demasiados datos guardados. Archiva americanas o turnos antiguos.",
    );
  }
  return {
    rpc: "pro_save_courts_state",
    args: {
      p_organization_id: org,
      p_data: {
        label,
        expected_revision: before.courts?.revision ?? 0,
        state: next,
      },
    },
    idempotent: true,
  };
}
