import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { rateLimit } from "@/lib/rate-limit";
import { getOwnerPlanWithFallback } from "@/lib/owner-plan-sync";
import {
  MAX_NUMERIC_10_2 as MAX_PRICE,
  nullableDate,
  nullableInt,
  nullableNum,
  nullableText,
  nullableUuid,
} from "@/lib/form-values";

type BusinessType = "leisure" | "housing";

const LEISURE_CATEGORIES = new Set([
  "bar",
  "restaurante",
  "cafeteria",
  "discoteca",
  "parque",
  "cultural",
  "deportivo",
  "coworking",
]);

const HOUSING_TYPES = new Set(["piso_completo", "habitacion", "estudio", "residencia"]);
const GENDER_PREFS = new Set(["any", "hombre", "mujer"]);

// Origen permitido para media subida por usuarios: SOLO nuestro Storage de
// Supabase, y SOLO dentro de la carpeta del propio usuario ({uid}/...). Evita
// (a) URLs externas arbitrarias renderizadas en el frontend (tracking,
// contenido malicioso) y (b) que un propietario "se apropie" de imágenes
// subidas por otro (IDOR sobre el path del bucket).
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();

function isOwnStorageUrl(value: string, userId: string): boolean {
  try {
    const url = new URL(value);
    if (!SUPABASE_ORIGIN || url.origin !== SUPABASE_ORIGIN) return false;
    if (!url.pathname.startsWith("/storage/v1/object/")) return false;
    // El cliente sube siempre a `${bucket}/${user.id}/...`
    return url.pathname.includes(`/${userId}/`);
  } catch {
    return false;
  }
}

function clampImages(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, 20);
}

function clampVideos(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .slice(0, 10);
}

/** % de comisión de la inmobiliaria: opcional, 0–100 con 2 decimales. */
function nullablePct(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

/** Solo http(s): un enlace de mapa es un href que acaba en el navegador. */
function nullableUrl(v: unknown): string | null {
  const raw = nullableText(v);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Coordenada válida o null (nunca 0 por accidente: 0,0 está en el Atlántico). */
function coord(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

/**
 * Horario semanal: objeto {lunes: "09:00 - 22:00", ...} con solo los días que
 * el local haya rellenado. Se guarda en leisure_spots.opening_hours (jsonb), que
 * es lo que pinta la ficha. Sin esto, /negocio prometía "ficha completa con
 * horarios" y el alta no preguntaba ninguno.
 */
function openingHours(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const src = v as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const day of DAYS) {
    const raw = src[day];
    if (typeof raw !== "string") continue;
    const t = raw.trim().slice(0, 60);
    if (t) out[day] = t;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Traduce un fallo de Postgres a algo que el propietario pueda arreglar.
 *
 * Antes cualquier error del insert se contestaba con "No se pudo crear el
 * anuncio" y un 500. Para quien está publicando eso es un muro: no dice qué
 * campo está mal, no dice si es culpa suya o nuestra, y por teléfono acaba en
 * "no sabemos a cuenta de qué es". El detalle de Postgres sigue sin salir de
 * los logs (revela tablas y constraints), pero el usuario recibe la CATEGORÍA
 * del problema y un código corto para poder citarlo.
 */
function errorDeInsert(
  error: { code?: string; message?: string } | null,
  que: "el anuncio" | "la ficha",
): NextResponse {
  const code = error?.code ?? "";

  // Datos que el usuario ha escrito y Postgres no admite.
  const deUsuario: Record<string, string> = {
    "22P02": "Hay un campo con un formato que no entendemos (una fecha o una universidad). Revisa la fecha de disponibilidad y vuelve a intentarlo.",
    "22007": "La fecha de disponibilidad no es válida. Escríbela como DD/MM/AAAA.",
    "22008": "La fecha de disponibilidad no es válida. Escríbela como DD/MM/AAAA.",
    "22003": "Hay un número demasiado grande (precio, m² o habitaciones). Revísalo y vuelve a intentarlo.",
    "23503": "Alguno de los datos seleccionados ya no existe (por ejemplo la universidad). Vuelve a elegirlo y reintenta.",
    "23514": "Alguno de los valores está fuera de lo permitido (por ejemplo la comisión, que va de 0 a 100).",
    "23505": `Ya tienes ${que === "el anuncio" ? "un anuncio" : "una ficha"} igual publicado.`,
  };
  if (deUsuario[code]) {
    return NextResponse.json({ error: deUsuario[code], code }, { status: 400 });
  }

  // Permisos: normalmente sesión caducada o plan que ya no cubre.
  if (code === "42501" || code === "PGRST301") {
    return NextResponse.json(
      { error: "Tu sesión no tiene permiso para publicar. Vuelve a entrar y reinténtalo.", code },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      error: `No se pudo crear ${que}. Es un fallo nuestro, no tuyo: inténtalo de nuevo y, si sigue, escríbenos citando el código.`,
      code: code || "desconocido",
    },
    { status: 500 },
  );
}

export async function POST(req: NextRequest) {
  // Freno grueso por IP contra el machaque anónimo. Generoso a propósito: el
  // límite fino va por usuario, más abajo.
  const rlIp = await rateLimit(req, { key: "negocio-registro-ip", limit: 60, windowMs: 10 * 60_000 });
  if (!rlIp.ok) return rlIp.response;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Límite real: POR USUARIO, no por IP. Antes eran 5 cada 10 minutos por IP y
  // eso rompía justo el caso que queremos (una inmobiliaria subiendo su
  // cartera): al sexto piso se comía un "demasiadas peticiones", y peor aún si
  // varios agentes publicaban desde la misma oficina, porque compartían el
  // contador. El plan ya topa en 40 pisos, así que 40 altas en 10 minutos es
  // holgado para el uso legítimo y sigue frenando el abuso.
  const rlUser = await rateLimit(req, {
    key: "negocio-registro",
    limit: 40,
    windowMs: 10 * 60_000,
    subject: user.id,
  });
  if (!rlUser.ok) return rlUser.response;

  const body = (await req.json()) as { type?: BusinessType } & Record<string, unknown>;

  if (body.type === "leisure") {
    const name = nullableText(body.name);
    const city = nullableText(body.city);
    const category = typeof body.category === "string" ? body.category : "";

    if (!name || !city || !category) {
      return NextResponse.json(
        { error: "Nombre, ciudad y categoría son obligatorios" },
        { status: 400 }
      );
    }
    if (!LEISURE_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Categoría no válida" }, { status: 400 });
    }

    const insert = {
      owner_id: user.id,
      name,
      city,
      category,
      description: nullableText(body.description),
      address: nullableText(body.address),
      phone: nullableText(body.phone),
      website: nullableText(body.website),
      email: nullableText(body.email),
      instagram: nullableText(body.instagram),
      // Ubicación: el cliente manda el enlace de Google Maps y, si ha podido
      // sacarlas de ahí, las coordenadas. Sin coordenadas el local no sale en
      // el mapa de /ocio, que es justo lo que /negocio le vende.
      google_maps_url: nullableUrl(body.google_maps_url),
      latitude: coord(body.latitude, 90),
      longitude: coord(body.longitude, 180),
      opening_hours: openingHours(body.opening_hours),
      image_url: (() => {
        const raw = nullableText(body.image_url);
        return raw && isOwnStorageUrl(raw, user.id) ? raw : null;
      })(),
      images: clampImages(body.images).filter((u) => isOwnStorageUrl(u, user.id)),
      comunidad_autonoma: nullableText(body.comunidad_autonoma),
      university_id: nullableUuid(body.university_id),
      has_wifi: bool(body.has_wifi),
      has_billiards: bool(body.has_billiards),
      has_air_conditioning: bool(body.has_air_conditioning),
      has_terrace: bool(body.has_terrace),
      has_outdoor_seating: bool(body.has_outdoor_seating),
      has_parking: bool(body.has_parking),
      has_food: bool(body.has_food),
      has_live_music: bool(body.has_live_music),
      accepts_groups: bool(body.accepts_groups),
      accepts_pets: bool(body.accepts_pets),
      student_discount: bool(body.student_discount),
      card_payment: body.card_payment === false ? false : true,
      reservations: bool(body.reservations),
      min_age: nullableInt(body.min_age, 99),
      capacity: nullableInt(body.capacity, 1_000_000),
      price_range: nullableInt(body.price_range, 4),
      extra_info: nullableText(body.extra_info),
      is_verified: true,
      is_paid: false,
    };

    // Mirror primer foto a image_url si no se mandó pero hay imágenes
    if (!insert.image_url && insert.images.length > 0) {
      insert.image_url = insert.images[0];
    }

    const { data: spot, error } = await supabase
      .from("leisure_spots")
      .insert(insert)
      .select("id")
      .single();

    if (error || !spot) {
      // Detalle solo en logs: los mensajes de Postgres revelan tablas/constraints.
      console.error("Insert leisure error:", error);
      return errorDeInsert(error, "la ficha");
    }

    return NextResponse.json({ listingId: spot.id, type: "leisure" });
  }

  if (body.type === "housing") {
    const title = nullableText(body.title);
    const city = nullableText(body.city);
    const housingType = typeof body.housingType === "string" ? body.housingType : "";
    const price = Number(body.price);

    if (!title || !city || !housingType || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { error: "Título, ciudad, tipo y precio son obligatorios" },
        { status: 400 }
      );
    }
    // El precio es obligatorio, así que aquí no vale ignorarlo como a los
    // campos opcionales: si no cabe en la columna hay que decirlo, no dejar
    // que Postgres tumbe el alta con un 500.
    if (price > MAX_PRICE) {
      return NextResponse.json(
        { error: "El precio es demasiado alto. Escríbelo en euros al mes, sin puntos de millar." },
        { status: 400 }
      );
    }
    if (!HOUSING_TYPES.has(housingType)) {
      return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
    }

    // Foto obligatoria: la app móvil oculta listings sin foto, así que
    // forzamos al menos una imagen en el alta. Confirmado con el usuario.
    // Solo se aceptan URLs del Storage propio del usuario (ver isOwnStorageUrl).
    const housingImages = clampImages(body.images).filter((u) => isOwnStorageUrl(u, user.id));
    if (housingImages.length === 0) {
      return NextResponse.json(
        { error: "Debes subir al menos una foto del alojamiento (usa el botón de subida)." },
        { status: 400 }
      );
    }

    const genderPref = typeof body.gender_preference === "string" ? body.gender_preference : "any";
    if (!GENDER_PREFS.has(genderPref)) {
      return NextResponse.json({ error: "gender_preference no válido" }, { status: 400 });
    }

    const flatmateGenders = Array.isArray(body.current_flatmates_genders)
      ? (body.current_flatmates_genders as unknown[])
          .filter((v): v is string => typeof v === "string")
          .filter((v) => ["hombre", "mujer", "no_binario"].includes(v))
      : [];

    // ── Plan Usuario Propietario ──────────────────────────────────────
    // Si el usuario tiene el plan activo (80€/mes, hasta 40 pisos) el
    // anuncio se publica directamente sin pasar por la pasarela de pago.
    // Si ya alcanzó el límite, cae al flujo normal de 9,99€/ficha.
    // Si en BD no consta el plan se le pregunta a Stripe antes de mandarle a
    // pagar 9,99 € por la ficha: un webhook perdido no puede acabar cobrando
    // dos veces a quien ya tiene plan (incidente 05-ago-2026).
    let ownerSub: { id: string; status: string; max_listings: number | null } | null = null;
    const { data: ownerSubRow } = await supabase
      .from("owner_subscriptions")
      .select("id, status, max_listings")
      .eq("owner_id", user.id)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ownerSub = ownerSubRow ?? null;

    if (!ownerSub) {
      const recuperado = await getOwnerPlanWithFallback(user.id);
      if (recuperado && (recuperado.status === "active" || recuperado.status === "trialing")) {
        ownerSub = {
          id: recuperado.id,
          status: recuperado.status,
          max_listings: recuperado.max_listings,
        };
      }
    }

    let coveredByPlan = false;
    let planLimitReached = false;
    if (ownerSub) {
      // owner_listing_quota_used (migración 163) cuenta TODO lo que el
      // propietario tenga subido y sin archivar, no solo lo activo. Contar
      // solo los activos era el agujero: ocultar un piso liberaba plaza, así
      // que ocultar -> publicar otro -> reactivar daba pisos ilimitados con un
      // solo plan. La cuenta de verdad la impone ahora un trigger en la base
      // de datos; esto solo sirve para decidir qué enseñarle al usuario.
      const { data: usadas, error: cuotaError } = await supabase.rpc(
        "owner_listing_quota_used",
        { p_owner: user.id },
      );
      if (cuotaError) {
        console.error("[negocio/registro] cupo:", cuotaError);
        // Si la función todavía no existe (despliegue del código antes que la
        // migración 163), se cae al recuento antiguo en vez de bloquear el
        // alta a todo el mundo. Es el caso benigno y dura minutos; el resto de
        // errores sí fallan cerrado.
        const noExisteAun =
          cuotaError.code === "PGRST202" || cuotaError.code === "42883";
        if (noExisteAun) {
          const { count } = await supabase
            .from("accommodations")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", user.id)
            .eq("status", "active");
          coveredByPlan = (count ?? 0) < (ownerSub.max_listings ?? 40);
          planLimitReached = !coveredByPlan;
        } else {
          planLimitReached = true;
        }
      } else if ((usadas ?? 0) < (ownerSub.max_listings ?? 40)) {
        coveredByPlan = true;
      } else {
        planLimitReached = true;
      }
    }

    const insert = {
      owner_id: user.id,
      title,
      description: nullableText(body.description),
      type: housingType,
      price,
      city,
      address: nullableText(body.address),
      rooms: nullableInt(body.rooms, 99) ?? 1,
      bathrooms: nullableInt(body.bathrooms, 99) ?? 1,
      sqm: nullableInt(body.sqm, 100_000),
      images: housingImages,
      videos: clampVideos(body.videos).filter((u) => isOwnStorageUrl(u, user.id)),
      agency_commission_pct: nullablePct(body.agency_commission_pct),
      status: "active",
      is_paid: coveredByPlan,
      owner_subscription_id: coveredByPlan ? ownerSub!.id : null,
      // Localización extendida
      comunidad_autonoma: nullableText(body.comunidad_autonoma),
      university_id: nullableUuid(body.university_id),
      // Filtros / preferencias
      gender_preference: genderPref,
      allows_smokers: bool(body.allows_smokers),
      students_only: bool(body.students_only),
      pets_allowed: bool(body.pets_allowed),
      bills_included: bool(body.bills_included),
      water_included: bool(body.water_included),
      electricity_included: bool(body.electricity_included),
      is_furnished: bool(body.is_furnished),
      has_wifi: bool(body.has_wifi),
      has_air_conditioning: bool(body.has_air_conditioning),
      has_heating: bool(body.has_heating),
      has_elevator: bool(body.has_elevator),
      has_parking: bool(body.has_parking),
      has_terrace: bool(body.has_terrace),
      has_balcony: bool(body.has_balcony),
      has_washing_machine: bool(body.has_washing_machine),
      has_dishwasher: bool(body.has_dishwasher),
      has_pool: bool(body.has_pool),
      has_gym: bool(body.has_gym),
      has_double_bed: bool(body.has_double_bed),
      has_private_bathroom: bool(body.has_private_bathroom),
      // Estancia / fianza
      min_stay_months: nullableInt(body.min_stay_months, 120),
      deposit_months: nullableNum(body.deposit_months, 99),
      available_until: nullableDate(body.available_until),
      // Compañeros actuales
      current_flatmates_count: nullableInt(body.current_flatmates_count, 50),
      current_flatmates_genders: flatmateGenders,
      // Habitación
      room_size_sqm: nullableInt(body.room_size_sqm, 10_000),
      // Contacto
      instagram: nullableText(body.instagram),
      whatsapp: nullableText(body.whatsapp),
      contact_email: nullableText(body.contact_email),
      extra_info: nullableText(body.extra_info),
    };

    const { data: listing, error } = await supabase
      .from("accommodations")
      .insert(insert)
      .select("id")
      .single();

    if (error || !listing) {
      // Detalle solo en logs: los mensajes de Postgres revelan tablas/constraints.
      console.error("Insert housing error:", error);
      // Excepción: el cupo lleno SÍ se le cuenta al propietario. Es una regla
      // comercial suya, no un detalle interno, y sin explicarla el alta parece
      // que falla sin motivo. El trigger de la 163 lo marca con PT402.
      const cupoLleno =
        error?.code === "PT402" ||
        (typeof error?.details === "string" &&
          error.details.includes("listing_quota_exceeded"));
      if (cupoLleno) {
        return NextResponse.json(
          {
            error:
              "Has alcanzado el límite de pisos de tu plan. Archiva alguno que ya no ofrezcas (ocultarlo no libera plaza) o amplía el plan.",
            planLimitReached: true,
          },
          { status: 402 },
        );
      }
      return errorDeInsert(error, "el anuncio");
    }

    // covered=true -> el cliente NO debe redirigir a Stripe: ya está publicado.
    return NextResponse.json({
      listingId: listing.id,
      type: "housing",
      covered: coveredByPlan,
      planLimitReached,
    });
  }

  return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
}
