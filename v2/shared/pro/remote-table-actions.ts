import type { ProData, ProTableWaitlistEntry } from "./types";
import { ProActionError, type ProCommand } from "./remote-actions";
import type { ProMutationIntent } from "./remote-intents";

function changed<T extends { id: string }>(before: T[], after: T[]): T {
  const rows = after.filter((row) => {
    const previous = before.find((item) => item.id === row.id);
    return !previous || JSON.stringify(row) !== JSON.stringify(previous);
  });
  if (rows.length !== 1) throw new ProActionError("Guarda un cambio cada vez.");
  return rows[0];
}

export function planProTableCommand(
  label: string,
  before: ProData,
  after: ProData,
  intent?: ProMutationIntent,
): ProCommand {
  const org = before.space.id;
  const operation = (
    action: string,
    data: Record<string, unknown>,
    recordId: string | null = null,
  ): ProCommand => ({
    rpc: "pro_table_operation",
    args: {
      p_organization_id: org,
      p_action: action,
      p_record_id: recordId,
      p_data: data,
    },
    idempotent: true,
  });
  const serviceVersion = (serviceId: string) =>
    before.calendar?.services.find((service) => service.id === serviceId)
      ?.version;
  const customer = (
    customerId: string | undefined,
    name: string,
    contact?: string | null,
  ) => {
    const existing = before.clients.some((client) => client.id === customerId);
    return {
      customer_id: existing ? customerId : null,
      customer_name: existing ? null : name,
      customer_contact: existing ? null : (contact ?? null),
    };
  };

  if (label === "table.adopt") {
    if (intent?.type !== "table.adopt")
      throw new ProActionError("Selecciona una mesa pendiente de colocar.");
    const resource = before.tableOperations?.unmappedResources?.find(
      (row) =>
        row.id === intent.resourceId &&
        row.organization_id === org &&
        row.kind === "table" &&
        row.active,
    );
    if (
      !resource ||
      !before.tableOperations?.unmappedResourceIds.includes(resource.id) ||
      before.tables.some((table) => table.id === resource.id)
    )
      throw new ProActionError("Esta mesa ha cambiado. Actualiza la sala.");
    return {
      rpc: "pro_save_table",
      idempotent: true,
      args: {
        p_organization_id: org,
        p_table_id: resource.id,
        // NULL exige que todavía no exista un plano, incluso tras otro editor.
        // Sólo se envía su ubicación: capacidad y política siguen en servidor.
        p_data: {
          expected_version: null,
          zone: intent.zone,
          x: intent.x,
          y: intent.y,
          w: intent.w,
          h: intent.h,
          shape: intent.shape,
        },
      },
    };
  }
  if (label === "table.add" || label === "table.remove") {
    const table =
      label === "table.add"
        ? changed(before.tables, after.tables)
        : before.tables.find(
            (row) => !after.tables.some((item) => item.id === row.id),
          );
    if (!table) throw new ProActionError("Selecciona una mesa del plano.");
    if (
      label === "table.add" &&
      before.tables.some((row) => row.id === table.id)
    ) {
      throw new ProActionError("Esta mesa ya está en el plano.");
    }
    return {
      rpc: "pro_save_table",
      idempotent: true,
      args: {
        p_organization_id: org,
        p_table_id: label === "table.add" ? null : table.id,
        p_data:
          label === "table.remove"
            ? { active: false, expected_version: table.version }
            : {
                name: table.name,
                capacity: table.seats,
                zone: table.zone,
                x: table.x,
                y: table.y,
                w: table.w,
                h: table.h,
                shape: table.shape,
                exclusive: true,
                cleaning_minutes: table.cleaningMinutes ?? 10,
              },
      },
    };
  }

  if (label === "table.waitlist.seat" || label === "table.waitlist.cancel") {
    if (!intent || intent.type !== label)
      throw new ProActionError("Selecciona una persona de la lista de espera.");
    const entry = before.tableOperations?.waitlist.find(
      (row) => row.id === intent.waitlistId,
    );
    if (!entry || entry.status !== "waiting")
      throw new ProActionError(
        "La lista de espera ha cambiado. Actualiza la sala.",
      );
    if (intent.type === "table.waitlist.cancel")
      return operation("cancel", {}, entry.id);
    const table = before.tables.find((row) => row.id === intent.tableId);
    if (!table || table.seats < entry.partySize)
      throw new ProActionError("Elige una mesa con sitio para este grupo.");
    return operation(
      "seat",
      {
        table_id: table.id,
        expected_service_version: entry.serviceVersion,
        ...(entry.expectedTotalCents !== null
          ? { expected_total_cents: entry.expectedTotalCents }
          : {}),
      },
      entry.id,
    );
  }

  if (label === "table.waitlist") {
    const entry: ProTableWaitlistEntry = changed(
      before.tableOperations?.waitlist ?? [],
      after.tableOperations?.waitlist ?? [],
    );
    if (before.tableOperations?.waitlist.some((row) => row.id === entry.id))
      throw new ProActionError("Esta persona ya está en la lista de espera.");
    return operation("waitlist", {
      service_id: entry.serviceId,
      party_size: entry.partySize,
      ...customer(entry.customerId, entry.customerName, entry.customerContact),
      note: entry.note ?? "",
      expected_service_version: serviceVersion(entry.serviceId),
      ...(entry.expectedTotalCents !== null
        ? { expected_total_cents: entry.expectedTotalCents }
        : {}),
    });
  }

  const booking = changed(before.bookings, after.bookings);
  if (label === "table.reserve" || label === "table.walkin") {
    if (
      !booking.serviceId ||
      !booking.resourceId ||
      before.bookings.some((row) => row.id === booking.id)
    ) {
      throw new ProActionError(
        "Selecciona el servicio y la mesa de esta reserva.",
      );
    }
    const client = after.clients.find((row) => row.id === booking.clientId);
    return operation(label === "table.reserve" ? "reserve" : "walkin", {
      service_id: booking.serviceId,
      table_id: booking.resourceId,
      party_size: booking.partySize,
      ...(label === "table.reserve" ? { starts_at: booking.start } : {}),
      ...customer(
        booking.clientId,
        booking.clientName,
        client?.phone ?? client?.email,
      ),
      note: booking.note ?? "",
      source: booking.source,
      expected_service_version: serviceVersion(booking.serviceId),
      expected_total_cents: booking.priceCents,
    });
  }
  if (!before.bookings.some((row) => row.id === booking.id))
    throw new ProActionError("Esta reserva ya no está disponible.");
  const actions: Record<string, string> = {
    "table.seat": "seat",
    "table.confirm": "confirm",
    "table.decline": "cancel",
    "table.leave": "leave",
    "table.clean": "clean",
    "table.no_show": "no_show",
  };
  if (actions[label]) return operation(actions[label], {}, booking.id);
  throw new ProActionError(
    "Esta acción todavía no está disponible en la sala.",
  );
}
