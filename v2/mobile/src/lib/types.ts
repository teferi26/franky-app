// Tipos alineados con el esquema real de Supabase (supabase/migrations)
export interface University {
  id: string; name: string; slug: string; short_name: string | null;
  type: 'publica' | 'privada'; city: string; comunidad_autonoma: string;
  description: string | null; founded_year: number | null; student_count: number | null;
  campus_count: number | null; image_url: string | null; logo_url: string | null;
  ranking_national: number | null; website: string | null;
  wiki_link?: string | null;
  address?: string | null;
  institutional_sources?: unknown;
}
export interface Career {
  id: string; university_id: string; name: string; branch: string;
  degree_type: 'grado' | 'doble_grado' | 'master'; duration_years: number | null;
  credits: number | null; cut_off_score: number | null; cut_off_year: number | null; admission_without_cutoff?: boolean;
  // Nota del curso anterior (solo se enseña con el conmutador "Ver notas 25/26").
  cut_off_score_prev?: number | null; cut_off_year_prev?: number | null;
  cut_off_round_prev?: string | null; cut_off_source_url_prev?: string | null;
  places_offered: number | null; modality: string | null; campus: string | null;
  avg_salary: number | null; employment_rate: number | null; description: string | null;
  academic_sources?: unknown;
  universities?: { name: string; short_name: string | null } | null;
}
export interface Scholarship {
  id: string; name: string; provider: string;
  type: 'nacional' | 'autonomica' | 'privada' | 'europea' | 'internacional';
  description: string | null; amount_min: number | null; amount_max: number | null;
  opens_at?: string | null; closes_at?: string | null;
  deadline: string | null; url: string | null; comunidad_autonoma: string | null;
  is_active: boolean | null;
  target_audience: string[] | null;
  income_threshold: number | null; gpa_requirement: number | null;
  /** Qué cubre la beca (matricula, manutencion, practicas_remuneradas…). Ya
   *  llegaba con el select('*'); faltaba declararla para poder filtrar por
   *  tipo de ayuda (dinero vs prácticas vs movilidad). */
  coverage: string[] | null;
}
export interface EventItem {
  id: string; title: string; description: string | null; city: string;
  venue: string | null; address: string | null; start_date: string; end_date: string | null;
  category: string; price: number | null; max_capacity: number | null;
  image_url: string | null; is_featured: boolean | null; status: string | null;
  // payment_mode (migración 097) decide el CTA: 'free' gratis, 'app' compra en la
  // app, 'info' solo informa (no vende). organizer_id permite ocultar "Comprar"
  // en tus propios eventos (el RPC ya lo prohíbe con error).
  payment_mode?: 'free' | 'app' | 'info' | null; organizer_id?: string | null;
  // 128: punto exacto elegido al crear desde la app (prioridad en el mapa).
  latitude?: number | null; longitude?: number | null;
  // 164: is_official = "Evento Franky" (lo pone la BD según el rol del
  // organizador, nunca el formulario). shirts_enabled = se reparten camisetas y
  // se pregunta la talla a quien participa.
  is_official?: boolean | null; shirts_enabled?: boolean | null;
  price_without_shirt?: number | null; price_with_shirt?: number | null;
  // Crush Live solo se muestra en eventos oficiales habilitados por Franky.
  crush_live_enabled?: boolean | null;
}

/** Tallas de camiseta de un evento (164). Mismo juego que la web. */
export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ninguna'] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];
export interface LeisureSpot {
  id: string; name: string; city: string; category: string; description: string | null;
  address: string | null; price_range: number | null; rating: number | null;
  image_url: string | null; tags: string[] | null; google_maps_url: string | null;
  tagline?: string | null; website?: string | null; phone?: string | null;
  latitude?: number | null; longitude?: number | null;
  details?: {
    why_go?: string[] | null; highlights?: string[] | null;
    best_time?: string | null; student_tip?: string | null;
    price_text?: string | null; opening_hours_text?: string | null;
    sources?: { titulo?: string | null; url: string }[] | null;
  } | null;
}
export interface Accommodation {
  id: string; title: string; description: string | null;
  type: 'piso_completo' | 'habitacion' | 'estudio' | 'residencia';
  price: number; city: string; address: string | null; rooms: number | null;
  bathrooms: number | null; sqm: number | null; amenities: string[] | null;
  images: string[] | null; is_verified: boolean | null; available_from: string | null;
  // Datos de contacto reales (migración 029) y estado (001): sin ellos la ficha
  // del piso no ofrece ninguna vía de contacto que funcione. owner_id permite
  // ocultar el contacto en tus propios anuncios.
  status?: 'active' | 'inactive' | 'rented' | null; owner_id?: string | null;
  contact_email?: string | null; whatsapp?: string | null; instagram?: string | null;
}
// Autor que devuelven los RPCs de FOMO/Ligar (null en posts anónimos).
export interface FomoAuthor {
  id: string | null; full_name: string | null; avatar_url: string | null;
  age: number | null; university_id: string | null;
  is_organization?: boolean; organization_id?: string; verified?: boolean;
}
export interface FomoPollOption {
  id: string; position: number; label: string; vote_count: number;
}
export interface FomoPoll {
  id: string; question: string; options: FomoPollOption[];
  total_votes: number; my_option_id: string | null;
}
export interface FomoThread {
  id: string; university_id: string; is_anonymous: boolean;
  // 'video' entró con la migración 132 y el tipo se quedó sin actualizar, así
  // que las pantallas que hacían switch por media_type simplemente no pintaban
  // los vídeos (la Lupa, el detalle del post, el muro de la uni).
  body: string | null; media_url: string | null; media_type: 'image' | 'audio' | 'video' | null;
  reply_count: number; reaction_count: number; created_at: string;
  author: FomoAuthor | null;
  poll: FomoPoll | null;
  my_reaction: boolean; is_mine: boolean; is_hidden?: boolean;
}
// Autor de un post de Ligar (null en posts anónimos). opted_in decide si se
// puede mostrar el CTA de pedir Instagram; id permite request_ig y abrir perfil.
export interface LigarAuthor {
  id: string; full_name: string | null; avatar_url: string | null;
  age: number | null; opted_in: boolean;
}
export interface LigarPost {
  id: string; university_id: string; is_anonymous: boolean;
  body: string | null; offer: string | null; audience: 'todos' | 'hombre' | 'mujer';
  media_url: string | null; media_type: 'image' | 'audio' | 'video' | null;
  reaction_count: number; created_at: string;
  author: LigarAuthor | null;
  my_reaction: boolean; is_mine: boolean;
}
export interface RoomieCandidate {
  id: string; full_name: string | null; avatar_url: string | null;
  career: string | null; academic_year: number | null; bio: string | null;
  city: string | null; interests: string[] | null;
  /** null = no hay porcentaje honesto que enseñar (ver compatibility_reason). */
  compatibility: number | null;
  age?: number | null;        // calculada en SQL (migración 108)
  birth_date?: string | null; // legado: solo llega si la 108 no está aplicada aún
  // ── 158: datos REALES del perfil (opcionales para que la app siga
  // funcionando si la migración aún no está aplicada en producción) ──
  photos?: string[] | null;
  hobbies?: string[] | null;
  budget_min?: number | null;
  budget_max?: number | null;
  university?: string | null;
  university_name?: string | null;
  is_verified?: boolean | null;
  smoking?: string | null;
  partying?: string | null;
  study_habits?: string | null;
  sleep_schedule?: string | null;
  cleanliness?: string | null;
  noise_tolerance?: string | null;
  friends_at_home?: string | null;
  pet_friendly?: string | null;
  /** 157: la persona ha rellenado DE VERDAD el cuestionario. */
  lifestyle_answered?: boolean | null;
  /** 157: por qué no hay porcentaje. 'me' = falta el MÍO. */
  compatibility_reason?: 'ok' | 'me' | 'them' | 'both' | null;
  /**
   * @deprecated Columnas JSONB fósiles de la migración 001 que NADIE escribe
   * nunca. La 158 dejó de enviarlas: pintaban el mismo valor por defecto en
   * todos los perfiles ("Limpieza 3/5", "Presupuesto 200 a 500 €/mes"…). No
   * volver a leerlas.
   */
  lifestyle_preferences?: Record<string, unknown> | null;
  housing_preferences?: { budget_min?: number; budget_max?: number; preferred_zone?: string; preferred_type?: string } | null;
}
// ── Chats (RPC get_my_chats + tabla messages, migraciones 017/018/093) ──
export interface ChatListItem {
  id: string; is_group: boolean; conversation_type: 'group' | 'direct';
  group_name: string | null; group_avatar_url: string | null; member_count: number;
  other_user: { id: string; full_name: string | null; avatar_url: string | null; university: string | null } | null;
  last_message: string | null; last_message_at: string | null; unread_count: number;
}
export interface ChatMessage {
  id: string; conversation_id: string; sender_id: string;
  content: string | null; message_type: 'text' | 'image' | 'audio' | 'system';
  // attachment_url es el PATH dentro del bucket chat-media (no una URL):
  // para mostrarlo hace falta createSignedUrl(path, 3600).
  attachment_url: string | null;
  attachment_meta: { mime?: string; size?: number; width?: number; height?: number; duration?: number; name?: string } | null;
  created_at: string; read_at: string | null;
}
// ── Entradas de eventos (tabla event_tickets, el QR es qr_token) ──
export interface EventTicket {
  id: string; event_id: string; qr_token: string;
  status: 'valid' | 'used' | 'refunded' | 'pending_payment';
  /** Hasta cuándo la reserva sin pagar guarda la plaza (migración 165). */
  reserved_until?: string | null;
  price_cents: number | null; created_at: string;
  event?: Pick<EventItem, 'id' | 'title' | 'start_date' | 'venue' | 'city' | 'image_url'> | null;
}
// ── Cartera del organizador (tabla payments, RLS: el vendedor lee lo suyo) ──
export interface SellerPayment {
  id: string;
  type: 'ticket' | 'visit' | 'rent';
  amount_cents: number;
  application_fee_cents: number;
  refunded_cents: number;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded' | 'canceled';
  created_at: string;
  metadata: { event_id?: string } | null;
}
// ── Factura de Stripe (GET /api/stripe/invoices de la web) ──
export interface StripeInvoice {
  id: string;
  number: string | null;
  created: number; // epoch segundos
  total_cents: number;
  currency: string;
  status: string | null;
  description: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}
// ── Perfil de Crush (RPC get_ligar_profile / set_ligar_profile, 082) ──
export interface LigarProfile {
  eligible: boolean; age: number | null; instagram_handle: string | null;
  opted_in: boolean; university_id: string | null;
}

// ── Crush Live: descubrimiento romántico dentro de eventos Franky ────────
export type CrushLiveGoal = 'conocer' | 'dejarse_llevar' | 'relacion';
export type CrushLiveGender = 'hombre' | 'mujer' | 'no_binario';
export type CrushLiveAction = 'like' | 'pass';

export interface CrushLiveAnswers {
  social_energy: number;
  spontaneity: number;
  communication: number;
  affection: number;
  schedule: number;
}

export interface CrushLiveEvent {
  id: string;
  title: string;
  image_url: string | null;
  start_date: string;
  end_date: string | null;
  status: string | null;
  enrolled?: boolean;
}

export interface CrushLiveProfile {
  active: boolean;
  goal: CrushLiveGoal | null;
  preferred_genders: CrushLiveGender[];
  age_min: number;
  age_max: number;
  answers: CrushLiveAnswers | null;
}

export interface CrushLiveState {
  event: CrushLiveEvent | null;
  available: boolean;
  reason: string | null;
  participant: boolean;
  eligible: boolean;
  age: number | null;
  student_verified: boolean;
  profile: CrushLiveProfile | null;
}

export interface CrushLiveCandidate {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  photos: string[] | null;
  age: number | null;
  career: string | null;
  bio: string | null;
  interests: string[] | null;
  compatibility: number;
  compatibility_reasons: string[];
}

export interface CrushLiveMatch {
  id: string;
  user: Pick<CrushLiveCandidate, 'id' | 'full_name' | 'avatar_url' | 'photos' | 'age' | 'career'>;
  event: Pick<CrushLiveEvent, 'id' | 'title'>;
  compatibility: number;
  compatibility_reasons: string[];
  matched_at: string;
  conversation_id: string | null;
}
export interface Profile {
  id: string; email: string | null; full_name: string | null; avatar_url: string | null;
  university_id: string | null; career: string | null; academic_year: number | null;
  bio: string | null; city: string | null; interests: string[] | null; is_premium: boolean | null;
  // Campos que gobiernan Crush y el onboarding (presentes en profiles y usados
  // por la web). gender decide qué audiencia ves en get_ligar_feed; birth_date
  // es el gate de edad de is_adult; los demás controlan el opt-in de Ligar, el
  // estado de onboarding y la expulsión de cuentas.
  gender?: string | null; birth_date?: string | null; instagram_handle?: string | null;
  ligar_opted_in?: boolean | null; onboarding_completed?: boolean | null;
  is_discarded?: boolean | null;
  /** Curso universitario 1..6 (CHECK de la migración 010). Lo edita la web y, desde sep-2026, la app. */
  university_course?: number | null;
  // Cuestionario de convivencia completo (006 + 010). Las 8 columnas de
  // texto las pinta lifestyleChips; estas seis las escribía solo la web y
  // la app las dejaba en su valor por defecto, con lo que la compatibilidad
  // salía a medias para quien se registraba desde el móvil.
  disorder_tolerance?: number | null;        // 1..5
  home_gatherings?: HomeGatherings | null;
  is_homebody?: boolean | null;
  is_early_riser?: boolean | null;
  accepts_different_gender_roommate?: boolean | null;
  diet?: Diet | null;
  hobbies?: string[] | null;
  // Mismo CHECK que profiles_role_check en la migración 110. Faltaban 'analyst'
  // y 'university_admin', así que la app no podía distinguir al staff.
  role?: 'user' | 'admin' | 'propietario' | 'university_admin' | 'analyst' | null;
}
// Valores admitidos por los CHECK de profiles (010 y 006).
export type HomeGatherings = 'nunca' | 'a_veces' | 'a_menudo' | 'siempre';
export type Diet = 'sin_preferencia' | 'vegetariano' | 'vegano' | 'halal' | 'otro';
export type Gender = 'hombre' | 'mujer' | 'no_binario' | 'prefiero_no_decirlo';
// Fila de favorites (001, tipos ampliados en la 129).
export type FavoriteTargetType =
  | 'accommodation' | 'university' | 'career' | 'event' | 'leisure_spot' | 'fomo_thread' | 'scholarship';
export interface FavoriteRow {
  id: string; user_id: string; target_type: FavoriteTargetType; target_id: string; created_at: string;
}
