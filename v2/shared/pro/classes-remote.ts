import { z } from "zod";
import type { ProData } from "./types";
import type { ProClassesExtras } from "./classes-types";
import { emptyClassExtras, extrasOf } from "./classes-care";
import { ProRemoteError, type ProRpcClient } from "./remote-contracts";

/**
 * Guardar en el servidor los datos propios del motor de clases
 * (`ProData.classExtras`). El servidor guarda un documento por negocio donde
 * cada lista es un objeto por id; aquí se traduce en los dos sentidos y se
 * calcula el cambio mínimo, fila a fila, para que dos personas del equipo que
 * tocan cosas distintas a la vez no se pisen.
 *
 * RPC: `pro_get_class_extras` y `pro_patch_class_extras`
 * (supabase/migrations/20260927100400_pro_classes_a.sql).
 */

/** Claves que son mapas por id en el propio tipo. */
const MAP_KEYS = ["members", "sessions", "types", "roomBookings", "staff", "plans"] as const;

/** Listas de filas: cómo se identifica cada fila y cómo se ordenan al leerlas. */
const LIST_KEYS = {
  charges: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(a.dueOn, b.dueOn) },
  waitOffers: {
    id: (r: Row) => str(r.id),
    order: (a: Row, b: Row) => cmp(a.offeredAt, b.offeredAt),
  },
  trials: { id: (r: Row) => str(r.bookingId), order: (a: Row, b: Row) => cmp(a.at, b.at) },
  leads: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(b.createdAt, a.createdAt) },
  checkins: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(a.at, b.at) },
  challenges: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(a.startsOn, b.startsOn) },
  records: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(a.on, b.on) },
  referrals: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(b.at, a.at) },
  roomResults: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(a.on, b.on) },
  vouchers: {
    id: (r: Row) => str(r.id),
    order: (a: Row, b: Row) => cmp(b.soldOn, a.soldOn) || cmp(b.code, a.code),
  },
  examResults: {
    id: (r: Row) => `${str(r.memberId)}:${str(r.classTypeId)}`,
    order: (a: Row, b: Row) => cmp(a.on, b.on),
  },
  grades: { id: (r: Row) => str(r.id), order: (a: Row, b: Row) => cmp(a.on, b.on) },
} as const;

type Row = Record<string, unknown>;
type ListKey = keyof typeof LIST_KEYS;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cmp(a: unknown, b: unknown): number {
  return str(a).localeCompare(str(b));
}

function isObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isListKey(key: string): key is ListKey {
  return key in LIST_KEYS;
}

function isMapKey(key: string): boolean {
  return (MAP_KEYS as readonly string[]).includes(key);
}

/** JSON estable: el mismo contenido da el mismo texto aunque cambie el orden. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/* ------------------------------------------------------------------ */
/* Traducción al formato del servidor y vuelta                          */
/* ------------------------------------------------------------------ */

/** Documento del servidor: las listas pasan a objetos por id. */
export function classExtrasToWire(x: ProClassesExtras): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(x)) {
    if (value === undefined) continue;
    if (isListKey(key) && Array.isArray(value)) {
      const rows: Record<string, unknown> = {};
      for (const row of value as Row[]) {
        const id = LIST_KEYS[key].id(row);
        if (id && id !== ":") rows[id] = row;
      }
      out[key] = rows;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Del documento del servidor a los extras que usan las pantallas. */
export function classExtrasFromWire(doc: Record<string, unknown>): ProClassesExtras {
  const base = emptyClassExtras() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(doc)) {
    if (value === null || value === undefined) continue;
    if (isListKey(key)) {
      if (!isObject(value)) continue;
      out[key] = Object.values(value).filter(isObject).sort(LIST_KEYS[key].order);
    } else if (isMapKey(key)) {
      if (isObject(value)) out[key] = value;
    } else if (key in base) {
      // Valores sueltos conocidos: solo si el tipo coincide con el de fábrica.
      if (typeof value === typeof base[key] && isObject(value) === isObject(base[key]))
        out[key] = value;
    } else if (
      ["referralReward", "voucherSeq", "seasonDone", "invoiceSeq", "recoveryRules"].includes(key)
    ) {
      out[key] = value;
    }
  }
  return out as unknown as ProClassesExtras;
}

/* ------------------------------------------------------------------ */
/* Cambio mínimo                                                        */
/* ------------------------------------------------------------------ */

export type ClassExtrasPatch = { k: string; id?: string; v: unknown };

/**
 * Lo que ha cambiado entre dos versiones de los extras, fila a fila en las
 * listas y mapas y entero en los valores sueltos. `v: null` borra.
 */
export function diffClassExtras(
  before: ProClassesExtras,
  after: ProClassesExtras,
): ClassExtrasPatch[] {
  const a = classExtrasToWire(before);
  const b = classExtrasToWire(after);
  const patches: ClassExtrasPatch[] = [];
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    const prev = a[key];
    const next = b[key];
    if (stable(prev) === stable(next)) continue;
    if ((isListKey(key) || isMapKey(key)) && isObject(prev ?? {}) && isObject(next ?? {})) {
      const p = (prev ?? {}) as Row;
      const n = (next ?? {}) as Row;
      const ids = [...new Set([...Object.keys(p), ...Object.keys(n)])].sort();
      for (const id of ids) {
        if (stable(p[id]) === stable(n[id])) continue;
        patches.push({ k: key, id, v: n[id] === undefined ? null : JSON.parse(stable(n[id])) });
      }
    } else {
      patches.push({ k: key, v: next === undefined ? null : JSON.parse(stable(next)) });
    }
  }
  return patches;
}

/** ¿Solo han cambiado los extras? Lo demás va por sus propias RPC. */
export function onlyClassExtrasChanged(before: ProData, after: ProData): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("classExtras");
  const record = (d: ProData) => d as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (stable(record(before)[key]) !== stable(record(after)[key])) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Órdenes para el servidor                                            */
/* ------------------------------------------------------------------ */

const PEOPLE = ["content.manage", "attendees.manage"];
const MANAGE = ["content.manage"];
const FINANCE = ["finance.manage"];

/**
 * Acciones de las pantallas del motor que solo cambian los extras. La
 * interfaz orienta con estos permisos; el servidor vuelve a comprobarlos por
 * cada clave que se escribe.
 */
export const CLASS_EXTRAS_COMMANDS: Record<string, string[]> = {
  "class.board": PEOPLE,
  "class.language": PEOPLE,
  "class.exam": MANAGE,
  "member.contacted": PEOPLE,
  "member.touch": PEOPLE,
  "member.health": PEOPLE,
  "member.next_course": PEOPLE,
  "member.winback": PEOPLE,
  "member.record": PEOPLE,
  "member.cheer": PEOPLE,
  "charge.remind": FINANCE,
  "room.remind": PEOPLE,
  "room.review": PEOPLE,
  "room.result": PEOPLE,
  "room.language": PEOPLE,
  "room.minors": PEOPLE,
  "room.birthday": PEOPLE,
  "room.notes": PEOPLE,
  "room.late": PEOPLE,
  "room.mode": MANAGE,
  "room.setup": MANAGE,
  "policy.save": MANAGE,
  "staff.skills": MANAGE,
  "lead.create": PEOPLE,
  "lead.update": PEOPLE,
  "lead.move": PEOPLE,
  "referral.create": PEOPLE,
  "referral.update": PEOPLE,
  "referral.reward": PEOPLE,
  "referral.prize": MANAGE,
  "challenge.create": MANAGE,
  "challenge.bonus": MANAGE,
  "challenge.remove": MANAGE,
  "voucher.sell": PEOPLE,
  "voucher.redeem": PEOPLE,
  "exam.result": PEOPLE,
  "season.toggle": MANAGE,
  // Tercera ola: academias (notas, niveles, continuidad, material, matrícula).
  "grade.add": PEOPLE,
  "grade.remove": PEOPLE,
  "member.level": PEOPLE,
  "member.limit": PEOPLE,
  "member.continuity": PEOPLE,
  "class.next": MANAGE,
  "class.level": MANAGE,
  "class.material": MANAGE,
  "plan.enrollment": MANAGE,
  "recovery.rules": MANAGE,
  // Ocio: cumpleaños, material de talleres y facturas de empresa.
  "room.extras": PEOPLE,
  "room.company": PEOPLE,
  "room.greeted": PEOPLE,
  "room.invoice": FINANCE,
  "material.setup": MANAGE,
  "material.stock": MANAGE,
};

export type ClassExtrasCommand = {
  rpc: string;
  args: Record<string, unknown>;
  idempotent: boolean;
};

/**
 * Traduce un cambio de las pantallas a la RPC de parches. Devuelve null si el
 * cambio toca algo más que los extras o no cambia nada: esa acción no se
 * puede guardar así.
 */
export function planClassExtrasCommand(before: ProData, after: ProData): ClassExtrasCommand | null {
  if (before.space.id !== after.space.id) return null;
  if (!onlyClassExtrasChanged(before, after)) return null;
  const patches = diffClassExtras(extrasOf(before), extrasOf(after));
  if (!patches.length || patches.length > 200) return null;
  return {
    rpc: "pro_patch_class_extras",
    args: { p_organization_id: before.space.id, p_data: { patches } },
    idempotent: true,
  };
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

const responseSchema = z.object({
  organization_id: z.string().min(1),
  version: z.number().int().nonnegative(),
  doc: z.record(z.string(), z.unknown()),
});

export function parseClassExtras(value: unknown, organizationId: string): ProClassesExtras {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success || parsed.data.organization_id !== organizationId) {
    throw new ProRemoteError(
      "Respuesta incompleta de pro_get_class_extras.",
      "pro_invalid_response",
    );
  }
  return classExtrasFromWire(parsed.data.doc);
}

/** La RPC todavía no existe en este servidor (migración sin aplicar). */
function notInstalled(error: { message: string; code?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /does not exist|schema cache|could not find the function/i.test(error.message)
  );
}

/**
 * Extras del negocio. Si el servidor aún no tiene la migración, devuelve
 * null: las pantallas lo tratan como "todavía no hay nada" en vez de romperse.
 */
export async function loadClassExtras(
  client: ProRpcClient,
  organizationId: string,
): Promise<ProClassesExtras | null> {
  const result = await client.rpc("pro_get_class_extras", {
    p_organization_id: organizationId,
  });
  if (result.error) {
    if (notInstalled(result.error)) return null;
    throw new ProRemoteError(result.error.message, result.error.code);
  }
  return parseClassExtras(result.data, organizationId);
}
