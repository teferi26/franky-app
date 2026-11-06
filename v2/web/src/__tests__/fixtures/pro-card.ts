import type {
  CardMerchant,
  CardOffer,
  CardRequest,
} from "../../../../shared/franky-card";
import type { SingleServiceCardInput } from "@/lib/pro/card-remote";

export const cardOffer: CardOffer = {
  id: "offer-a",
  venue_id: "venue-a",
  version: 1,
  title: "Ventaja del local",
  kind: "base",
  percent: 10,
  service_keys: ["service-a"],
  minimum_cents: 0,
  starts_at: "2026-01-01T00:00:00Z",
  ends_at: null,
  student_only: true,
  minimum_age: null,
  terms: "Condiciones de la oferta",
  status: "active",
};

export function cardRequest(patch: Partial<CardRequest> = {}): CardRequest {
  return {
    id: "request-a",
    kind: "discount",
    status: "pending",
    venue_id: "venue-a",
    venue_name: "Local autorizado",
    organization_id: "org-a",
    expires_at: new Date(Date.now() + 120_000).toISOString(),
    created_at: new Date().toISOString(),
    completed_at: null,
    lines: [
      {
        id: "unit-1",
        label: "Servicio del catálogo",
        service_key: "service-a",
        gross_cents: 2000,
        public_price_cents: 2000,
        discount_cents: 200,
        final_cents: 1800,
        incremental_savings_cents: 200,
        reversed: false,
      },
    ],
    money: {
      gross_cents: 2000,
      public_price_cents: 2000,
      discount_cents: 200,
      final_cents: 1800,
      incremental_savings_cents: 200,
      currency: "eur",
    },
    offer: cardOffer,
    program: null,
    customer_confirmed: false,
    merchant_confirmed: false,
    actor: "merchant",
    identity: null,
    consumption_id: null,
    external_reference: null,
    booking_id: null,
    expected_external_reference: null,
    demo: false,
    ...patch,
  };
}

export function cardMerchant(): CardMerchant {
  return {
    enabled: true,
    demo: false,
    organization_id: "org-a",
    permissions: { manage: true, redeem: true, finance: true, reverse: true },
    venues: [
      {
        id: "venue-a",
        organization_id: "org-a",
        name: "Local autorizado",
        city: "Madrid",
        category: "hairdresser",
        address: "Calle de prueba",
        timezone: "Europe/Madrid",
        status: "active",
        agreement_version: "2026-adhesion-v1",
        offers: [cardOffer],
        programs: [],
      },
    ],
    pending_requests: [],
    totals: null,
  };
}

export const singleServiceInput: SingleServiceCardInput = {
  venueId: "venue-a",
  offerId: "offer-a",
  serviceId: "service-a",
  serviceName: "Servicio del catálogo",
  grossCents: 2000,
  publicPriceCents: 2000,
  credential: "a".repeat(64),
};

export function completedCardRequest(): CardRequest {
  return cardRequest({
    status: "completed",
    customer_confirmed: true,
    merchant_confirmed: true,
    consumption_id: "consumption-a",
    completed_at: new Date().toISOString(),
    external_reference: "ticket-42",
  });
}
