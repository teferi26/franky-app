import type { ProData } from "./types";
import type {
  CommunityHandover,
  CommunityHandoverItem,
  ProCommunityOps,
} from "./community-types";
import { communityOps } from "./community";
import { addDays, localDate } from "./format";

/**
 * Guía del relevo de junta (motor "community").
 *
 * Dentro de Franky el relevo es un botón: la nueva junta recibe el acceso y
 * todo se queda en la asociación. Fuera quedan cosas que cada año se olvidan:
 * las firmas del banco, el registro, las contraseñas de las redes, las llaves.
 * Esta lista las reparte, apunta quién hizo cada una y cuándo, y se queda en la
 * asociación para la junta siguiente.
 */

/** Paso que Franky marca solo al traspasar la junta. */
export const HANDOVER_FRANKY_ID = "franky";

type Template = Pick<CommunityHandoverItem, "id" | "label" | "detail">;

export const HANDOVER_TEMPLATE: Template[] = [
  {
    id: HANDOVER_FRANKY_ID,
    label: "Accesos de Franky",
    detail: "Se marca solo al traspasar la junta aquí: la nueva entra y la saliente sigue como socia.",
  },
  {
    id: "banco",
    label: "Firmas del banco",
    detail: "Cambiar quién puede firmar y operar en la cuenta. Suele pedir el acta del relevo.",
  },
  {
    id: "registro_uni",
    label: "Registro de la universidad",
    detail: "Comunicar la nueva junta con el certificado que sale en Papeles del registro.",
  },
  {
    id: "registro_asoc",
    label: "Registro de asociaciones",
    detail: "Comunicar el cambio de junta al registro donde está inscrita la asociación.",
  },
  {
    id: "hacienda",
    label: "Hacienda y certificado digital",
    detail: "Cambiar la persona representante si la asociación tiene certificado o presenta modelos.",
  },
  {
    id: "redes",
    label: "Redes sociales",
    detail: "Contraseñas nuevas y verificación en dos pasos con un correo de la asociación.",
  },
  {
    id: "correo",
    label: "Correo y dominio",
    detail: "Pasar el correo de la asociación a la nueva junta y mirar cuándo vence el dominio.",
  },
  {
    id: "archivo",
    label: "Documentos al archivo",
    detail: "Subir aquí lo que siga en Drives o móviles personales: estatutos, actas, facturas.",
  },
  {
    id: "llaves",
    label: "Llaves y material",
    detail: "Llaves del local, taquilla, proyector y lo prestado. Que quede apuntado quién tiene cada cosa.",
  },
  {
    id: "patrocinadores",
    label: "Presentar a los patrocinadores",
    detail: "Un mensaje o una visita con la nueva junta para que sigan el curso que viene.",
  },
  {
    id: "consejo",
    label: "Consejo de Estudiantes",
    detail: "Presentar a la nueva junta y pasarle las fechas de las ayudas.",
  },
];

/** Relevo empezado hoy con todos los pasos por hacer. */
export function newHandover(today: string): CommunityHandover {
  return {
    startedAt: today,
    items: HANDOVER_TEMPLATE.map((t) => ({ ...t })),
  };
}

export function startHandover(ops: ProCommunityOps, today: string): ProCommunityOps {
  return { ...ops, handover: newHandover(today) };
}

function patchItem(
  ops: ProCommunityOps,
  id: string,
  fn: (item: CommunityHandoverItem) => CommunityHandoverItem,
): ProCommunityOps {
  if (!ops.handover) return ops;
  return {
    ...ops,
    handover: {
      ...ops.handover,
      items: ops.handover.items.map((i) => (i.id === id ? fn(i) : i)),
    },
  };
}

/** Marca o desmarca un paso. Al marcarlo queda quién lo hizo y cuándo. */
export function toggleHandoverItem(
  ops: ProCommunityOps,
  id: string,
  by: string,
  nowIso: string,
): ProCommunityOps {
  return patchItem(ops, id, (i) =>
    i.doneAt
      ? { ...i, doneAt: undefined, doneBy: undefined }
      : { ...i, doneAt: nowIso, doneBy: i.owner || by },
  );
}

export function setHandoverOwner(
  ops: ProCommunityOps,
  id: string,
  owner: string,
): ProCommunityOps {
  return patchItem(ops, id, (i) => ({ ...i, owner: owner.trim() || undefined }));
}

/**
 * Al traspasar la junta en Franky: si no había guía, se empieza; el paso de
 * accesos queda hecho con la fecha del traspaso.
 */
export function markFrankyAccessDone(
  ops: ProCommunityOps,
  by: string,
  nowIso: string,
): ProCommunityOps {
  // Una guía empezada hace poco (antes del traspaso) se sigue usando; si es la
  // del relevo del año pasado, se empieza una nueva.
  const today = localDate(nowIso);
  const recent = ops.handover && ops.handover.startedAt >= addDays(today, -HANDOVER_FOLLOW_DAYS);
  const base = recent ? ops : startHandover(ops, today);
  return patchItem(base, HANDOVER_FRANKY_ID, (i) =>
    i.doneAt ? i : { ...i, doneAt: nowIso, doneBy: by },
  );
}

export type HandoverProgress = {
  done: number;
  total: number;
  pending: CommunityHandoverItem[];
  complete: boolean;
};

export function handoverProgress(handover?: CommunityHandover): HandoverProgress {
  const items = handover?.items ?? [];
  const pending = items.filter((i) => !i.doneAt);
  return {
    done: items.length - pending.length,
    total: items.length,
    pending,
    complete: items.length > 0 && pending.length === 0,
  };
}

/** Días antes del fin del mandato en los que conviene empezar el relevo. */
export const HANDOVER_LEAD_DAYS = 60;
/** Días tras el relevo en los que la guía sigue a la vista si quedan pasos. */
export const HANDOVER_FOLLOW_DAYS = 120;

export type HandoverStage = "idle" | "soon" | "open" | "complete";

/**
 * En qué momento está el relevo:
 * - "soon": el mandato acaba pronto o hay un relevo programado y aún no se ha empezado.
 * - "open": empezado y con pasos pendientes (reciente).
 * - "complete": todo hecho.
 * - "idle": nada que hacer ahora.
 */
export function handoverStage(data: ProData, now: Date): HandoverStage {
  const ops = communityOps(data);
  const today = localDate(now);
  const progress = handoverProgress(ops.handover);
  const until = data.board[0]?.until;
  const endsSoon = Boolean(until && until <= addDays(today, HANDOVER_LEAD_DAYS));
  const started = ops.handover?.startedAt;
  const recent = Boolean(started && started >= addDays(today, -HANDOVER_FOLLOW_DAYS));

  if (started && recent && !progress.complete) return "open";
  if ((endsSoon || ops.scheduledBoard?.length) && !(started && recent)) return "soon";
  if (started && progress.complete) return "complete";
  return "idle";
}

/** Personas a las que se puede encargar un paso: la junta actual y la que entra. */
export function handoverPeople(data: ProData): string[] {
  const ops = communityOps(data);
  const names = [...data.board, ...(ops.scheduledBoard ?? [])].map((b) => b.name.trim());
  return [...new Set(names.filter(Boolean))];
}
