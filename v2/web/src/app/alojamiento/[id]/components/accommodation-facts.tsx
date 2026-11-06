import Link from "next/link";
import {
  ArrowUpDown,
  Bath,
  BedDouble,
  Building2,
  CalendarCheck,
  CalendarRange,
  Car,
  Check,
  Cigarette,
  Clock,
  Dog,
  Droplets,
  Dumbbell,
  Flame,
  GraduationCap,
  Home,
  Landmark,
  MapPin,
  Ruler,
  ShowerHead,
  Sofa,
  Trees,
  Users,
  UtensilsCrossed,
  WashingMachine,
  Waves,
  Wifi,
  Wind,
  Zap,
  DoorOpen,
  Sparkles,
  Coins,
  ShieldCheck,
} from "lucide-react";

/**
 * Todo lo que el propietario rellena en /negocio/registro tiene que verse aquí.
 *
 * La ficha antigua pintaba `accommodation.amenities`, un array heredado que el
 * formulario de alta NUNCA rellena: por eso un piso con wifi, piscina y terraza
 * aparecía sin un solo servicio. Los datos reales viven en las COLUMNAS
 * booleanas (has_wifi, has_pool…), que son las que se leen aquí.
 *
 * Regla de oro: un dato solo se pinta si existe. Nada de "0 baños" ni de filas
 * vacías con guiones.
 */
export interface AccommodationRow {
  id: string;
  title: string;
  description: string | null;
  extra_info: string | null;
  type: string;
  price: number | string;
  city: string;
  address: string | null;
  comunidad_autonoma: string | null;
  university_id: string | null;
  // Vivienda
  rooms: number | null;
  bathrooms: number | null;
  sqm: number | null;
  room_size_sqm: number | null;
  rooms_available: number | null;
  is_furnished: boolean | null;
  // Gastos
  bills_included: boolean | null;
  water_included: boolean | null;
  electricity_included: boolean | null;
  deposit_months: number | null;
  agency_commission_pct: number | null;
  // Características
  has_wifi: boolean | null;
  has_air_conditioning: boolean | null;
  has_heating: boolean | null;
  has_elevator: boolean | null;
  has_parking: boolean | null;
  has_terrace: boolean | null;
  has_balcony: boolean | null;
  has_washing_machine: boolean | null;
  has_dishwasher: boolean | null;
  has_pool: boolean | null;
  has_gym: boolean | null;
  has_double_bed: boolean | null;
  has_private_bathroom: boolean | null;
  // Normas y perfil
  allows_smokers: boolean | null;
  students_only: boolean | null;
  pets_allowed: boolean | null;
  gender_preference: string | null;
  // Estancia
  min_stay_months: number | null;
  available_from: string | null;
  available_until: string | null;
  // Compañeros
  current_flatmates_count: number | null;
  current_flatmates_genders: string[] | null;
  // Contacto / meta
  is_verified: boolean | null;
  whatsapp: string | null;
  contact_email: string | null;
  instagram: string | null;
  owner_id: string | null;
  images: string[] | null;
  videos: string[] | null;
}

export interface NearbyUniversity {
  name: string;
  short_name: string | null;
  slug: string;
  city: string | null;
}

export const TYPE_LABELS: Record<string, string> = {
  piso_completo: "Piso completo",
  habitacion: "Habitación",
  estudio: "Estudio",
  residencia: "Residencia universitaria",
};

const GENDER_LABELS: Record<string, string> = {
  hombre: "Chicos",
  mujer: "Chicas",
  no_binario: "No binario",
};

export function fechaLarga(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function plural(n: number, singular: string, plural_: string) {
  return n === 1 ? singular : plural_;
}

/* ───────────────────────── Piezas de UI ───────────────────────── */

export function Section({
  title,
  icon,
  subtitle,
  id,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-t border-border-light pt-8 first:border-t-0 first:pt-0">
      <h2 className="flex items-center gap-2.5 font-heading text-xl font-bold text-text-primary">
        {icon}
        {title}
      </h2>
      {subtitle && <p className="mt-1.5 text-sm text-text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-violet">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="mt-0.5 text-[15px] font-semibold text-text-primary tabular">{value}</p>
      </div>
    </div>
  );
}

function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-text-primary">
      <span className="shrink-0 text-violet">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

/* ───────────────────────── Cómo es la vivienda ───────────────────────── */

export function HousingSpecs({ acc }: { acc: AccommodationRow }) {
  const facts: { icon: React.ReactNode; label: string; value: string }[] = [];

  facts.push({
    icon: <Home className="h-4 w-4" />,
    label: "Tipo de alojamiento",
    value: TYPE_LABELS[acc.type] ?? acc.type,
  });
  if (acc.rooms && acc.rooms > 0)
    facts.push({
      icon: <BedDouble className="h-4 w-4" />,
      label: "Habitaciones",
      value: `${acc.rooms} ${plural(acc.rooms, "habitación", "habitaciones")}`,
    });
  if (acc.rooms_available && acc.rooms_available > 0)
    facts.push({
      icon: <DoorOpen className="h-4 w-4" />,
      label: "Habitaciones libres",
      value: `${acc.rooms_available} ${plural(acc.rooms_available, "libre", "libres")}`,
    });
  if (acc.bathrooms && acc.bathrooms > 0)
    facts.push({
      icon: <Bath className="h-4 w-4" />,
      label: "Baños",
      value: `${acc.bathrooms} ${plural(acc.bathrooms, "baño", "baños")}`,
    });
  if (acc.sqm && acc.sqm > 0)
    facts.push({
      icon: <Ruler className="h-4 w-4" />,
      label: "Superficie",
      value: `${acc.sqm} m²`,
    });
  if (acc.room_size_sqm && acc.room_size_sqm > 0)
    facts.push({
      icon: <Ruler className="h-4 w-4" />,
      label: "Habitación",
      value: `${acc.room_size_sqm} m²`,
    });
  if (acc.is_furnished)
    facts.push({
      icon: <Sofa className="h-4 w-4" />,
      label: "Mobiliario",
      value: "Amueblado",
    });

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      {facts.map((f) => (
        <Fact key={f.label} icon={f.icon} label={f.label} value={f.value} />
      ))}
    </div>
  );
}

/* ───────────────────────── Qué tiene ───────────────────────── */

const FEATURES: { key: keyof AccommodationRow; label: string; icon: React.ReactNode }[] = [
  { key: "has_wifi", label: "Wifi", icon: <Wifi className="h-4 w-4" /> },
  { key: "has_air_conditioning", label: "Aire acondicionado", icon: <Wind className="h-4 w-4" /> },
  { key: "has_heating", label: "Calefacción", icon: <Flame className="h-4 w-4" /> },
  { key: "has_elevator", label: "Ascensor", icon: <ArrowUpDown className="h-4 w-4" /> },
  { key: "has_parking", label: "Parking", icon: <Car className="h-4 w-4" /> },
  { key: "has_terrace", label: "Terraza", icon: <Trees className="h-4 w-4" /> },
  { key: "has_balcony", label: "Balcón", icon: <Building2 className="h-4 w-4" /> },
  { key: "has_washing_machine", label: "Lavadora", icon: <WashingMachine className="h-4 w-4" /> },
  { key: "has_dishwasher", label: "Lavavajillas", icon: <UtensilsCrossed className="h-4 w-4" /> },
  { key: "has_pool", label: "Piscina", icon: <Waves className="h-4 w-4" /> },
  { key: "has_gym", label: "Gimnasio", icon: <Dumbbell className="h-4 w-4" /> },
  { key: "is_furnished", label: "Amueblado", icon: <Sofa className="h-4 w-4" /> },
  { key: "has_double_bed", label: "Cama doble", icon: <BedDouble className="h-4 w-4" /> },
  { key: "has_private_bathroom", label: "Baño privado", icon: <ShowerHead className="h-4 w-4" /> },
];

export function hasAnyFeature(acc: AccommodationRow) {
  return FEATURES.some((f) => acc[f.key] === true);
}

export function HousingFeatures({ acc }: { acc: AccommodationRow }) {
  const active = FEATURES.filter((f) => acc[f.key] === true);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {active.map((f) => (
        <Chip key={String(f.key)} icon={f.icon} label={f.label} />
      ))}
    </div>
  );
}

/* ───────────────────────── Gastos ───────────────────────── */

export function hasAnyBills(acc: AccommodationRow) {
  return !!(acc.bills_included || acc.water_included || acc.electricity_included);
}

export function BillsIncluded({ acc }: { acc: AccommodationRow }) {
  const items: { label: string; icon: React.ReactNode }[] = [];
  if (acc.bills_included)
    items.push({ label: "Todos los gastos incluidos", icon: <Sparkles className="h-4 w-4" /> });
  if (acc.water_included)
    items.push({ label: "Agua incluida", icon: <Droplets className="h-4 w-4" /> });
  if (acc.electricity_included)
    items.push({ label: "Luz incluida", icon: <Zap className="h-4 w-4" /> });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <div
          key={i.label}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-text-primary"
        >
          <span className="shrink-0 text-success">{i.icon}</span>
          <span className="text-sm font-medium">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Normas y perfil ───────────────────────── */

export function hasAnyRule(acc: AccommodationRow) {
  return !!(
    acc.allows_smokers ||
    acc.students_only ||
    acc.pets_allowed ||
    (acc.gender_preference && acc.gender_preference !== "any")
  );
}

export function HousingRules({ acc }: { acc: AccommodationRow }) {
  const rules: { label: string; icon: React.ReactNode }[] = [];
  if (acc.students_only)
    rules.push({ label: "Solo estudiantes", icon: <GraduationCap className="h-4 w-4" /> });
  if (acc.allows_smokers)
    rules.push({ label: "Se permite fumar", icon: <Cigarette className="h-4 w-4" /> });
  if (acc.pets_allowed)
    rules.push({ label: "Se admiten mascotas", icon: <Dog className="h-4 w-4" /> });
  if (acc.gender_preference === "hombre")
    rules.push({ label: "Solo chicos", icon: <Users className="h-4 w-4" /> });
  if (acc.gender_preference === "mujer")
    rules.push({ label: "Solo chicas", icon: <Users className="h-4 w-4" /> });
  if (rules.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {rules.map((r) => (
        <Chip key={r.label} icon={r.icon} label={r.label} />
      ))}
    </div>
  );
}

/* ───────────────────────── Estancia ───────────────────────── */

export function hasAnyStayInfo(acc: AccommodationRow) {
  return !!(
    acc.min_stay_months ||
    acc.deposit_months ||
    acc.available_from ||
    acc.available_until
  );
}

export function StayInfo({ acc }: { acc: AccommodationRow }) {
  const facts: { icon: React.ReactNode; label: string; value: string }[] = [];
  const desde = fechaLarga(acc.available_from);
  const hasta = fechaLarga(acc.available_until);

  if (desde)
    facts.push({
      icon: <CalendarCheck className="h-4 w-4" />,
      label: "Disponible desde",
      value: desde,
    });
  if (hasta)
    facts.push({
      icon: <CalendarRange className="h-4 w-4" />,
      label: "Disponible hasta",
      value: hasta,
    });
  if (acc.min_stay_months && acc.min_stay_months > 0)
    facts.push({
      icon: <Clock className="h-4 w-4" />,
      label: "Estancia mínima",
      value: `${acc.min_stay_months} ${plural(acc.min_stay_months, "mes", "meses")}`,
    });
  if (acc.deposit_months != null && Number(acc.deposit_months) > 0)
    facts.push({
      icon: <Coins className="h-4 w-4" />,
      label: "Fianza",
      value: `${Number(acc.deposit_months)} ${
        Number(acc.deposit_months) === 1 ? "mensualidad" : "mensualidades"
      }`,
    });

  if (facts.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      {facts.map((f) => (
        <Fact key={f.label} icon={f.icon} label={f.label} value={f.value} />
      ))}
    </div>
  );
}

/* ───────────────────────── Compañeros actuales ───────────────────────── */

export function FlatmatesSummary({ acc }: { acc: AccommodationRow }) {
  const count = acc.current_flatmates_count;
  const genders = (acc.current_flatmates_genders ?? []).filter(Boolean);
  if (!count && genders.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {count != null && count > 0 && (
        <Fact
          icon={<Users className="h-4 w-4" />}
          label="Ya viven aquí"
          value={`${count} ${plural(count, "persona", "personas")}`}
        />
      )}
      {genders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {genders.map((g) => (
            <span
              key={g}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary"
            >
              {GENDER_LABELS[g] ?? g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Dónde está ───────────────────────── */

export function LocationInfo({
  acc,
  university,
}: {
  acc: AccommodationRow;
  university: NearbyUniversity | null;
}) {
  const zona = [acc.city, acc.comunidad_autonoma].filter(Boolean).join(" · ");
  return (
    <div className="space-y-3">
      {acc.address && (
        <p className="flex items-start gap-2.5 text-sm text-text-secondary">
          <MapPin className="h-4 w-4 text-violet mt-0.5 shrink-0" />
          <span>{acc.address}</span>
        </p>
      )}
      {zona && (
        <p className="flex items-start gap-2.5 text-sm text-text-secondary">
          <Landmark className="h-4 w-4 text-violet mt-0.5 shrink-0" />
          <span>{zona}</span>
        </p>
      )}
      {university && (
        <p className="flex items-start gap-2.5 text-sm text-text-secondary">
          <GraduationCap className="h-4 w-4 text-violet mt-0.5 shrink-0" />
          <span>
            Cerca de{" "}
            <Link
              href={`/universidades/${university.slug}`}
              className="link-underline font-semibold text-text-primary"
            >
              {university.name}
            </Link>
            {university.short_name && university.short_name !== university.name && (
              <span className="text-text-muted"> ({university.short_name})</span>
            )}
          </span>
        </p>
      )}
      {!acc.address && !zona && !university && (
        <p className="text-sm text-text-muted">
          El anunciante no ha detallado la ubicación exacta. Pregúntale por el chat.
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── Información extra ───────────────────────── */

export function ExtraInfo({ text }: { text: string }) {
  return (
    <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{text}</p>
  );
}

/* ───────────────────────── Resumen de precio ───────────────────────── */

export function PriceBreakdown({ acc }: { acc: AccommodationRow }) {
  const rows: { label: string; value: string }[] = [];
  if (acc.deposit_months != null && Number(acc.deposit_months) > 0) {
    rows.push({
      label: "Fianza",
      value: `${Number(acc.deposit_months)} ${
        Number(acc.deposit_months) === 1 ? "mensualidad" : "mensualidades"
      }`,
    });
  }
  if (acc.agency_commission_pct != null) {
    rows.push({
      label: "Comisión de inmobiliaria",
      value: `${Number(acc.agency_commission_pct)}%`,
    });
  }
  if (acc.min_stay_months && acc.min_stay_months > 0) {
    rows.push({
      label: "Estancia mínima",
      value: `${acc.min_stay_months} ${plural(acc.min_stay_months, "mes", "meses")}`,
    });
  }

  const incluidos = [
    acc.bills_included ? "gastos" : null,
    !acc.bills_included && acc.water_included ? "agua" : null,
    !acc.bills_included && acc.electricity_included ? "luz" : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <div>
        <p className="eyebrow">Alquiler</p>
        <p className="mt-2 font-heading text-4xl font-extrabold tracking-tight text-text-primary tabular">
          {Number(acc.price).toLocaleString("es-ES")}
          <span className="ml-1 text-base font-semibold text-text-muted">€/mes</span>
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {incluidos.length > 0
            ? `Incluye ${incluidos.join(" y ")}`
            : "Gastos aparte del alquiler"}
        </p>
      </div>
      {rows.length > 0 && (
        <dl className="mt-5">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex justify-between gap-3 border-t border-border-light py-2.5 text-sm"
            >
              <dt className="text-text-muted">{r.label}</dt>
              <dd className="text-right font-semibold text-text-primary tabular">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

/* ───────────────────────── Badges de cabecera ───────────────────────── */

export function HeaderBadges({ acc }: { acc: AccommodationRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary">
        {TYPE_LABELS[acc.type] ?? acc.type}
      </span>
      {acc.is_verified && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-success">
          <ShieldCheck className="h-3.5 w-3.5" />
          Anuncio verificado
        </span>
      )}
      {acc.bills_included && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary">
          <Check className="h-3.5 w-3.5" />
          Gastos incluidos
        </span>
      )}
      {acc.rooms_available != null && acc.rooms_available > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-secondary tabular">
          <DoorOpen className="h-3.5 w-3.5" />
          {acc.rooms_available}{" "}
          {plural(acc.rooms_available, "habitación libre", "habitaciones libres")}
        </span>
      )}
    </div>
  );
}
