import { z } from "zod";
import type { ProfessionalResource } from "../professional-services";
import type { ProBooking, ProData, ProTableBookingOperation } from "./types";
import {
  ProRemoteError,
  type ProRemoteTableOperations,
  type ProRpcClient,
} from "./remote-contracts";

const id = z.string().min(1);
const nonnegative = z.number().int().nonnegative();
const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));

const tableSchema = z
  .object({
    id,
    resource_id: id,
    organization_id: id,
    name: z.string(),
    capacity: z.number().int().positive(),
    active: z.boolean(),
    zone: z.string().min(1),
    x: nonnegative.max(11),
    y: nonnegative.max(7),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1).max(8),
    shape: z.enum(["square", "round", "bar"]),
    exclusive: z.boolean(),
    cleaning_minutes: nonnegative.max(120),
    version: z.number().int().positive(),
  })
  .refine(
    (table) =>
      table.id === table.resource_id &&
      table.x + table.w <= 12 &&
      table.y + table.h <= 8,
  );

const operationsSchema = z.object({
  tables: z.array(tableSchema),
  unmapped_resource_ids: z.array(id),
  waitlist: z.array(
    z.object({
      id,
      organization_id: id,
      customer_id: id,
      customer_name: z.string(),
      customer_contact: z.string().nullable().optional(),
      service_id: id,
      party_size: z.number().int().min(1).max(500),
      requested_at: timestamp,
      expires_at: timestamp,
      status: z.enum(["waiting", "expired", "seated", "cancelled"]),
      booking_id: id.nullable(),
      service_version: z.number().int().positive(),
      expected_total_cents: nonnegative.nullable(),
      note: z.string().optional(),
    }),
  ),
  booking_operations: z.array(
    z.object({
      booking_id: id,
      organization_id: id,
      table_id: id,
      seated_at: timestamp.nullable(),
      left_at: timestamp.nullable(),
      cleaned_at: timestamp.nullable(),
      cleaning_minutes: nonnegative.max(120),
    }),
  ),
  can_manage: z.boolean(),
  can_operate: z.boolean(),
});

function requireOrganization(
  operations: ProRemoteTableOperations,
  organizationId: string,
): void {
  const rows = [
    ...operations.tables,
    ...operations.waitlist,
    ...operations.booking_operations,
  ];
  if (rows.some((row) => row.organization_id !== organizationId)) {
    throw new ProRemoteError(
      "La sala recibida no corresponde a este espacio.",
      "pro_invalid_response",
    );
  }
}

export function parseProTableOperations(
  value: unknown,
  organizationId: string,
): ProRemoteTableOperations {
  const parsed = operationsSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProRemoteError(
      "Respuesta incompleta de pro_get_table_operations.",
      "pro_invalid_response",
    );
  }
  requireOrganization(parsed.data, organizationId);
  return parsed.data;
}

/** La lectura recorre todo el periodo respetando el límite de 93 días de cada RPC. */
export async function loadProTableOperations(
  client: ProRpcClient,
  organizationId: string,
  from: string,
  until: string,
): Promise<ProRemoteTableOperations> {
  const start = Date.parse(from);
  const end = Date.parse(until);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 366 * 86400000
  ) {
    throw new ProRemoteError(
      "El periodo de la sala no es válido.",
      "professional_invalid_input",
    );
  }
  const pages: ProRemoteTableOperations[] = [];
  for (let cursor = start; cursor < end; cursor += 90 * 86400000) {
    const result = await client.rpc("pro_get_table_operations", {
      p_organization_id: organizationId,
      p_from: new Date(cursor).toISOString(),
      p_until: new Date(Math.min(end, cursor + 90 * 86400000)).toISOString(),
    });
    if (result.error)
      throw new ProRemoteError(result.error.message, result.error.code);
    pages.push(parseProTableOperations(result.data, organizationId));
  }
  const latest = pages[pages.length - 1];
  return {
    ...latest,
    waitlist: [
      ...new Map(
        pages.flatMap((page) => page.waitlist).map((row) => [row.id, row]),
      ).values(),
    ],
    booking_operations: [
      ...new Map(
        pages
          .flatMap((page) => page.booking_operations)
          .map((row) => [row.booking_id, row]),
      ).values(),
    ],
    can_manage: pages.every((page) => page.can_manage),
    can_operate: pages.every((page) => page.can_operate),
  };
}

function bookingStatus(
  booking: ProBooking,
  operation: ProTableBookingOperation,
): ProBooking["status"] {
  if (booking.status === "cancelled" || booking.status === "no_show")
    return booking.status;
  if (operation.leftAt) return "done";
  if (operation.seatedAt && booking.status === "confirmed") return "arrived";
  return booking.status;
}

/** Conserva las reservas y sus importes; el estado de sala añade sólo hechos registrados. */
export function mapProTableData(
  data: ProData,
  operations: ProRemoteTableOperations,
  resources: ProfessionalResource[] = [],
): ProData {
  requireOrganization(operations, data.space.id);
  const byBooking = new Map(
    operations.booking_operations.map((row) => [row.booking_id, row]),
  );
  const tableIds = new Set([
    ...operations.tables.map((table) => table.id),
    ...operations.unmapped_resource_ids,
  ]);
  return {
    ...data,
    tables: operations.tables
      .filter((table) => table.active)
      .map((table) => ({
        id: table.id,
        name: table.name,
        seats: table.capacity,
        zone: table.zone,
        x: table.x,
        y: table.y,
        w: table.w,
        h: table.h,
        shape: table.shape,
        active: table.active,
        exclusive: table.exclusive,
        cleaningMinutes: table.cleaning_minutes,
        version: table.version,
      })),
    bookings: data.bookings.map((booking) => {
      const remote = byBooking.get(booking.id);
      const resourceId =
        remote?.table_id ??
        (booking.resourceId && tableIds.has(booking.resourceId)
          ? booking.resourceId
          : undefined) ??
        booking.resourceIds?.find((resource) => tableIds.has(resource));
      if (!resourceId) return booking;
      const tableOperation: ProTableBookingOperation | undefined = remote
        ? {
            tableId: remote.table_id,
            seatedAt: remote.seated_at,
            leftAt: remote.left_at,
            cleanedAt: remote.cleaned_at,
            cleaningMinutes: remote.cleaning_minutes,
          }
        : undefined;
      return {
        ...booking,
        kind: "table",
        resourceId,
        tableOperation,
        status: tableOperation
          ? bookingStatus(booking, tableOperation)
          : booking.status,
      };
    }),
    tableOperations: {
      unmappedResourceIds: [...operations.unmapped_resource_ids],
      unmappedResources: resources.filter(
        (resource) =>
          resource.organization_id === data.space.id &&
          resource.kind === "table" &&
          operations.unmapped_resource_ids.includes(resource.id),
      ),
      canManage: operations.can_manage,
      canOperate: operations.can_operate,
      waitlist: operations.waitlist.map((entry) => ({
        id: entry.id,
        customerId: entry.customer_id,
        customerName: entry.customer_name,
        customerContact: entry.customer_contact,
        serviceId: entry.service_id,
        partySize: entry.party_size,
        requestedAt: entry.requested_at,
        expiresAt: entry.expires_at,
        status: entry.status,
        bookingId: entry.booking_id,
        serviceVersion: entry.service_version,
        expectedTotalCents: entry.expected_total_cents,
        note: entry.note,
      })),
    },
  };
}
