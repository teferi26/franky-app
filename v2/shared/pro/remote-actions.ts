import type { ProBooking, ProData } from "./types";
import type { ProRpcClient } from "./remote-contracts";
import { planProTableCommand } from "./remote-table-actions";
import {
  isCourtsStateLabel,
  planProCourtsStateCommand,
} from "./remote-courts-state";
import type { ProMutationIntent } from "./remote-intents";
import {
  CLASS_EXTRAS_COMMANDS,
  planClassExtrasCommand,
} from "./classes-remote";

export type ProCommand = {
  rpc: string;
  args: Record<string, unknown>;
  idempotent: boolean;
};

export class ProActionError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ProActionError";
  }
}

const COMMAND_PERMISSIONS: Record<string, string[]> = {
  "booking.create": ["content.manage"],
  "booking.confirmed": ["content.manage", "attendees.manage"],
  "booking.cancelled": ["content.manage", "attendees.manage"],
  "booking.no_show": ["content.manage", "attendees.manage"],
  "booking.done": ["content.manage", "attendees.manage"],
  "booking.arrived": ["content.manage", "attendees.manage"],
  "booking.in_service": ["content.manage", "attendees.manage"],
  "booking.move": ["content.manage", "attendees.manage"],
  "service.create": ["content.manage"],
  "service.update": ["content.manage"],
  "service.delete": ["content.manage"],
  "resource.create": ["content.manage"],
  "resource.save": ["content.manage"],
  "resource.archive": ["content.manage"],
  "client.create": ["content.manage"],
  "client.technical": ["content.manage"],
  "review.reply": ["content.manage"],
  "group.quoted": ["content.manage"],
  "group.declined": ["content.manage"],
  "table.add": ["content.manage"],
  "table.adopt": ["content.manage"],
  "table.remove": ["content.manage"],
  "class.add": ["content.manage"],
  "class.session.create": ["content.manage"],
  "class.cancel": ["content.manage"],
  // Datos propios del motor de clases (cuidado, pizarra, salas, interesados...).
  ...CLASS_EXTRAS_COMMANDS,
  ...Object.fromEntries(
    ["checkin", "confirm", "no_show", "remove"].map((action) => [
      `class.${action}`,
      ["content.manage", "attendees.manage"],
    ]),
  ),
  ...Object.fromEntries(
    [
      "reserve",
      "walkin",
      "waitlist",
      "waitlist.seat",
      "waitlist.cancel",
      "seat",
      "confirm",
      "decline",
      "leave",
      "clean",
      "no_show",
    ].map((action) => [
      `table.${action}`,
      ["content.manage", "attendees.manage"],
    ]),
  ),
};

const COURT_COMMANDS: Record<string, string> = Object.fromEntries(
  [
    "create",
    "confirmed",
    "cancelled",
    "no_show",
    "done",
    "arrived",
    "in_service",
    "move",
    "charge",
  ].map((action) => [`court.${action}`, `booking.${action}`]),
);

/** La interfaz orienta; cada RPC vuelve a comprobar el permiso vigente. */
export function canProCommand(
  permissions: Record<string, boolean>,
  label: string,
): boolean {
  if (COURT_COMMANDS[label])
    return canProCommand(permissions, COURT_COMMANDS[label]);
  // Documento del motor de pistas (bonos, normas, torneos, puestos...).
  if (isCourtsStateLabel(label, COURT_COMMANDS))
    return Boolean(
      permissions["content.manage"] || permissions["attendees.manage"],
    );
  if (label === "booking.charge") {
    return Boolean(
      permissions["finance.manage"] &&
      permissions["finance.read"] &&
      (permissions["content.manage"] || permissions["attendees.manage"]),
    );
  }
  if (label.endsWith(".read")) return permissions[label] === true;
  return (
    COMMAND_PERMISSIONS[label]?.some((permission) => permissions[permission]) ??
    false
  );
}

function changed<T extends { id: string }>(before: T[], after: T[]): T {
  const rows = after.filter((row) => {
    const previous = before.find((item) => item.id === row.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(row);
  });
  if (rows.length !== 1) throw new ProActionError("Guarda un cambio cada vez.");
  return rows[0];
}

function updatedBooking(before: ProData, after: ProData): ProBooking {
  const booking = changed(before.bookings, after.bookings);
  if (!before.bookings.some((row) => row.id === booking.id)) {
    throw new ProActionError(
      "Esta cita ya no está disponible. Actualiza la agenda.",
    );
  }
  return booking;
}

/** Sólo traduce campos editables. Nunca envía saldos, insignias ni contadores. */
export function planProCommand(
  label: string,
  before: ProData,
  after: ProData,
  intent?: ProMutationIntent,
): ProCommand {
  if (isCourtsStateLabel(label, COURT_COMMANDS))
    return planProCourtsStateCommand(label, before, after);
  label = COURT_COMMANDS[label] ?? label;
  const org = before.space.id;
  if (after.space.id !== org)
    throw new ProActionError("El negocio ha cambiado. Vuelve a intentarlo.");
  if (label.startsWith("table."))
    return planProTableCommand(label, before, after, intent);
  if (CLASS_EXTRAS_COMMANDS[label]) {
    const extras = planClassExtrasCommand(before, after);
    if (!extras) throw new ProActionError("Guarda un cambio cada vez.");
    return extras;
  }
  const command = (
    rpc: string,
    args: Record<string, unknown>,
    idempotent = true,
  ): ProCommand => ({ rpc, args, idempotent });
  const save = (
    entity: string,
    recordId: string | null,
    data: Record<string, unknown>,
  ) =>
    command("pro_save_agenda_record", {
      p_organization_id: org,
      p_entity: entity,
      p_record_id: recordId,
      p_data: data,
    });

  if (label.startsWith("resource.")) {
    const resource =
      label === "resource.archive"
        ? before.resources.find(
            (row) => !after.resources.some((next) => next.id === row.id),
          )
        : changed(before.resources, after.resources);
    if (!resource)
      throw new ProActionError("Selecciona el espacio que quieres guardar.");
    const previous = before.resources.find((row) => row.id === resource.id);
    if ((label === "resource.create") === Boolean(previous)) {
      throw new ProActionError("Actualiza los espacios antes de guardar.");
    }
    return command("pro_save_resource", {
      p_organization_id: org,
      p_resource_id: previous?.id ?? null,
      p_data: {
        name: resource.name,
        kind: resource.kind,
        capacity: resource.capacity,
        active: label !== "resource.archive",
        allocation_mode: resource.allocationMode,
        ...(previous ? { expected_version: previous.version ?? null } : {}),
      },
    });
  }
  if (label === "class.session.create") {
    if (
      intent?.type !== label ||
      !before.classTypes.some(
        (type) => type.id === intent.classTypeId && type.active,
      )
    ) {
      throw new ProActionError("Selecciona una actividad de tu catálogo.");
    }
    return command("professional_save_record", {
      p_organization_id: org,
      p_entity: "session",
      p_record_id: null,
      p_data: {
        service_id: intent.classTypeId,
        starts_at: intent.startsAt,
        resource_ids: [...new Set(intent.resourceIds)],
        capacity: intent.capacity,
        repeat_weeks: intent.repeatWeeks,
      },
    });
  }
  if (label === "class.cancel") {
    const session = changed(before.sessions, after.sessions);
    const previous = before.sessions.find((row) => row.id === session.id);
    if (!previous || previous.booked > 0 || previous.waitlist > 0) {
      throw new ProActionError(
        "Resuelve las reservas de esta sesión antes de cancelarla.",
      );
    }
    return command("professional_save_record", {
      p_organization_id: org,
      p_entity: "session",
      p_record_id: session.id,
      p_data: { status: "cancelled" },
    });
  }
  const classActions: Record<string, string> = {
    "class.checkin": "attend",
    "class.confirm": "confirm",
    "class.no_show": "no_show",
    "class.remove": "cancel",
  };
  if (classActions[label]) {
    const booking = updatedBooking(before, after);
    return command(
      "professional_booking_action",
      {
        p_organization_id: org,
        p_booking_id: booking.id,
        p_action: classActions[label],
        p_data: {},
      },
      false,
    );
  }

  if (label === "booking.create" || label === "class.add") {
    const booking = changed(before.bookings, after.bookings);
    if (
      before.bookings.some((row) => row.id === booking.id) ||
      !booking.serviceId
    ) {
      throw new ProActionError("Selecciona un servicio para la nueva cita.");
    }
    const client = after.clients.find((row) => row.id === booking.clientId);
    const existing = before.clients.some((row) => row.id === booking.clientId);
    return command("pro_create_agenda_booking", {
      p_organization_id: org,
      p_data: {
        service_id: booking.serviceId,
        ...(label === "class.add" ? { session_id: booking.sessionId } : {}),
        starts_at: booking.start,
        resource_ids: [
          ...new Set(
            [
              booking.staffId,
              ...(booking.resourceIds ?? []),
              booking.resourceId,
            ].filter(Boolean),
          ),
        ],
        party_size: booking.partySize,
        customer_id: existing ? booking.clientId : null,
        customer_name: existing ? null : booking.clientName,
        customer_contact: existing ? null : (client?.phone ?? null),
        note: booking.note ?? "",
        source: booking.source,
        trial: booking.trial ?? false,
        expected_total_cents: booking.priceCents,
        expected_service_version: before.calendar?.services.find(
          (service) => service.id === booking.serviceId,
        )?.version,
      },
    });
  }

  if (label === "booking.charge") {
    const payment = changed(before.payments, after.payments);
    if (
      !payment.bookingId ||
      before.payments.some((row) => row.id === payment.id)
    ) {
      throw new ProActionError("Selecciona la cita de este cobro.");
    }
    for (const amount of [payment.amountCents, payment.tipCents]) {
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw new ProActionError("Revisa el importe del cobro.");
    }
    return command("pro_booking_operation", {
      p_organization_id: org,
      p_booking_id: payment.bookingId,
      p_action: "payment",
      p_data: {
        amount_cents: payment.amountCents,
        tip_cents: payment.tipCents,
        method: payment.method,
        complete:
          after.bookings.find((booking) => booking.id === payment.bookingId)
            ?.status === "done",
      },
    });
  }

  if (label.startsWith("booking.")) {
    const booking = updatedBooking(before, after);
    const action = label.slice(8);
    const args = { p_organization_id: org, p_booking_id: booking.id };
    if (action === "move") {
      return command("pro_booking_operation", {
        ...args,
        p_action: "move",
        p_data: { starts_at: booking.start, staff_id: booking.staffId },
      });
    }
    if (action === "arrived" || action === "in_service") {
      return command("pro_booking_operation", {
        ...args,
        p_action: action,
        p_data: {},
      });
    }
    const actions: Record<string, string> = {
      confirmed: "confirm",
      cancelled: "cancel",
      no_show: "no_show",
      done: "attend",
    };
    if (actions[action])
      return command(
        "professional_booking_action",
        { ...args, p_action: actions[action], p_data: {} },
        false,
      );
  }

  if (label === "service.delete") {
    const removed = before.services.filter(
      (row) => !after.services.some((item) => item.id === row.id),
    );
    if (removed.length !== 1)
      throw new ProActionError("Selecciona el servicio que quieres archivar.");
    return save("service", removed[0].id, { active: false });
  }
  if (label === "service.create" || label === "service.update") {
    const service = changed(before.services, after.services);
    if (service.studentPriceCents !== undefined) {
      throw new ProActionError(
        "El precio estudiante necesita una tarifa aprobada antes de activarse.",
      );
    }
    return save("service", label === "service.create" ? null : service.id, {
      name: service.name,
      category: service.category,
      duration_minutes: service.durationMin,
      price_cents: service.priceCents,
      eligible_staff_ids: service.staffIds,
      online: service.online,
      ...(label === "service.update"
        ? {
            expected_version: before.calendar?.services.find(
              (row) => row.id === service.id,
            )?.version,
          }
        : {}),
      ...(label === "service.create"
        ? { mode: "appointment", staff_required: true, active: true }
        : {}),
    });
  }

  if (label === "client.create" || label === "client.technical") {
    const client = changed(before.clients, after.clients);
    return save(
      "customer",
      label === "client.create" ? null : client.id,
      label === "client.technical"
        ? { technical: client.technical ?? "" }
        : {
            display_name: client.name,
            contact: client.phone ?? null,
            notes: client.notes ?? "",
            technical: client.technical ?? "",
            tags: client.tags,
            marketing_consent: client.marketingConsent,
            consent_confirmed: client.marketingConsent,
          },
    );
  }
  if (label === "review.reply") {
    const review = changed(before.reviews, after.reviews);
    return command(
      "pro_reply_review",
      { p_review_id: review.id, p_reply: review.reply ?? "" },
      false,
    );
  }
  if (label === "group.quoted" || label === "group.declined") {
    const group = changed(before.groupRequests, after.groupRequests);
    return command(
      "pro_respond_group_request",
      {
        p_request_id: group.id,
        p_action: label === "group.quoted" ? "quote" : "decline",
        p_data: { quote_cents: group.quoteCents },
      },
      false,
    );
  }
  throw new ProActionError(
    "Esta acción todavía no está disponible en tu negocio.",
  );
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Conserva la clave al reintentar una respuesta perdida. Sólo vive en esta sesión. */
export class ProCommandRunner {
  private keys = new Map<string, string>();
  constructor(
    private readonly client: ProRpcClient,
    private readonly createRequestId: () => string = () => crypto.randomUUID(),
  ) {}

  async run(command: ProCommand): Promise<unknown> {
    const fingerprint = stable(command);
    const args = { ...command.args };
    if (command.idempotent) {
      const requestId = this.keys.get(fingerprint) ?? this.createRequestId();
      this.keys.set(fingerprint, requestId);
      args.p_data = {
        ...(args.p_data as Record<string, unknown>),
        client_request_id: requestId,
      };
    }
    const result = await this.client.rpc(command.rpc, args);
    if (result.error)
      throw new ProActionError(publicProError(result.error), result.error.code);
    return result.data;
  }

  clear(command?: ProCommand) {
    if (command) this.keys.delete(stable(command));
    else this.keys.clear();
  }
}

export function publicProError(error: {
  message?: string;
  code?: string;
}): string {
  const message = error.message ?? "";
  if (
    error.code === "42501" ||
    /forbidden|unauthorized|permission|membership|revoked/.test(message)
  ) {
    return "Tu acceso ha cambiado. Vuelve a abrir el negocio para comprobar tus permisos.";
  }
  if (
    error.code === "PGRST202" ||
    /does not exist|schema cache/.test(message)
  ) {
    return "La conexión de esta agenda todavía está pendiente de activación.";
  }
  if (message.includes("pro_courts_state_version"))
    return "Alguien de tu equipo acaba de guardar un cambio. Actualiza y vuelve a hacerlo.";
  if (/capacity|unavailable|conflict|overlap|slot|version/.test(message)) {
    return "La disponibilidad ha cambiado. Actualiza la agenda y elige otro hueco.";
  }
  if (/price|amount|payment|paid/.test(message))
    return "El importe ha cambiado. Actualiza la cita antes de registrar el cobro.";
  if (message.includes("pro_table_early_departure_unavailable"))
    return "Esta reserva todavía no ha comenzado. Conservamos la mesa ocupada; podrás registrar la salida a partir de la hora reservada.";
  return "No hemos podido confirmar el cambio. Puedes reintentar; conservamos tus datos.";
}
