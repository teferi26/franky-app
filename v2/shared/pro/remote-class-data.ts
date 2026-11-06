import { z } from "zod";
import type { ProfessionalResource } from "../professional-services";
import type { ProClassSession, ProData, ProResource, ToneKey } from "./types";
import {
  ProRemoteError,
  type ProRemoteService,
  type ProRemoteSnapshot,
  type ProRemoteResourceOperations,
  type ProRpcClient,
} from "./remote-contracts";

const tones: ToneKey[] = [
  "violet",
  "sky",
  "emerald",
  "amber",
  "rose",
  "teal",
  "slate",
];

const resourceOperationsSchema = z.object({
  resources: z.array(
    z
      .object({
        id: z.string().min(1),
        organization_id: z.string().min(1),
        name: z.string(),
        kind: z.enum(["court", "room", "desk"]),
        capacity: z.number().int().positive(),
        active: z.boolean(),
        allocation_mode: z.enum(["exclusive", "shared"]),
        capacity_unit: z.enum(["concurrent_bookings", "people"]),
        configured: z.boolean(),
        version: z.number().int().positive().nullable(),
      })
      .refine((resource) =>
        resource.kind === "desk"
          ? resource.capacity_unit === "people"
          : resource.capacity_unit === "concurrent_bookings" &&
            resource.capacity === 1,
      ),
  ),
  can_manage: z.boolean(),
});

export function parseProResourceOperations(
  value: unknown,
  organizationId: string,
): ProRemoteResourceOperations {
  const parsed = resourceOperationsSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.resources.some(
      (resource) => resource.organization_id !== organizationId,
    )
  ) {
    throw new ProRemoteError(
      "Respuesta incompleta de pro_get_resource_operations.",
      "pro_invalid_response",
    );
  }
  return parsed.data;
}

export async function loadProResourceOperations(
  client: ProRpcClient,
  organizationId: string,
): Promise<ProRemoteResourceOperations> {
  const result = await client.rpc("pro_get_resource_operations", {
    p_organization_id: organizationId,
  });
  if (result.error)
    throw new ProRemoteError(result.error.message, result.error.code);
  return parseProResourceOperations(result.data, organizationId);
}

function canReadRoster(snapshot: ProRemoteSnapshot): boolean {
  return ["content.manage", "attendees.manage", "finance.read"].some(
    (permission) => snapshot.permissions[permission],
  );
}

function classOperations(
  snapshot: ProRemoteSnapshot,
): NonNullable<ProData["classOperations"]> {
  return {
    rosterVisible: canReadRoster(snapshot),
    resources: snapshot.resources,
    bundles: snapshot.bundles.map((bundle) => ({
      id: bundle.id,
      customerId: bundle.customer_id,
      serviceId: bundle.service_id,
      label: bundle.label,
      remaining: bundle.remaining,
      granted: bundle.granted,
    })),
  };
}

function onlyStaff(
  resourceIds: string[],
  byResource: Map<string, ProfessionalResource>,
): string {
  const staffIds = resourceIds.filter(
    (id) => byResource.get(id)?.kind === "staff",
  );
  return staffIds.length === 1 ? staffIds[0] : "";
}

/** Sesiones y bonos existentes, sin convertir bonos personales en cuotas recurrentes. */
export function mapProClassData(snapshot: ProRemoteSnapshot): ProData {
  const byResource = new Map(
    snapshot.resources.map((resource) => [resource.id, resource]),
  );
  const sessions = snapshot.data.calendar?.sessions ?? [];
  const referencedServices = new Set(
    sessions.map((session) => session.service_id),
  );
  const rosterVisible = canReadRoster(snapshot);
  const mappedSessions: ProClassSession[] = sessions.map((session) => {
    const bookings = snapshot.bookings.filter(
      (booking) => booking.session_id === session.id,
    );
    const sumSeats = (statuses: string[]) =>
      bookings
        .filter((booking) => statuses.includes(booking.status))
        .reduce((sum, booking) => sum + booking.party_size, 0);
    const booked =
      session.reserved_seats ??
      (rosterVisible
        ? sumSeats(["requested", "confirmed", "attended"])
        : undefined);
    const waitlist =
      session.waitlisted_seats ??
      (rosterVisible ? sumSeats(["waitlisted"]) : undefined);
    if (booked === undefined || waitlist === undefined) {
      throw new ProRemoteError(
        "Faltan los recuentos de la sesión.",
        "pro_invalid_response",
      );
    }
    const checkedIn = rosterVisible
      ? snapshot.data.bookings
          .filter(
            (booking) =>
              booking.sessionId === session.id &&
              ["arrived", "in_service", "done"].includes(booking.status),
          )
          .reduce((sum, booking) => sum + booking.partySize, 0)
      : null;
    const roomNames = session.resource_ids
      .map((id) => byResource.get(id))
      .filter(
        (resource) =>
          resource &&
          ["room", "table", "court", "desk"].includes(resource.kind),
      )
      .map((resource) => resource!.name);
    return {
      id: session.id,
      classTypeId: session.service_id,
      start: session.starts_at,
      end: session.ends_at,
      capacity: session.capacity,
      booked,
      waitlist,
      checkedIn,
      room: roomNames.join(", "),
      coachId: onlyStaff(session.resource_ids, byResource),
      resourceIds: [...session.resource_ids],
      status: session.status,
      seriesId: session.series_id,
    };
  });
  return {
    ...snapshot.data,
    classTypes: snapshot.services
      .filter(
        (service) =>
          service.mode === "session" &&
          (service.active || referencedServices.has(service.id)),
      )
      .map((service, index) => ({
        id: service.id,
        name: service.name,
        category: service.category,
        durationMin: service.duration_minutes,
        capacity: service.capacity,
        coachId: onlyStaff(service.required_resource_ids, byResource),
        tone: tones[index % tones.length],
        active: service.active,
        resourceIds: [...service.required_resource_ids],
        version: service.version,
      })),
    sessions: mappedSessions,
    classOperations: classOperations(snapshot),
  };
}

function resourceServices(
  resource: ProfessionalResource,
  services: ProRemoteService[],
  byResource: Map<string, ProfessionalResource>,
): ProRemoteService[] {
  return services.filter((service) => {
    if (!service.active || service.mode !== "resource") return false;
    const fixedSpaces = service.required_resource_ids.filter((id) => {
      const kind = byResource.get(id)?.kind;
      return kind === "court" || kind === "desk" || kind === "room";
    });
    return fixedSpaces.length === 0 || fixedSpaces.includes(resource.id);
  });
}

function hourlyPrice(services: ProRemoteService[]): number | null {
  if (
    !services.length ||
    services.some(
      (service) =>
        service.duration_minutes !== 60 || service.price_basis !== "booking",
    )
  )
    return null;
  const prices = new Set(services.map((service) => service.price_cents));
  return prices.size === 1 ? services[0].price_cents : null;
}

/** Los recursos no tienen tarifa propia: sólo se muestra si sus servicios la fijan sin ambigüedad. */
export function mapProCourtData(
  snapshot: ProRemoteSnapshot,
  operations?: ProRemoteResourceOperations,
): ProData {
  if (
    operations?.resources.some(
      (resource) => resource.organization_id !== snapshot.data.space.id,
    )
  ) {
    throw new ProRemoteError(
      "Los recursos recibidos no corresponden a este espacio.",
      "pro_invalid_response",
    );
  }
  const policies = new Map(
    operations?.resources.map((resource) => [resource.id, resource]),
  );
  const remoteResources = operations?.resources ?? snapshot.resources;
  const byResource = new Map(
    [...snapshot.resources, ...remoteResources].map((resource) => [
      resource.id,
      resource,
    ]),
  );
  const resources: ProResource[] = remoteResources
    .filter(
      (
        resource,
      ): resource is ProfessionalResource & {
        kind: "court" | "desk" | "room";
      } =>
        resource.active &&
        (resource.kind === "court" ||
          resource.kind === "desk" ||
          resource.kind === "room"),
    )
    .map((resource, index) => {
      const services = resourceServices(
        resource,
        snapshot.services,
        byResource,
      );
      return {
        id: resource.id,
        name: resource.name,
        kind: resource.kind,
        capacity: resource.capacity,
        pricePerHourCents: hourlyPrice(services),
        serviceIds: services.map((service) => service.id),
        allocationMode: policies.get(resource.id)?.allocation_mode,
        capacityUnit: policies.get(resource.id)?.capacity_unit,
        configured: policies.get(resource.id)?.configured,
        version: policies.get(resource.id)?.version,
        tone: tones[index % tones.length],
      };
    });
  const ids = new Set(resources.map((resource) => resource.id));
  return {
    ...snapshot.data,
    resources,
    bookings: snapshot.data.bookings.map((booking) => {
      const resourceId =
        booking.resourceId && ids.has(booking.resourceId)
          ? booking.resourceId
          : booking.resourceIds?.find((id) => ids.has(id));
      return resourceId && !booking.sessionId
        ? { ...booking, kind: "court", resourceId }
        : booking;
    }),
    classOperations: classOperations(snapshot),
  };
}
