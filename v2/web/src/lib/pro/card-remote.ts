import { z } from "zod";
import {
  parseCardCredential,
  type CardMerchant,
  type CardRequest,
  type CardRequestInput,
  type CardOffer,
  type CardProgram,
} from "../../../../shared/franky-card";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const id = z.string().min(1);
const cents = z.number().int().nonnegative();
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));

const offerSchema: z.ZodType<CardOffer> = z.object({
  id,
  venue_id: id,
  version: z.number().int(),
  title: z.string(),
  kind: z.enum(["base", "campaign"]),
  percent: z.number().int().min(0).max(100),
  service_keys: z.array(id),
  minimum_cents: cents,
  starts_at: date,
  ends_at: date.nullable(),
  student_only: z.boolean(),
  minimum_age: z.number().int().nullable(),
  terms: z.string(),
  status: z.enum(["draft", "pending", "active", "retired"]),
  max_redemptions: cents.nullable().optional(),
  max_per_user: cents.nullable().optional(),
  budget_cents: cents.nullable().optional(),
  timezone: z.string().optional(),
  validity_windows: z
    .array(
      z.object({
        weekday: z.number().int(),
        start_minute: cents,
        end_minute: cents,
      }),
    )
    .optional(),
});
const programSchema: z.ZodType<CardProgram> = z.object({
  id,
  venue_id: id,
  version: z.number().int(),
  title: z.string(),
  service_keys: z.array(id),
  required_stamps: z.number().int().positive(),
  reward_service_key: id,
  reward_label: z.string(),
  reward_max_cents: cents,
  terms: z.string(),
  status: z.enum(["active", "retired"]),
});
const moneySchema = z
  .object({
    gross_cents: cents,
    public_price_cents: cents,
    discount_cents: cents,
    final_cents: cents,
    incremental_savings_cents: cents,
    currency: z.literal("eur"),
  })
  .refine(
    (money) =>
      money.gross_cents - money.discount_cents === money.final_cents &&
      money.final_cents <= money.public_price_cents,
  );
const requestSchema: z.ZodType<CardRequest> = z.object({
  id,
  kind: z.enum(["discount", "loyalty", "reward", "protected"]),
  status: z.enum([
    "pending",
    "customer_confirmed",
    "completed",
    "rejected",
    "expired",
  ]),
  venue_id: id,
  venue_name: z.string(),
  organization_id: id,
  expires_at: date,
  created_at: date,
  completed_at: date.nullable(),
  lines: z
    .array(
      z.object({
        id,
        label: z.string(),
        service_key: id,
        gross_cents: cents,
        public_price_cents: cents,
        discount_cents: cents,
        final_cents: cents,
        incremental_savings_cents: cents,
        reversed: z.boolean(),
      }),
    )
    .min(1),
  money: moneySchema,
  offer: offerSchema.nullable(),
  program: programSchema.nullable(),
  customer_confirmed: z.boolean(),
  merchant_confirmed: z.boolean(),
  actor: z.enum(["customer", "merchant"]),
  identity: z
    .object({ full_name: z.string(), photo_path: z.string().nullable() })
    .nullable(),
  consumption_id: id.nullable(),
  external_reference: z.string().nullable(),
  booking_id: id.nullable(),
  expected_external_reference: z.string().nullable(),
  demo: z.boolean(),
});
const merchantSchema: z.ZodType<CardMerchant> = z.object({
  enabled: z.boolean(),
  demo: z.boolean(),
  organization_id: id,
  permissions: z.object({
    manage: z.boolean(),
    redeem: z.boolean(),
    finance: z.boolean(),
    reverse: z.boolean(),
  }),
  venues: z.array(
    z.object({
      id,
      organization_id: id,
      name: z.string(),
      city: z.string(),
      category: z.string(),
      address: z.string(),
      timezone: z.string(),
      status: z.enum(["pending", "active", "suspended"]),
      agreement_version: z.string(),
      offers: z.array(offerSchema),
      programs: z.array(programSchema),
    }),
  ),
  pending_requests: z.array(requestSchema),
  totals: z
    .object({
      confirmed_consumptions: cents,
      gross_cents: cents,
      discount_cents: cents,
      reversed_savings_cents: cents,
    })
    .nullable(),
});

const ERRORS: Record<string, string> = {
  auth_required: "La sesión ha cambiado. Vuelve a abrir tu negocio.",
  card_forbidden:
    "Tu acceso a Franky Card ha cambiado. Vuelve a abrir el negocio.",
  card_disabled: "Franky Card está pendiente de activación en este negocio.",
  card_invalid_input: "Revisa el servicio y los importes.",
  card_invalid_response:
    "No hemos podido verificar la respuesta. Actualiza antes de continuar.",
  card_credential_invalid:
    "Pide al estudiante que abra un código nuevo de su Franky Card.",
  card_membership_inactive: "Esta tarjeta de descuentos no está activa.",
  card_offer_unavailable:
    "Esta oferta no está disponible para el servicio elegido.",
  card_campaign_schedule: "La campaña no está disponible en este horario.",
  card_campaign_exhausted:
    "La campaña ha alcanzado su límite. Elige otra ventaja.",
  card_request_expired:
    "La solicitud ha caducado. Pide al estudiante un código nuevo.",
  card_customer_confirmation_required:
    "Espera a que el estudiante confirme en su móvil.",
  card_request_conflict:
    "Recupera el intento anterior antes de iniciar otra operación.",
  card_receipt_duplicate:
    "Ese ticket ya tiene una operación registrada. Revisa el historial de Card.",
  card_profile_required:
    "El estudiante necesita completar el nombre y la foto de su Card.",
  mfa_required: "Activa la verificación en dos pasos para validar tarjetas.",
};

export class ProCardError extends Error {
  constructor(public readonly code: string) {
    super(
      ERRORS[code] ??
        "No hemos podido confirmar la operación. Puedes volver a intentarlo.",
    );
  }
}

export function publicCardError(error: unknown): string {
  return error instanceof ProCardError
    ? error.message
    : new ProCardError("card_unavailable").message;
}

export function cardRequestState(
  request: CardRequest,
  now = Date.now(),
): CardRequest["status"] {
  return ["pending", "customer_confirmed"].includes(request.status) &&
    Date.parse(request.expires_at) <= now
    ? "expired"
    : request.status;
}

export type SingleServiceCardInput = {
  venueId: string;
  offerId: string;
  serviceId: string;
  serviceName: string;
  grossCents: number;
  publicPriceCents: number;
  credential: string;
};

/** Una unidad real del catálogo. No convierte un ticket mixto en una unidad artificial. */
export class ProCardSession {
  private active = true;
  private busy = false;
  private merchant: CardMerchant | null = null;
  private operation: CardRequest | null = null;
  private attempt: { fingerprint: string; key: string } | null = null;
  private confirmationReference: string | null = null;

  constructor(
    private readonly rpc: Rpc,
    private readonly organizationId: string,
    private readonly isCurrent: () => boolean = () => true,
  ) {}

  dispose() {
    this.active = false;
    this.merchant = null;
    this.operation = null;
    this.attempt = null;
    this.confirmationReference = null;
  }

  private assertCurrent() {
    if (!this.active || !this.isCurrent()) {
      this.dispose();
      throw new ProCardError("auth_required");
    }
  }

  private async call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertCurrent();
    try {
      const value = await this.rpc(name, args);
      this.assertCurrent();
      return value;
    } catch (error) {
      this.assertCurrent();
      if (error instanceof ProCardError) throw error;
      const code =
        error instanceof Error && Object.hasOwn(ERRORS, error.message)
          ? error.message
          : "card_unavailable";
      if (code === "auth_required" || code === "card_forbidden") this.dispose();
      throw new ProCardError(code);
    }
  }

  private accept(
    value: unknown,
    expected?: { id?: string; input?: SingleServiceCardInput },
  ): CardRequest {
    const parsed = requestSchema.safeParse(value);
    if (!parsed.success) throw new ProCardError("card_invalid_response");
    const operation = parsed.data;
    if (expected?.id && operation.id !== expected.id)
      throw new ProCardError("card_invalid_response");
    if (expected?.input) {
      const input = expected.input;
      const line = operation.lines[0];
      if (
        operation.venue_id !== input.venueId ||
        operation.kind !== "discount" ||
        operation.offer?.id !== input.offerId ||
        operation.lines.length !== 1 ||
        line.id !== "unit-1" ||
        line.service_key !== input.serviceId ||
        line.gross_cents !== input.grossCents ||
        line.public_price_cents !== input.publicPriceCents
      ) {
        throw new ProCardError("card_invalid_response");
      }
    }
    if (
      operation.organization_id !== this.organizationId ||
      operation.actor !== "merchant" ||
      operation.demo
    ) {
      this.dispose();
      throw new ProCardError("card_forbidden");
    }
    if (
      !this.merchant?.venues.some(
        (venue) =>
          venue.id === operation.venue_id &&
          venue.organization_id === this.organizationId,
      )
    ) {
      throw new ProCardError("card_forbidden");
    }
    if (
      operation.status === "customer_confirmed" &&
      !operation.customer_confirmed
    )
      throw new ProCardError("card_invalid_response");
    if (
      operation.status === "completed" &&
      (!operation.consumption_id ||
        !operation.completed_at ||
        !operation.customer_confirmed ||
        !operation.merchant_confirmed ||
        !operation.external_reference)
    ) {
      throw new ProCardError("card_invalid_response");
    }
    this.operation = operation;
    return operation;
  }

  async loadMerchant(): Promise<CardMerchant | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const parsed = merchantSchema.safeParse(
        await this.call("get_franky_card_merchant", {
          p_organization_id: this.organizationId,
        }),
      );
      if (!parsed.success) throw new ProCardError("card_invalid_response");
      if (
        parsed.data.organization_id !== this.organizationId ||
        parsed.data.demo
      )
        throw new ProCardError("card_forbidden");
      if (
        parsed.data.venues.some(
          (venue) => venue.organization_id !== this.organizationId,
        )
      )
        throw new ProCardError("card_forbidden");
      this.merchant = parsed.data;
      return parsed.data;
    } finally {
      this.busy = false;
    }
  }

  async create(input: SingleServiceCardInput): Promise<CardRequest | null> {
    if (this.busy) return null;
    this.assertCurrent();
    const credential = parseCardCredential(input.credential);
    if (!credential) throw new ProCardError("card_credential_invalid");
    const venue = this.merchant?.venues.find(
      (item) => item.id === input.venueId,
    );
    const offer = venue?.offers.find((item) => item.id === input.offerId);
    if (!this.merchant?.enabled) throw new ProCardError("card_disabled");
    if (!this.merchant.permissions.redeem)
      throw new ProCardError("card_forbidden");
    if (
      !venue ||
      venue.status !== "active" ||
      !offer ||
      offer.status !== "active" ||
      offer.venue_id !== venue.id ||
      (!offer.service_keys.includes("*") &&
        !offer.service_keys.includes(input.serviceId))
    )
      throw new ProCardError("card_offer_unavailable");
    if (
      !input.serviceId ||
      !input.serviceName.trim() ||
      !Number.isSafeInteger(input.grossCents) ||
      !Number.isSafeInteger(input.publicPriceCents) ||
      input.grossCents < 1 ||
      input.grossCents > 1_000_000 ||
      input.publicPriceCents < 0 ||
      input.publicPriceCents > input.grossCents
    )
      throw new ProCardError("card_invalid_input");
    if (
      this.operation &&
      ["pending", "customer_confirmed"].includes(
        cardRequestState(this.operation),
      )
    )
      throw new ProCardError("card_request_conflict");
    const args: Omit<CardRequestInput, "p_request_key"> = {
      p_venue_id: venue.id,
      p_token: credential,
      p_kind: "discount",
      p_offer_id: offer.id,
      p_program_id: null,
      p_lines: [
        {
          id: "unit-1",
          label: input.serviceName.trim(),
          service_key: input.serviceId,
          gross_cents: input.grossCents,
          public_price_cents: input.publicPriceCents,
        },
      ],
    };
    // La huella y el localizador viven sólo en memoria durante el intento incierto.
    const fingerprint = JSON.stringify(args);
    if (this.attempt && this.attempt.fingerprint !== fingerprint)
      throw new ProCardError("card_request_conflict");
    this.attempt ??= { fingerprint, key: crypto.randomUUID() };
    this.busy = true;
    try {
      const operation = this.accept(
        await this.call("create_franky_card_request", {
          ...args,
          p_request_key: this.attempt.key,
        }),
        { input },
      );
      this.attempt = null;
      this.confirmationReference = null;
      return operation;
    } catch (error) {
      // Los errores de negocio confirman el rechazo. Una respuesta perdida conserva la clave.
      if (
        error instanceof ProCardError &&
        ![
          "card_unavailable",
          "card_invalid_response",
          "card_request_conflict",
        ].includes(error.code)
      )
        this.attempt = null;
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async read(requestId: string): Promise<CardRequest | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const value = await this.call("get_franky_card_request", {
        p_request_id: requestId,
      });
      return this.accept(value, { id: requestId });
    } finally {
      this.busy = false;
    }
  }

  async respond(
    action: "confirm" | "reject",
    reference = "",
  ): Promise<CardRequest | null> {
    if (this.busy) return null;
    this.assertCurrent();
    const operation = this.operation;
    if (!operation) throw new ProCardError("card_invalid_input");
    const state = cardRequestState(operation);
    if (state === "expired") throw new ProCardError("card_request_expired");
    if (state === "completed" || state === "rejected") return operation;
    let receipt: string | null = null;
    if (action === "confirm") {
      if (
        state !== "customer_confirmed" ||
        !operation.customer_confirmed ||
        !operation.identity
      )
        throw new ProCardError("card_customer_confirmation_required");
      receipt = operation.expected_external_reference ?? reference.trim();
      if (receipt.length < 3 || receipt.length > 120)
        throw new ProCardError("card_invalid_input");
      if (this.confirmationReference && this.confirmationReference !== receipt)
        throw new ProCardError("card_request_conflict");
      this.confirmationReference = receipt;
    }
    this.busy = true;
    try {
      return this.accept(
        await this.call("respond_franky_card_request", {
          p_request_id: operation.id,
          p_action: action,
          p_external_reference: receipt,
        }),
        { id: operation.id },
      );
    } finally {
      this.busy = false;
    }
  }

  reset() {
    if (
      this.busy ||
      this.attempt ||
      (this.operation &&
        ["pending", "customer_confirmed"].includes(
          cardRequestState(this.operation),
        ))
    ) {
      throw new ProCardError("card_request_conflict");
    }
    this.operation = null;
    this.confirmationReference = null;
  }
}
