import type {
  ProfessionalAvailability,
  ProfessionalBooking,
  ProfessionalBundle,
  ProfessionalCustomer,
  ProfessionalException,
  ProfessionalResource,
  ProfessionalService,
  ProfessionalSession,
  ProfessionalSettings,
  ProfessionalWorkspace,
} from "../professional-services";
import type {
  ProClientSource,
  ProData,
  ProSpace,
  ProVerticalId,
} from "./types";

export interface ProRpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}

export type ProRemoteService = ProfessionalService & {
  category: string;
  online: boolean;
  eligible_staff_ids: string[];
};

export type ProRemoteCustomer = ProfessionalCustomer & {
  notes: string;
  technical: string;
  tags: string[];
  marketing_consent: boolean;
  consent_recorded_at: string | null;
  visits: number;
  no_shows: number;
  last_visit: string | null;
  spent_cents: number | null;
};

export type ProRemoteBookingMetadata = {
  id: string;
  phase: "arrived" | "in_service" | null;
  note: string;
  source: ProClientSource | null;
  trial: boolean;
  paid_cents: number | null;
};

export type ProRemotePayment = {
  id: string;
  organization_id: string;
  booking_id: string;
  amount_cents: number;
  tip_cents: number;
  method: "card" | "cash" | "bizum";
  recorded_at: string;
};

export type ProRemoteOperations = {
  customers: ProRemoteCustomer[];
  next_customer_cursor: string | null;
  services: ProRemoteService[];
  sessions: ProfessionalSession[];
  bookings: ProRemoteBookingMetadata[];
  payments: ProRemotePayment[];
  can_record_payment: boolean;
  review_stats: { rating: number | null; count: number };
  limits: {
    offers_truncated: boolean;
    reviews_truncated: boolean;
    group_requests_truncated: boolean;
  };
};

export type ProRemoteShift = {
  id: string;
  organization_id: string;
  user_id: string;
  in_at: string;
  out_at: string | null;
  break_minutes: number;
};

export type ProRemoteTable = {
  id: string;
  resource_id: string;
  organization_id: string;
  name: string;
  capacity: number;
  active: boolean;
  zone: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "square" | "round" | "bar";
  exclusive: boolean;
  cleaning_minutes: number;
  version: number;
};

export type ProRemoteTableBookingOperation = {
  booking_id: string;
  organization_id: string;
  table_id: string;
  seated_at: string | null;
  left_at: string | null;
  cleaned_at: string | null;
  cleaning_minutes: number;
};

export type ProRemoteTableWaitlistEntry = {
  id: string;
  organization_id: string;
  customer_id: string;
  customer_name: string;
  customer_contact?: string | null;
  service_id: string;
  party_size: number;
  requested_at: string;
  expires_at: string;
  status: "waiting" | "expired" | "seated" | "cancelled";
  booking_id: string | null;
  service_version: number;
  expected_total_cents: number | null;
  note?: string;
};

export type ProRemoteTableOperations = {
  tables: ProRemoteTable[];
  unmapped_resource_ids: string[];
  waitlist: ProRemoteTableWaitlistEntry[];
  booking_operations: ProRemoteTableBookingOperation[];
  can_manage: boolean;
  can_operate: boolean;
};

export type ProRemoteResourceOperations = {
  resources: {
    id: string;
    organization_id: string;
    name: string;
    kind: "court" | "room" | "desk";
    capacity: number;
    active: boolean;
    allocation_mode: "exclusive" | "shared";
    capacity_unit: "concurrent_bookings" | "people";
    configured: boolean;
    version: number | null;
  }[];
  can_manage: boolean;
};

export type ProRemoteProfile = {
  organization_id: string;
  vertical: ProVerticalId;
  public_slug: string;
  description: string;
  address: string | null;
  hours: ProSpace["hours"];
  booking_enabled: boolean;
  card_enabled: boolean;
  card_discount_pct: number;
  walk_minutes_to_campus: number | null;
  campus_university_id: string | null;
  published: boolean;
};

export type ProRemoteReview = {
  id: string;
  rating: number;
  body: string;
  reply: string | null;
  created_at: string;
  author: string;
};

export type ProRemoteSpace = {
  organization: {
    id: string;
    name: string;
    city: string | null;
    kind: string;
    demo: boolean;
  };
  profile: ProRemoteProfile | null;
  offers: unknown[];
  menu: unknown[];
  daily_menu: unknown;
  group_requests: unknown[];
  reviews: ProRemoteReview[];
  promoters: unknown[];
};

export type ProWorkspaceSummary = { id: string; name: string };

/** Conserva el contrato operativo para disponibilidad y acciones, sin reconstruirlo desde la UI. */
export type ProRemoteSnapshot = {
  data: ProData;
  permissions: Record<string, boolean>;
  spaces: ProWorkspaceSummary[];
  /** La agenda, sus clientes y sus importes se han leído completos. */
  complete: boolean;
  range: { from: string; until: string };
  availability: ProfessionalAvailability[];
  exceptions: ProfessionalException[];
  settings: ProfessionalSettings;
  resources: ProfessionalResource[];
  services: ProRemoteService[];
  bookings: ProfessionalBooking[];
  customers: ProRemoteCustomer[];
  bundles: ProfessionalBundle[];
  shifts: ProRemoteShift[];
  /** También recoge límites de módulos secundarios, que no bloquean la agenda. */
  incompleteReasons: string[];
};

export type ProRemoteInput = {
  space: ProRemoteSpace;
  workspace: ProfessionalWorkspace;
  operations: ProRemoteOperations;
  spaces: ProWorkspaceSummary[];
  shifts: ProRemoteShift[];
  range: { from: string; until: string };
  incompleteReasons?: string[];
};

export class ProRemoteError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ProRemoteError";
  }
}
