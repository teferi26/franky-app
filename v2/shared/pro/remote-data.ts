import { z } from "zod";
import { PROFESSIONAL_CATEGORIES } from "../professional-services";
import type {
  ProfessionalAvailability,
  ProfessionalWorkspace,
} from "../professional-services";
import type { ProBooking, ProData, ProSpace, ToneKey } from "./types";
import { PRO_VERTICALS, VERTICAL_ORDER } from "./verticals";
import { loadProTableOperations, mapProTableData } from "./remote-table-data";
import {
  loadProResourceOperations,
  mapProClassData,
  mapProCourtData,
} from "./remote-class-data";
import { loadProCourtsState } from "./remote-courts-state";
import { loadClassExtras } from "./classes-remote";
import {
  ProRemoteError,
  type ProRemoteInput,
  type ProRemoteOperations,
  type ProRemoteService,
  type ProRemoteSnapshot,
  type ProRpcClient,
} from "./remote-contracts";

export type { ProRemoteSnapshot, ProRpcClient } from "./remote-contracts";

const id = z.string().min(1);
const integer = z.number().int();
const nonnegative = integer.nonnegative();
const timestamp = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
const source = z.enum([
  "franky",
  "hueco",
  "card",
  "instagram",
  "phone",
  "walkin",
  "google",
  "grupo",
  "unknown",
]);

const settingsSchema = z
  .object({
    organization_id: id,
    category: z.enum(PROFESSIONAL_CATEGORIES),
    timezone: z.string(),
    enabled: z.boolean(),
    public_booking: z.boolean(),
    require_approval: z.boolean(),
    booking_horizon_days: nonnegative,
    cancellation_hours: nonnegative,
    terms: z.string(),
    staff_limit: nonnegative,
    resource_limit: nonnegative,
    service_limit: nonnegative,
    sales_enabled: z.boolean(),
    demo: z.boolean(),
  })
  .passthrough();

const serviceSchema = z
  .object({
    id,
    organization_id: id,
    name: z.string(),
    description: z.string(),
    mode: z.enum(["appointment", "resource", "session", "group"]),
    duration_minutes: integer.positive(),
    buffer_minutes: nonnegative,
    price_cents: nonnegative,
    price_basis: z.enum(["booking", "person"]),
    deposit_cents: nonnegative,
    capacity: integer.positive(),
    required_resource_ids: z.array(id),
    staff_required: z.boolean(),
    active: z.boolean(),
    menu: z.string(),
    version: nonnegative,
  })
  .passthrough();

const remoteServiceSchema = serviceSchema.extend({
  category: z.string(),
  online: z.boolean(),
  eligible_staff_ids: z.array(id),
});

const resourceSchema = z
  .object({
    id,
    organization_id: id,
    name: z.string(),
    kind: z.enum(["staff", "room", "equipment", "table", "court", "desk"]),
    capacity: integer.positive(),
    active: z.boolean(),
  })
  .passthrough();

const availabilitySchema = z
  .object({
    id,
    organization_id: id,
    resource_id: id.nullable(),
    weekday: integer.min(0).max(6),
    start_minute: nonnegative.max(1439),
    end_minute: integer.positive().max(1440),
  })
  .passthrough();

const exceptionSchema = z
  .object({
    id,
    organization_id: id,
    resource_id: id.nullable(),
    local_date: z.string(),
    reason: z.string(),
  })
  .passthrough();

const sessionSchema = z
  .object({
    id,
    organization_id: id,
    service_id: id,
    starts_at: timestamp,
    ends_at: timestamp,
    capacity: integer.positive(),
    resource_ids: z.array(id),
    status: z.enum(["open", "cancelled"]),
    series_id: id.nullable(),
    reserved_seats: nonnegative.optional(),
    waitlisted_seats: nonnegative.optional(),
  })
  .passthrough();

const customerSchema = z
  .object({
    id,
    organization_id: id,
    user_id: id.nullable(),
    display_name: z.string(),
    contact: z.string().nullable(),
    created_at: timestamp,
  })
  .passthrough();

const remoteCustomerSchema = customerSchema.extend({
  notes: z.string(),
  technical: z.string(),
  tags: z.array(z.string()),
  marketing_consent: z.boolean(),
  consent_recorded_at: timestamp.nullable(),
  visits: nonnegative,
  no_shows: nonnegative,
  last_visit: timestamp.nullable(),
  spent_cents: nonnegative.nullable(),
});

const bookingSchema = z
  .object({
    id,
    organization_id: id,
    service_id: id,
    session_id: id.nullable(),
    customer_id: id,
    customer_user_id: id.nullable(),
    customer_name: z.string().optional(),
    service_name: z.string().optional(),
    starts_at: timestamp,
    ends_at: timestamp,
    blocked_until: timestamp.optional(),
    resource_ids: z.array(id),
    party_size: integer.positive(),
    status: z.enum([
      "requested",
      "confirmed",
      "waitlisted",
      "attended",
      "cancelled",
      "no_show",
    ]),
    total_cents: nonnegative,
    deposit_cents: nonnegative,
    deposit_status: z.enum(["not_required", "pending", "paid", "refunded"]),
    price_snapshot: z
      .object({
        service_name: z.string(),
        menu: z.string(),
        terms: z.string(),
        version: nonnegative,
        unit_cents: nonnegative,
        price_basis: z.string(),
        card: z
          .object({
            quote_id: id,
            discount_cents: nonnegative,
            final_cents: nonnegative,
            protected_until: timestamp.optional(),
          })
          .optional(),
      })
      .passthrough(),
    created_at: timestamp,
    attended_at: timestamp.nullable(),
    bundle_id: id.nullable(),
    card_quote_id: id.nullable(),
    reschedule: z
      .object({ starts_at: timestamp, expires_at: timestamp })
      .nullable()
      .optional(),
    timezone: z.string().optional(),
    waitlist_offer_status: z
      .enum(["none", "offered", "accepted", "expired", "declined"])
      .optional(),
    waitlist_offer_expires_at: timestamp.nullable().optional(),
    waitlist_offer_version: nonnegative.optional(),
    lifecycle_version: nonnegative.optional(),
  })
  .passthrough();

const bundleSchema = z
  .object({
    id,
    organization_id: id,
    customer_id: id,
    service_id: id,
    remaining: nonnegative,
    granted: nonnegative,
    label: z.string(),
  })
  .passthrough();

const workspaceSchema = z
  .object({
    settings: settingsSchema.nullable(),
    services: z.array(serviceSchema),
    resources: z.array(resourceSchema),
    availability: z.array(availabilitySchema),
    exceptions: z.array(exceptionSchema),
    sessions: z.array(sessionSchema),
    bookings: z.array(bookingSchema),
    customers: z.array(customerSchema),
    bundles: z.array(bundleSchema),
    permissions: z.array(z.string()),
    pricing: z
      .object({
        monthly_cents: nonnegative,
        annual_cents: nonnegative,
        founder_cents: nonnegative,
        currency: z.literal("EUR"),
        tax_included: z.literal(false),
        sales_enabled: z.literal(false),
      })
      .nullable(),
    has_more: z.boolean(),
    demo: z.boolean(),
  })
  .passthrough();

const operationsSchema = z.object({
  customers: z.array(remoteCustomerSchema),
  next_customer_cursor: id.nullable(),
  services: z.array(remoteServiceSchema),
  sessions: z.array(sessionSchema),
  bookings: z.array(
    z.object({
      id,
      phase: z.enum(["arrived", "in_service"]).nullable(),
      note: z.string(),
      source: source.nullable(),
      trial: z.boolean(),
      paid_cents: nonnegative.nullable(),
    }),
  ),
  payments: z.array(
    z.object({
      id,
      organization_id: id,
      booking_id: id,
      amount_cents: nonnegative,
      tip_cents: nonnegative,
      method: z.enum(["card", "cash", "bizum"]),
      recorded_at: timestamp,
    }),
  ),
  can_record_payment: z.boolean(),
  review_stats: z.object({
    rating: z.number().min(1).max(5).nullable(),
    count: nonnegative,
  }),
  limits: z.object({
    offers_truncated: z.boolean(),
    reviews_truncated: z.boolean(),
    group_requests_truncated: z.boolean(),
  }),
});

const spaceSchema = z.object({
  organization: z.object({
    id,
    name: z.string(),
    city: z.string().nullable(),
    kind: z.string(),
    demo: z.boolean(),
  }),
  profile: z
    .object({
      organization_id: id,
      vertical: z.enum(VERTICAL_ORDER),
      public_slug: z.string(),
      description: z.string(),
      address: z.string().nullable(),
      hours: z
        .array(
          z
            .object({
              open: nonnegative.max(1439),
              close: integer.positive().max(1440),
            })
            .nullable(),
        )
        .max(7),
      booking_enabled: z.boolean(),
      card_enabled: z.boolean(),
      card_discount_pct: nonnegative,
      walk_minutes_to_campus: nonnegative.nullable(),
      campus_university_id: id.nullable(),
      published: z.boolean(),
    })
    .nullable(),
  offers: z.array(z.unknown()),
  menu: z.array(z.unknown()),
  daily_menu: z.unknown(),
  group_requests: z.array(z.unknown()),
  reviews: z.array(
    z.object({
      id,
      rating: integer.min(1).max(5),
      body: z.string(),
      reply: z.string().nullable(),
      created_at: timestamp,
      author: z.string(),
    }),
  ),
  promoters: z.array(z.unknown()),
});

const shiftSchema = z.object({
  id,
  organization_id: id,
  user_id: id,
  in_at: timestamp,
  out_at: timestamp.nullable(),
  break_minutes: nonnegative,
});

function parse<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ProRemoteError(
      `Respuesta incompleta de ${name}.`,
      "pro_invalid_response",
    );
  return result.data;
}

async function rpc<T>(
  client: ProRpcClient,
  name: string,
  schema: z.ZodType<T>,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await client.rpc(name, args);
  if (result.error)
    throw new ProRemoteError(result.error.message, result.error.code);
  return parse(schema, result.data, name);
}

function unique<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

async function allRecords<T>(
  client: ProRpcClient,
  organizationId: string,
  entity: string,
  schema: z.ZodType<T>,
  range: { from: string; until: string },
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page: { items: T[]; next_cursor: string | null } = await rpc(
      client,
      "professional_list_records",
      z.object({
        items: z.array(schema),
        next_cursor: id.nullable(),
      }),
      {
        p_organization_id: organizationId,
        p_entity: entity,
        p_cursor: cursor,
        p_limit: 100,
        p_from: range.from,
        p_until: range.until,
      },
    );
    rows.push(...page.items);
    cursor = page.next_cursor;
    if (cursor && (seen.has(cursor) || page.items.length === 0)) {
      throw new ProRemoteError(
        "No se pudo completar la lectura del espacio.",
        "pro_invalid_cursor",
      );
    }
    if (cursor) seen.add(cursor);
  } while (cursor);
  return rows;
}

/** La RPC original admite como máximo 93 días; las excepciones deben cubrir todo el periodo. */
async function workspaceRange(
  client: ProRpcClient,
  organizationId: string,
  from: number,
  until: number,
): Promise<ProfessionalWorkspace[]> {
  if (until - from > 90 * 86400000) {
    const middle = Math.min(until, from + 90 * 86400000);
    const first = await workspaceRange(client, organizationId, from, middle);
    return [
      ...first,
      ...(await workspaceRange(client, organizationId, middle, until)),
    ];
  }
  const workspace = await rpc(
    client,
    "professional_get_workspace",
    workspaceSchema,
    {
      p_organization_id: organizationId,
      p_from: new Date(from).toISOString(),
      p_until: new Date(until).toISOString(),
    },
  );
  return [workspace];
}

export async function loadProWorkspace(
  client: ProRpcClient,
  organizationId: string,
  from: string,
  until: string,
): Promise<ProRemoteSnapshot> {
  const start = Date.parse(from);
  const end = Date.parse(until);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 366 * 86400000
  ) {
    throw new ProRemoteError(
      "El periodo de la agenda no es válido.",
      "professional_invalid_input",
    );
  }
  const range = {
    from: new Date(start).toISOString(),
    until: new Date(end).toISOString(),
  };
  const incomplete = new Set<string>();
  const [space, workspaces, spaces, firstOperations, shifts] =
    await Promise.all([
      rpc(client, "pro_get_space", spaceSchema, {
        p_organization_id: organizationId,
      }),
      workspaceRange(client, organizationId, start, end),
      rpc(
        client,
        "professional_list_workspaces",
        z.array(z.object({ id, name: z.string() })),
      ),
      rpc(client, "pro_get_agenda_operations", operationsSchema, {
        p_organization_id: organizationId,
        p_from: range.from,
        p_until: range.until,
        p_limit: 1000,
      }),
      rpc(client, "pro_list_shifts", z.array(shiftSchema), {
        p_organization_id: organizationId,
        p_from: range.from,
        p_until: range.until,
      }),
    ]);
  const workspace = workspaces[0];
  if (
    !workspace ||
    space.organization.id !== organizationId ||
    workspace.settings?.organization_id !== organizationId
  ) {
    throw new ProRemoteError(
      "El espacio todavía no tiene una agenda configurada.",
      "pro_not_configured",
    );
  }
  if (!workspace.permissions.includes("resource.read")) {
    throw new ProRemoteError(
      "Tu acceso al espacio ha cambiado.",
      "professional_forbidden",
    );
  }
  const operations: ProRemoteOperations = {
    ...firstOperations,
    customers: [...firstOperations.customers],
  };
  const seen = new Set<string>();
  let cursor = operations.next_customer_cursor;
  while (cursor) {
    if (seen.has(cursor))
      throw new ProRemoteError(
        "No se pudo completar la lectura de clientes.",
        "pro_invalid_cursor",
      );
    seen.add(cursor);
    const page = await rpc(
      client,
      "pro_get_agenda_operations",
      operationsSchema,
      {
        p_organization_id: organizationId,
        p_from: range.from,
        p_until: range.until,
        p_customer_cursor: cursor,
        p_limit: 1000,
      },
    );
    if (page.customers.length === 0)
      throw new ProRemoteError(
        "No se pudo completar la lectura de clientes.",
        "pro_invalid_cursor",
      );
    operations.customers.push(...page.customers);
    cursor = page.next_customer_cursor;
  }
  operations.next_customer_cursor = null;
  const canReadPeople = workspace.permissions.some((permission) =>
    ["content.manage", "attendees.manage", "finance.read"].includes(permission),
  );
  const [bookings, bundles] = canReadPeople
    ? await Promise.all([
        allRecords(client, organizationId, "bookings", bookingSchema, range),
        allRecords(client, organizationId, "bundles", bundleSchema, range),
      ])
    : [[], []];
  if (shifts.length >= 1000) incomplete.add("shifts");
  const snapshot = mapProWorkspace({
    space,
    workspace: {
      ...workspace,
      bookings,
      bundles,
      sessions: operations.sessions,
      exceptions: unique(workspaces.flatMap((item) => item.exceptions)),
      has_more: false,
    },
    operations,
    spaces,
    shifts,
    range,
    incompleteReasons: [...incomplete],
  });
  if (PRO_VERTICALS[snapshot.data.space.vertical].engine === "tables") {
    const tables = await loadProTableOperations(
      client,
      organizationId,
      range.from,
      range.until,
    );
    snapshot.data = mapProTableData(snapshot.data, tables, snapshot.resources);
  }
  if (PRO_VERTICALS[snapshot.data.space.vertical].engine === "classes") {
    snapshot.data = mapProClassData(snapshot);
    // Sin la migración de extras del motor queda en null y las pantallas de
    // cuidado, salas o interesados enseñan su estado vacío.
    const extras = await loadClassExtras(client, organizationId);
    if (extras) snapshot.data = { ...snapshot.data, classExtras: extras };
  }
  if (PRO_VERTICALS[snapshot.data.space.vertical].engine === "courts") {
    const [resources, courts] = await Promise.all([
      loadProResourceOperations(client, organizationId),
      loadProCourtsState(client, organizationId),
    ]);
    snapshot.data = mapProCourtData(snapshot, resources);
    // Sin la RPC del documento del motor, `courts` queda sin definir y las
    // pantallas de bonos, normas o torneos enseñan su estado vacío.
    if (courts) snapshot.data = { ...snapshot.data, courts };
  }
  return snapshot;
}

function openingHours(
  availability: ProfessionalAvailability[],
): ProSpace["hours"] {
  return Array.from({ length: 7 }, (_, mondayIndex) => {
    const windows = availability.filter(
      (row) =>
        row.resource_id === null && row.weekday === (mondayIndex + 1) % 7,
    );
    return windows.length
      ? {
          open: Math.min(...windows.map((row) => row.start_minute)),
          close: Math.max(...windows.map((row) => row.end_minute)),
        }
      : null;
  });
}

function bookingKind(
  service: ProRemoteService | undefined,
): ProBooking["kind"] {
  switch (service?.mode) {
    case "session":
      return "class";
    case "resource":
      return "court";
    case "group":
      return "table";
    default:
      return "appointment";
  }
}

function customerContact(contact: string | null): {
  phone?: string;
  email?: string;
} {
  const value = contact?.trim();
  if (!value) return {};
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { email: value };
  if (/^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, "").length >= 7) {
    return { phone: value };
  }
  return {};
}

export function mapProWorkspace(input: ProRemoteInput): ProRemoteSnapshot {
  const { space: remote, workspace, operations, range } = input;
  const settings = workspace.settings;
  // Un negocio anterior puede usar sus reservas sin publicar una ficha nueva.
  // La categoría viene del servidor y no concede permisos ni identidad institucional.
  const existingCategory =
    settings && remote.organization.kind === "leisure"
      ? VERTICAL_ORDER.find((vertical) => vertical === settings.category)
      : undefined;
  const profile: NonNullable<typeof remote.profile> | null =
    remote.profile ??
    (existingCategory
      ? {
          organization_id: remote.organization.id,
          vertical: existingCategory,
          public_slug: "",
          description: "",
          address: null,
          hours: [],
          booking_enabled: false,
          card_enabled: false,
          card_discount_pct: 0,
          walk_minutes_to_campus: null,
          campus_university_id: null,
          published: false,
        }
      : null);
  if (!profile || !settings || !settings.enabled) {
    throw new ProRemoteError(
      "El espacio todavía no tiene una agenda configurada.",
      "pro_not_configured",
    );
  }
  const incomplete = new Set(input.incompleteReasons ?? []);
  if (workspace.has_more) incomplete.add("workspace");
  if (operations.next_customer_cursor) incomplete.add("customers");
  if (operations.limits.offers_truncated) incomplete.add("offers");
  if (operations.limits.group_requests_truncated)
    incomplete.add("group_requests");
  if (operations.limits.reviews_truncated) incomplete.add("reviews");
  const permissions = Object.fromEntries(
    workspace.permissions.map((permission) => [permission, true]),
  );
  permissions["finance.manage"] = Boolean(
    permissions["finance.manage"] && operations.can_record_payment,
  );
  const byService = new Map(
    operations.services.map((service) => [service.id, service]),
  );
  const byResource = new Map(
    workspace.resources.map((resource) => [resource.id, resource]),
  );
  const byCustomer = new Map(
    operations.customers.map((customer) => [customer.id, customer]),
  );
  const byMetadata = new Map(
    operations.bookings.map((booking) => [booking.id, booking]),
  );
  const staff = workspace.resources.filter(
    (resource) => resource.kind === "staff" && resource.active,
  );
  const tones: ToneKey[] = [
    "violet",
    "sky",
    "emerald",
    "amber",
    "rose",
    "teal",
    "slate",
  ];
  const space: ProSpace = {
    id: remote.organization.id,
    name: remote.organization.name,
    vertical: profile.vertical,
    city: remote.organization.city ?? "",
    address: profile.address ?? "",
    slug: profile.public_slug,
    demo: remote.organization.demo,
    plan: "unknown",
    timezone: settings.timezone,
    owner: { name: "", firstName: "" },
    hours: openingHours(workspace.availability),
    campus: "",
    walkMinutesToCampus: profile.walk_minutes_to_campus,
    rating: operations.review_stats.rating,
    reviewsCount: operations.review_stats.count,
    publicProfile: {
      published: profile.published,
      description: profile.description,
      photos: 0,
      bookingEnabled:
        profile.booking_enabled && profile.published && settings.public_booking,
      cardEnabled: profile.card_enabled,
      cardDiscountPct: profile.card_discount_pct,
    },
  };
  const bookings: ProBooking[] = workspace.bookings.map((booking) => {
    const metadata = byMetadata.get(booking.id);
    if (!metadata) incomplete.add("booking_metadata");
    const status: ProBooking["status"] =
      booking.status === "attended"
        ? "done"
        : booking.status === "waitlisted"
          ? "requested"
          : booking.status === "confirmed"
            ? (metadata?.phase ?? "confirmed")
            : booking.status;
    return {
      id: booking.id,
      kind: bookingKind(byService.get(booking.service_id)),
      clientId: booking.customer_id,
      clientName:
        booking.customer_name ??
        byCustomer.get(booking.customer_id)?.display_name ??
        "",
      staffId: booking.resource_ids.find(
        (resourceId) => byResource.get(resourceId)?.kind === "staff",
      ),
      resourceId: booking.resource_ids.find(
        (resourceId) => byResource.get(resourceId)?.kind !== "staff",
      ),
      resourceIds: [...booking.resource_ids],
      serviceId: booking.service_id,
      sessionId: booking.session_id ?? undefined,
      start: booking.starts_at,
      end: booking.ends_at,
      blockedUntil: booking.blocked_until,
      reschedule: booking.reschedule
        ? {
            start: booking.reschedule.starts_at,
            expiresAt: booking.reschedule.expires_at,
          }
        : undefined,
      customerAccount: booking.customer_user_id !== null,
      partySize: booking.party_size,
      status,
      priceCents: booking.total_cents,
      paidCents: permissions["finance.read"]
        ? (metadata?.paid_cents ?? null)
        : null,
      source: metadata?.source ?? "unknown",
      note: metadata?.note || undefined,
      trial: metadata?.trial ?? false,
      waitlisted: booking.status === "waitlisted",
    };
  });
  const byBooking = new Map(bookings.map((booking) => [booking.id, booking]));
  const rawBooking = new Map(
    workspace.bookings.map((booking) => [booking.id, booking]),
  );
  const data: ProData = {
    space,
    calendar: {
      range,
      availability: workspace.availability,
      exceptions: workspace.exceptions,
      services: operations.services,
      bookings: workspace.bookings,
      sessions: operations.sessions,
    },
    history: [],
    staff: staff.map((resource, index) => ({
      id: resource.id,
      name: resource.name,
      role: "staff",
      title: "Profesional",
      tone: tones[index % tones.length],
      commissionPct: 0,
      clockedInAt: null,
      weekMinutes: 0,
    })),
    clients: operations.customers.map((customer) => ({
      id: customer.id,
      name: customer.display_name,
      ...customerContact(customer.contact),
      tags: customer.tags,
      visits: customer.visits,
      noShows: customer.no_shows,
      spentCents: permissions["finance.read"] ? customer.spent_cents : null,
      lastVisit: customer.last_visit ?? undefined,
      source: "unknown",
      notes: customer.notes || undefined,
      technical: customer.technical || undefined,
      marketingConsent: customer.marketing_consent,
      cardMember: false,
      createdAt: customer.created_at,
    })),
    services: operations.services
      .filter((service) => service.active)
      .map((service) => {
        const requiredStaff = service.required_resource_ids.filter(
          (resourceId) => byResource.get(resourceId)?.kind === "staff",
        );
        const eligible = service.eligible_staff_ids.length
          ? service.eligible_staff_ids
          : requiredStaff.length
            ? requiredStaff
            : staff.map((person) => person.id);
        return {
          id: service.id,
          name: service.name,
          category: service.category,
          durationMin: service.duration_minutes,
          priceCents: service.price_cents,
          staffIds: eligible.filter((resourceId) =>
            staff.some((person) => person.id === resourceId),
          ),
          online: service.online,
        };
      }),
    bookings,
    payments: permissions["finance.read"]
      ? operations.payments.map((payment) => {
          const booking = byBooking.get(payment.booking_id);
          return {
            id: payment.id,
            at: payment.recorded_at,
            bookingId: payment.booking_id,
            clientName: booking?.clientName ?? "",
            staffId: booking?.staffId,
            concept:
              rawBooking.get(payment.booking_id)?.price_snapshot.service_name ??
              "Cobro registrado",
            amountCents: payment.amount_cents,
            tipCents: payment.tip_cents,
            method: payment.method,
          };
        })
      : [],
    reviews: remote.reviews.map((review) => ({
      id: review.id,
      clientName: review.author,
      rating: review.rating,
      text: review.body,
      at: review.created_at,
      reply: review.reply ?? undefined,
      verifiedVisit: true,
    })),
    offers: [],
    shifts: [],
    groupRequests: [],
    inbox: [],
    campaigns: [],
    tables: [],
    menu: [],
    dailyMenu: null,
    loyalty: null,
    validations: [],
    events: [],
    promoters: [],
    guests: [],
    zones: [],
    classTypes: [],
    sessions: [],
    plans: [],
    members: [],
    resources: [],
    openMatches: [],
    properties: [],
    leads: [],
    visits: [],
    tenants: [],
    incidents: [],
    communityMembers: [],
    activities: [],
    announcements: [],
    sponsors: [],
    board: [],
    subsidies: [],
    uniMetrics: [],
    uniPublications: [],
    uniWelcome: [],
    uniHousing: [],
    uniAssociations: [],
    uniModeration: [],
  };
  const incompleteAgenda = [
    "workspace",
    "customers",
    "sessions",
    "booking_metadata",
  ].some((reason) => incomplete.has(reason));
  return {
    data,
    permissions,
    spaces: input.spaces,
    complete: !incompleteAgenda,
    range,
    settings,
    availability: workspace.availability,
    exceptions: workspace.exceptions,
    resources: workspace.resources,
    services: operations.services,
    bookings: workspace.bookings,
    customers: operations.customers,
    bundles: workspace.bundles,
    shifts: input.shifts,
    incompleteReasons: [...incomplete],
  };
}
