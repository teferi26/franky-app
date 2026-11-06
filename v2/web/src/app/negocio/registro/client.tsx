"use client";

import LeisureBillingSelector from "../components/leisure-billing-selector";
import { HousingOfferConsent } from "../components/housing-offer";
import { HOUSING_OFFER_VERSION } from "@/lib/housing-offer";
import { businessBillingLabel, type BusinessInterval } from "@/lib/business-billing";
import { safeStripeUrl } from '../../../../../shared/payment-contract';


import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Beer, Home, ArrowRight, ArrowLeft, AlertCircle, CreditCard,
  Upload, X, Wifi, Wind, Trees, Music, Cigarette, Users, Dog,
  GraduationCap, ListChecks, Play, ChevronLeft, ChevronRight,
  CheckCircle2, BadgePercent, Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { prepareImageForUpload, isImageFile, isVideoFile, MIN_GOOD_IMAGE_PX } from "@/lib/image-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type BusinessType = "leisure" | "housing";

interface UniNode {
  id: string;
  name: string;
  short_name: string | null;
}
interface CityNode {
  city: string;
  universities: UniNode[];
}
interface ComunidadNode {
  comunidad: string;
  cities: CityNode[];
}

const LEISURE_CATEGORIES: { value: string; label: string; icon: string }[] = [
  { value: "bar", label: "Bar / Tapas", icon: "🍺" },
  { value: "restaurante", label: "Restaurante", icon: "🍽️" },
  { value: "cafeteria", label: "Cafetería", icon: "☕" },
  { value: "discoteca", label: "Discoteca / Pub", icon: "🎵" },
  { value: "parque", label: "Parque / Aire libre", icon: "🌳" },
  { value: "cultural", label: "Cultura / Museo", icon: "🏛️" },
  { value: "deportivo", label: "Deportivo", icon: "⚽" },
  { value: "coworking", label: "Coworking / Estudio", icon: "💻" },
];

const HOUSING_TYPES = [
  { value: "piso_completo", label: "Piso completo" },
  { value: "habitacion", label: "Habitación" },
  { value: "estudio", label: "Estudio" },
  { value: "residencia", label: "Residencia" },
];

const PRICE_RANGES = [
  { value: 1, label: "€" },
  { value: 2, label: "€€" },
  { value: 3, label: "€€€" },
  { value: 4, label: "€€€€" },
];

// Horario semanal del local. Las claves son las que espera la ficha
// (leisure_spots.opening_hours) y el orden es el de la semana, no el del objeto.
const WEEK_DAYS: { key: string; label: string }[] = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

/**
 * Saca las coordenadas de lo que pegue el usuario: un enlace de Google Maps
 * (`.../@38.34,-0.48,17z`, `!3d38.34!4d-0.48`, `?q=38.34,-0.48`) o directamente
 * un par "lat, lng". Sin coordenadas el local no aparece en el mapa de /ocio.
 * Los enlaces cortos (maps.app.goo.gl) no las llevan dentro: se guarda el
 * enlace igual, pero se avisa de cómo conseguir el largo.
 */
function parseCoords(input: string): { lat: number; lng: number } | null {
  const text = input.trim();
  if (!text) return null;
  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/, // .../@lat,lng,17z
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/, // data=...!3dlat!4dlng
    /[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/, // ?q=lat,lng
    /^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/, // "lat, lng" a pelo
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

interface Props {
  deferredHousingEnabled?: boolean;
  initialType: BusinessType | null;
  canceled: boolean;
}

const MAX_PHOTOS = 20;
const MAX_VIDEOS = 10;
const MAX_PHOTO_MB = 8;
const MAX_VIDEO_MB = 50;

/** Foto o vídeo ya subido al bucket, en el orden elegido por el usuario. */
interface MediaItem {
  url: string;
  kind: "image" | "video";
}

interface OwnerStatus {
  authenticated: boolean;
  active: boolean;
  listingsUsed: number;
  maxListings: number;
}

export default function RegistroClient({ initialType, canceled, deferredHousingEnabled = false }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<BusinessType | null>(initialType);
  const [billingInterval, setBillingInterval] = useState<BusinessInterval>("month");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Avisos que NO impiden publicar (p. ej. fotos de poca resolución).
  const [aviso, setAviso] = useState<string | null>(null);

  // ─────────── Locations tree ───────────
  const [locTree, setLocTree] = useState<ComunidadNode[]>([]);
  const [comunidad, setComunidad] = useState("");
  const [cityChoice, setCityChoice] = useState("");
  const [universityId, setUniversityId] = useState("");

  useEffect(() => {
    fetch("/api/locations/structure")
      .then((r) => r.json())
      .then((d) => setLocTree(d.structure || []))
      .catch(() => setLocTree([]));
  }, []);

  const cities = useMemo(
    () => locTree.find((c) => c.comunidad === comunidad)?.cities || [],
    [locTree, comunidad]
  );
  const universities = useMemo(
    () => cities.find((c) => c.city === cityChoice)?.universities || [],
    [cities, cityChoice]
  );

  // Sync free-text city with chosen one when present
  const [city, setCity] = useState("");
  useEffect(() => {
    if (cityChoice) setCity(cityChoice);
  }, [cityChoice]);

  // ─────────── Common fields ───────────
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);

  // ─────────── Plan Usuario Propietario ───────────
  // Si el plan está activo, el piso se publica sin pasar por la pasarela.
  const [ownerStatus, setOwnerStatus] = useState<OwnerStatus | null>(null);
  useEffect(() => {
    if (!user) return;
    fetch("/api/negocio/owner-status")
      .then((r) => r.json())
      .then(setOwnerStatus)
      .catch(() => setOwnerStatus(null));
  }, [user]);
  const planCovers =
    type === "housing" &&
    !!ownerStatus?.active &&
    ownerStatus.listingsUsed < ownerStatus.maxListings;
  const planAtLimit =
    type === "housing" &&
    !!ownerStatus?.active &&
    ownerStatus.listingsUsed >= ownerStatus.maxListings;

  // ─────────── Leisure fields ───────────
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [emailL, setEmailL] = useState("");
  const [priceRange, setPriceRange] = useState<number | null>(null);
  const [minAge, setMinAge] = useState("");
  const [capacity, setCapacity] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [hours, setHours] = useState<Record<string, string>>({});
  const coords = useMemo(() => parseCoords(mapsLink), [mapsLink]);
  const [leisureFlags, setLeisureFlags] = useState({
    has_wifi: false,
    has_billiards: false,
    has_air_conditioning: false,
    has_terrace: false,
    has_outdoor_seating: false,
    has_parking: false,
    has_food: false,
    has_live_music: false,
    accepts_groups: false,
    accepts_pets: false,
    student_discount: false,
    card_payment: true,
    reservations: false,
  });

  // ─────────── Housing fields ───────────
  const [title, setTitle] = useState("");
  const [housingType, setHousingType] = useState("piso_completo");
  const [housingOfferAccepted, setHousingOfferAccepted] = useState(false);
  const [price, setPrice] = useState("");
  const [rooms, setRooms] = useState("1");
  const [bathrooms, setBathrooms] = useState("1");
  const [sqm, setSqm] = useState("");
  const [genderPref, setGenderPref] = useState<"any" | "hombre" | "mujer">("any");
  const [minStay, setMinStay] = useState("");
  const [deposit, setDeposit] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [flatmateCount, setFlatmateCount] = useState("");
  const [flatmateGenders, setFlatmateGenders] = useState<string[]>([]);
  const [roomSize, setRoomSize] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  // % de comisión que se lleva la inmobiliaria (opcional)
  const [commissionPct, setCommissionPct] = useState("");
  const [housingFlags, setHousingFlags] = useState({
    allows_smokers: false,
    students_only: false,
    pets_allowed: false,
    is_furnished: false,
    bills_included: false,
    water_included: false,
    electricity_included: false,
    has_wifi: false,
    has_air_conditioning: false,
    has_heating: false,
    has_elevator: false,
    has_parking: false,
    has_terrace: false,
    has_balcony: false,
    has_washing_machine: false,
    has_dishwasher: false,
    has_pool: false,
    has_gym: false,
    has_double_bed: false,
    has_private_bathroom: false,
  });

  // ─────────── Media upload (fotos + vídeos) ───────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoCount = media.filter((m) => m.kind === "image").length;
  const videoCount = media.filter((m) => m.kind === "video").length;
  // Índice del elemento usado como portada (la primera FOTO de la galería)
  const coverIdx = media.findIndex((m) => m.kind === "image");

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user) {
      setError("Debes iniciar sesión para subir fotos o vídeos.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const uploaded: MediaItem[] = [];
      const pocaCalidad: string[] = [];
      let photosLeft = MAX_PHOTOS - photoCount;
      let videosLeft = MAX_VIDEOS - videoCount;

      for (const file of Array.from(files)) {
        const isVideo = isVideoFile(file);
        const isImage = !isVideo && isImageFile(file);
        if (!isImage && !isVideo) continue;
        if (isVideo && type !== "housing") {
          setError("Los vídeos solo están disponibles para pisos.");
          continue;
        }

        if (isImage && photosLeft <= 0) {
          setError(`Máximo ${MAX_PHOTOS} fotos por ficha.`);
          continue;
        }
        if (isVideo && videosLeft <= 0) {
          setError(`Máximo ${MAX_VIDEOS} vídeos por ficha.`);
          continue;
        }
        // El límite de tamaño se comprueba solo en vídeo: las fotos se
        // reconvierten abajo y salen muy por debajo del tope, así que rechazar
        // por el peso del original penalizaría sin motivo a quien sube fotos
        // grandes desde el móvil.
        if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
          setError(`"${file.name}" excede ${MAX_VIDEO_MB}MB y se omite.`);
          continue;
        }

        // Convierte a JPEG (arregla las fotos HEIC del iPhone, que el Storage
        // rechaza) y normaliza el contentType. Ver src/lib/image-upload.ts.
        const prep = await prepareImageForUpload(file);
        if (!prep.ok) {
          setError(prep.message);
          continue;
        }
        if (!isVideo && prep.blob.size > MAX_PHOTO_MB * 1024 * 1024) {
          setError(`"${file.name}" sigue pesando más de ${MAX_PHOTO_MB}MB tras optimizarla y se omite.`);
          continue;
        }
        // Foto diminuta: se sube igual (mejor eso que nada), pero se avisa,
        // porque la ficha la muestra a más de 1000 px de ancho y una foto
        // pequeña se ve borrosa. Es lo que más resta a un anuncio.
        if (
          !isVideo &&
          prep.width &&
          prep.height &&
          Math.max(prep.width, prep.height) < MIN_GOOD_IMAGE_PX
        ) {
          pocaCalidad.push(`${file.name} (${prep.width}x${prep.height} px)`);
        }

        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${prep.ext}`;
        const { error: upErr } = await supabase.storage
          .from("business-photos")
          .upload(path, prep.blob, { contentType: prep.contentType, upsert: false });
        if (upErr) {
          setError(`No se pudo subir "${file.name}". Inténtalo de nuevo o prueba con otra foto.`);
          continue;
        }
        const { data } = supabase.storage.from("business-photos").getPublicUrl(path);
        if (data?.publicUrl) {
          uploaded.push({ url: data.publicUrl, kind: isVideo ? "video" : "image" });
          if (isVideo) videosLeft -= 1;
          else photosLeft -= 1;
        }
      }
      setMedia((prev) => [...prev, ...uploaded]);
      if (pocaCalidad.length > 0) {
        setAviso(
          `Ojo con la calidad: ${pocaCalidad.join(", ")}. Se ven pequeñas y saldrán ` +
            "borrosas en la ficha, que muestra las fotos a pantalla ancha. Si puedes, " +
            "súbelas desde el móvil o la cámara originales: es lo que más ayuda a alquilar.",
        );
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeMedia = (idx: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== idx));
    setPreviewIdx(null);
  };

  // ─────────── Ordenar la galería (arrastrar o flechas) ───────────
  const dragFrom = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const moveMedia = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setMedia((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  // ─────────── Vista previa ampliada (lightbox) ───────────
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  useEffect(() => {
    if (previewIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewIdx(null);
      if (e.key === "ArrowLeft") setPreviewIdx((p) => (p === null ? p : (p + media.length - 1) % media.length));
      if (e.key === "ArrowRight") setPreviewIdx((p) => (p === null ? p : (p + 1) % media.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewIdx, media.length]);

  // ─────────── Submit ───────────
  // Housing: foto obligatoria (espejo del check server-side en
  // /api/negocio/registro). Sin esto el botón quedaría habilitado, el
  // usuario haría submit y comería un 400.
  const canSubmit = type === "leisure"
    ? name.trim() && city.trim() && category && !uploading
    : type === "housing"
    ? title.trim() && city.trim() && Number(price) > 0 && photoCount > 0 && !uploading
    : false;

  const handleSubmit = async () => {
    if (!user) {
      window.location.href = "/login?next=%2Fnegocio%2Fregistro";
      return;
    }
    if (!type || !canSubmit) return;
    if (deferredHousingEnabled && type === "housing" && !planCovers && !housingOfferAccepted) return;

    setSubmitting(true);
    setError(null);

    try {
      const common = {
        type,
        comunidad_autonoma: comunidad || null,
        university_id: universityId || null,
        city,
        address,
        description,
        instagram,
        extra_info: extraInfo,
        // El orden elegido en la galería se respeta: la primera foto es la portada.
        images: media.filter((m) => m.kind === "image").map((m) => m.url),
      };

      const payload = type === "leisure"
        ? {
            ...common,
            name,
            category,
            phone,
            website,
            email: emailL,
            price_range: priceRange,
            min_age: minAge ? Number(minAge) : null,
            capacity: capacity ? Number(capacity) : null,
            // Ubicación en el mapa y horario: los anuncia /negocio y hasta ahora
            // el alta ni los preguntaba (el local acababa fuera del mapa).
            google_maps_url: mapsLink.trim().startsWith("http") ? mapsLink.trim() : null,
            latitude: coords?.lat ?? null,
            longitude: coords?.lng ?? null,
            opening_hours: hours,
            ...leisureFlags,
          }
        : {
            ...common,
            title,
            housingType,
            price: Number(price),
            rooms: Number(rooms) || 1,
            bathrooms: Number(bathrooms) || 1,
            sqm: sqm ? Number(sqm) : null,
            gender_preference: genderPref,
            min_stay_months: minStay ? Number(minStay) : null,
            deposit_months: deposit ? Number(deposit) : null,
            available_until: availableUntil || null,
            current_flatmates_count: flatmateCount ? Number(flatmateCount) : null,
            current_flatmates_genders: flatmateGenders,
            room_size_sqm: roomSize ? Number(roomSize) : null,
            whatsapp,
            contact_email: contactEmail,
            videos: media.filter((m) => m.kind === "video").map((m) => m.url),
            agency_commission_pct: commissionPct ? Number(commissionPct) : null,
            ...housingFlags,
          };

      const regRes = await fetch("/api/negocio/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const regJson = await regRes.json();
      if (!regRes.ok) {
        setError(regJson.error || "No se pudo crear la ficha");
        setSubmitting(false);
        return;
      }

      // Plan Usuario Propietario activo: el anuncio ya queda publicado,
      // sin pasar por la pasarela de pago.
      if (regJson.covered) {
        window.location.href = "/negocio/dashboard?published=true";
        return;
      }

      const checkoutRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "business",
          businessType: type,
          listingId: regJson.listingId,
          interval: type === "leisure" ? billingInterval : "month",
          ...(deferredHousingEnabled && type === "housing" ? { offerVersion: HOUSING_OFFER_VERSION } : {}),
        }),
      });
      const checkoutJson = await checkoutRes.json();
      const checkoutUrl = safeStripeUrl(checkoutJson.url);
      if (!checkoutRes.ok || !checkoutUrl) {
        setError(checkoutJson.error || "No se pudo iniciar el pago");
        setSubmitting(false);
        return;
      }

      window.location.href = checkoutUrl;
    } catch {
      setError("Error inesperado. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  };

  // ─────────── Helpers UI ───────────
  const toggleLeisure = (key: keyof typeof leisureFlags) =>
    setLeisureFlags((p) => ({ ...p, [key]: !p[key] }));
  const toggleHousing = (key: keyof typeof housingFlags) =>
    setHousingFlags((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="min-h-screen bg-bg-secondary/30 py-8 sm:py-14">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/negocio"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-violet mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-heading mb-2">
          Registra tu negocio
        </h1>
        <p className="text-text-secondary mb-6">
          Cuanta más información rellenes, mejor te encontrarán los estudiantes.
          {!planCovers && <>{type === "leisure" ? " Elige 9,99 €/mes o 100 €/año por local." : " Sin permanencia, 9,99 €/mes."}</>}
        </p>

        {planCovers && ownerStatus && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-success/10 border border-success/20 text-sm text-text-secondary mb-4">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-success" />
            <span>
              <strong>Plan Inmobiliarias activo</strong> · este piso se publicará sin pago adicional
              ({ownerStatus.listingsUsed}/{ownerStatus.maxListings} pisos usados).
            </span>
          </div>
        )}
        {planAtLimit && ownerStatus && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-border bg-bg-secondary/60 text-sm text-text-secondary mb-4">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Has alcanzado el límite de {ownerStatus.maxListings} pisos de tu Plan Inmobiliarias.
              Este anuncio se cobrará aparte (9,99 €/mes).
            </span>
          </div>
        )}

        {canceled && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-border bg-bg-secondary/60 text-sm text-text-secondary mb-4">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              El pago quedó pendiente. No vuelvas a rellenar la ficha: ya está guardada en tu panel.{" "}
              <Link href="/negocio/dashboard" className="font-semibold underline underline-offset-2">
                Ve al panel para terminar el pago
              </Link>
              .
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-border bg-bg-secondary/60 text-sm text-text-secondary mb-4">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {aviso && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-violet/5 border border-violet/20 text-sm text-text-secondary mb-4">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-violet" />
            <span className="flex-1">{aviso}</span>
            <button
              type="button"
              onClick={() => setAviso(null)}
              className="text-xs text-text-muted hover:text-violet shrink-0"
            >
              Entendido
            </button>
          </div>
        )}

        {/* ── Step 1: choose type ── */}
        {!type && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Card
              onClick={() => setType("leisure")}
              className="p-6 cursor-pointer hover-lift hover:border-text-primary/15"
            >
              <div className="mb-3">
                <Beer className="h-6 w-6 text-violet" />
              </div>
              <h3 className="font-bold font-heading mb-1">Zona de ocio</h3>
              <p className="text-sm text-text-secondary">
                Bar, restaurante, discoteca, cafetería, coworking…
              </p>
            </Card>
            <Card
              onClick={() => setType("housing")}
              className="p-6 cursor-pointer hover-lift hover:border-text-primary/15"
            >
              <div className="mb-3">
                <Home className="h-6 w-6 text-violet" />
              </div>
              <h3 className="font-bold font-heading mb-1">Inmobiliaria / piso</h3>
              <p className="text-sm text-text-secondary">
                Piso, habitación, estudio o residencia.
              </p>
            </Card>
          </div>
        )}

        {/* ── Form ── */}
        {type && (
          <div className="space-y-6">
            {/* Sección: ubicación (común) */}
            <Card className="p-6 sm:p-7">
              <h2 className="font-bold font-heading mb-4 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-violet" />
                Ubicación universitaria
              </h2>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Comunidad autónoma</label>
                  <select
                    value={comunidad}
                    onChange={(e) => {
                      setComunidad(e.target.value);
                      setCityChoice("");
                      setUniversityId("");
                    }}
                    className="flex h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet/30"
                  >
                    <option value="">Elige…</option>
                    {locTree.map((c) => (
                      <option key={c.comunidad} value={c.comunidad}>{c.comunidad}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Ciudad</label>
                  <select
                    value={cityChoice}
                    onChange={(e) => {
                      setCityChoice(e.target.value);
                      setUniversityId("");
                    }}
                    disabled={!comunidad}
                    className="flex h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet/30 disabled:bg-bg-secondary/40 disabled:text-text-muted"
                  >
                    <option value="">{comunidad ? "Elige…" : "Primero comunidad"}</option>
                    {cities.map((c) => (
                      <option key={c.city} value={c.city}>{c.city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Universidad cercana</label>
                  <select
                    value={universityId}
                    onChange={(e) => setUniversityId(e.target.value)}
                    disabled={!cityChoice}
                    className="flex h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet/30 disabled:bg-bg-secondary/40 disabled:text-text-muted"
                  >
                    <option value="">{cityChoice ? "Sin especificar" : "Primero ciudad"}</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>{u.short_name || u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-text-muted mt-3">
                Si tu ciudad no aparece, escríbela manualmente abajo.
              </p>
              <div className="mt-3">
                <label className="text-sm font-medium mb-1.5 block">Ciudad (libre) *</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej: Madrid" />
              </div>
            </Card>

            {/* Sección: datos básicos LEISURE */}
            {type === "leisure" && (
              <>
                <Card className="p-6 sm:p-7 space-y-4">
                  <h2 className="font-bold font-heading flex items-center gap-2">
                    <Beer className="h-5 w-5 text-violet" />
                    Datos del local
                  </h2>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Nombre *</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cafetería Alma" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Categoría *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {LEISURE_CATEGORIES.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setCategory(c.value)}
                          className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm border transition-all ${
                            category === c.value
                              ? "border-text-primary bg-text-primary text-bg-primary font-semibold"
                              : "border-border bg-bg-primary hover:border-text-primary/40"
                          }`}
                        >
                          <span className="text-base mr-1">{c.icon}</span>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Dirección</label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle Mayor 12" />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Ubicación en el mapa</label>
                    <Input
                      value={mapsLink}
                      onChange={(e) => setMapsLink(e.target.value)}
                      placeholder="Pega el enlace de Google Maps de tu local"
                    />
                    {coords ? (
                      <p className="text-xs text-success mt-1.5 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Localizado: tu local saldrá en el mapa de Franky.
                      </p>
                    ) : (
                      <p className="text-xs text-text-muted mt-1.5">
                        Busca tu local en Google Maps, copia la dirección de la barra
                        del navegador y pégala aquí. Con el enlace largo (el que
                        lleva <span className="font-mono">@41.65,-0.88</span>) te
                        colocamos el punto exacto en el mapa.
                      </p>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Teléfono</label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="912 345 678" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Email</label>
                      <Input type="email" value={emailL} onChange={(e) => setEmailL(e.target.value)} placeholder="contacto@local.com" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Web</label>
                      <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Instagram</label>
                      <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@tu_local" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Rango de precio</label>
                      <div className="flex gap-1">
                        {PRICE_RANGES.map((r) => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => setPriceRange(priceRange === r.value ? null : r.value)}
                            className={`flex-1 h-10 rounded-xl text-sm border transition-all ${
                              priceRange === r.value
                                ? "border-text-primary bg-text-primary text-bg-primary font-semibold"
                                : "border-border bg-bg-primary hover:border-text-primary/40"
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Edad mínima</label>
                      <Input type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="18" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Aforo</label>
                      <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="120" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Descripción</label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Cuenta a los estudiantes qué hace tu local especial…"
                      rows={4}
                    />
                  </div>
                </Card>

                {/* Horario: lo prometemos en /negocio, así que hay que pedirlo */}
                <Card className="p-6 sm:p-7">
                  <h2 className="font-bold font-heading mb-1 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-violet" />
                    Horario
                  </h2>
                  <p className="text-xs text-text-muted mb-4">
                    Escríbelo como quieras (&quot;09:00 - 22:00&quot;, &quot;Cerrado&quot;,
                    &quot;Solo tardes&quot;). Los días que dejes en blanco no se muestran.
                  </p>
                  <div className="space-y-2">
                    {WEEK_DAYS.map((d) => (
                      <div key={d.key} className="flex items-center gap-3">
                        <label htmlFor={`horario-${d.key}`} className="text-sm w-24 shrink-0">
                          {d.label}
                        </label>
                        <Input
                          id={`horario-${d.key}`}
                          value={hours[d.key] ?? ""}
                          onChange={(e) => setHours((p) => ({ ...p, [d.key]: e.target.value }))}
                          placeholder="09:00 - 22:00"
                        />
                      </div>
                    ))}
                  </div>
                  {hours.lunes?.trim() && (
                    <button
                      type="button"
                      onClick={() =>
                        setHours((p) => {
                          const v = p.lunes ?? "";
                          return Object.fromEntries(WEEK_DAYS.map((d) => [d.key, v]));
                        })
                      }
                      className="mt-3 text-sm font-medium text-violet hover:text-violet-dark transition-colors"
                    >
                      Aplicar el horario del lunes a toda la semana
                    </button>
                  )}
                </Card>

                {/* Características leisure */}
                <Card className="p-6 sm:p-7">
                  <h2 className="font-bold font-heading mb-4 flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-violet" />
                    Características
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <CheckboxButton label="Wifi" icon={<Wifi className="h-4 w-4" />} checked={leisureFlags.has_wifi} onClick={() => toggleLeisure("has_wifi")} />
                    <CheckboxButton label="Billar" checked={leisureFlags.has_billiards} onClick={() => toggleLeisure("has_billiards")} />
                    <CheckboxButton label="Aire acond." icon={<Wind className="h-4 w-4" />} checked={leisureFlags.has_air_conditioning} onClick={() => toggleLeisure("has_air_conditioning")} />
                    <CheckboxButton label="Terraza" icon={<Trees className="h-4 w-4" />} checked={leisureFlags.has_terrace} onClick={() => toggleLeisure("has_terrace")} />
                    <CheckboxButton label="Mesas fuera" checked={leisureFlags.has_outdoor_seating} onClick={() => toggleLeisure("has_outdoor_seating")} />
                    <CheckboxButton label="Parking" checked={leisureFlags.has_parking} onClick={() => toggleLeisure("has_parking")} />
                    <CheckboxButton label="Comida" checked={leisureFlags.has_food} onClick={() => toggleLeisure("has_food")} />
                    <CheckboxButton label="Música en vivo" icon={<Music className="h-4 w-4" />} checked={leisureFlags.has_live_music} onClick={() => toggleLeisure("has_live_music")} />
                    <CheckboxButton label="Acepta grupos" icon={<Users className="h-4 w-4" />} checked={leisureFlags.accepts_groups} onClick={() => toggleLeisure("accepts_groups")} />
                    <CheckboxButton label="Pet-friendly" icon={<Dog className="h-4 w-4" />} checked={leisureFlags.accepts_pets} onClick={() => toggleLeisure("accepts_pets")} />
                    <CheckboxButton label="Descuento estudiantes" checked={leisureFlags.student_discount} onClick={() => toggleLeisure("student_discount")} />
                    <CheckboxButton label="Pago con tarjeta" checked={leisureFlags.card_payment} onClick={() => toggleLeisure("card_payment")} />
                    <CheckboxButton label="Reservas" checked={leisureFlags.reservations} onClick={() => toggleLeisure("reservations")} />
                  </div>
                </Card>
              </>
            )}

            {/* Sección: datos básicos HOUSING */}
            {type === "housing" && (
              <>
                <Card className="p-6 sm:p-7 space-y-4">
                  <h2 className="font-bold font-heading flex items-center gap-2">
                    <Home className="h-5 w-5 text-violet" />
                    Datos del piso
                  </h2>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Título *</label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Habitación luminosa cerca de la URJC" />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Tipo *</label>
                      <select
                        value={housingType}
                        onChange={(e) => setHousingType(e.target.value)}
                        className="flex h-10 w-full rounded-xl border border-border bg-bg-primary px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet/30"
                      >
                        {HOUSING_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Precio (€/mes) *</label>
                      {/* min/max no son adorno: sin ellos un cero de más viajaba
                          al servidor y la columna lo rechazaba, tirando el alta
                          entera con un error que no decía qué campo era. */}
                      <Input type="number" inputMode="numeric" min={1} max={99999999} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="450" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Dirección</label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle Mayor 12" />
                  </div>
                  <div className="grid sm:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Habitaciones</label>
                      <Input type="number" min={1} max={99} value={rooms} onChange={(e) => setRooms(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Baños</label>
                      <Input type="number" min={1} max={99} value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">m² piso</label>
                      <Input type="number" min={1} max={100000} value={sqm} onChange={(e) => setSqm(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">m² habitación</label>
                      <Input type="number" min={1} max={10000} value={roomSize} onChange={(e) => setRoomSize(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                      <BadgePercent className="h-4 w-4 text-violet" />
                      Comisión de inmobiliaria (%) <span className="text-text-muted font-normal">· opcional</span>
                    </label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.5"
                      value={commissionPct}
                      onChange={(e) => setCommissionPct(e.target.value)}
                      placeholder="Ej: 10"
                    />
                    <p className="text-xs text-text-muted mt-1.5">
                      Si como inmobiliaria cobras comisión por este piso, indícala aquí. Si no, déjalo vacío.
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Descripción</label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Cuenta cómo es el piso, qué incluye, transporte cercano…" rows={4} />
                  </div>
                </Card>

                {/* Preferencias inquilino */}
                <Card className="p-6 sm:p-7 space-y-5">
                  <h2 className="font-bold font-heading flex items-center gap-2">
                    <Users className="h-5 w-5 text-violet" />
                    Preferencias del inquilino
                  </h2>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Solo se mostrará a perfiles…</label>
                    <div className="grid grid-cols-3 gap-2">
                      <GenderButton label="Indiferente" active={genderPref === "any"} onClick={() => setGenderPref("any")} />
                      <GenderButton label="Solo chicos" active={genderPref === "hombre"} onClick={() => setGenderPref("hombre")} />
                      <GenderButton label="Solo chicas" active={genderPref === "mujer"} onClick={() => setGenderPref("mujer")} />
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                      Si eliges un género específico, los anónimos no verán el anuncio.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <CheckboxButton label="Permite fumadores" icon={<Cigarette className="h-4 w-4" />} checked={housingFlags.allows_smokers} onClick={() => toggleHousing("allows_smokers")} />
                    <CheckboxButton label="Solo estudiantes" icon={<GraduationCap className="h-4 w-4" />} checked={housingFlags.students_only} onClick={() => toggleHousing("students_only")} />
                    <CheckboxButton label="Permite mascotas" icon={<Dog className="h-4 w-4" />} checked={housingFlags.pets_allowed} onClick={() => toggleHousing("pets_allowed")} />
                  </div>
                </Card>

                {/* Compañeros actuales */}
                <Card className="p-6 sm:p-7 space-y-4">
                  <h2 className="font-bold font-heading flex items-center gap-2">
                    <Users className="h-5 w-5 text-violet" />
                    Compañeros actuales
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Nº de compañeros ya viviendo</label>
                      <Input type="number" min={1} max={50} value={flatmateCount} onChange={(e) => setFlatmateCount(e.target.value)} placeholder="2" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Géneros que ya viven</label>
                      <div className="flex gap-2 mt-2">
                        {(["hombre", "mujer", "no_binario"] as const).map((g) => {
                          const active = flatmateGenders.includes(g);
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() =>
                                setFlatmateGenders((prev) =>
                                  active ? prev.filter((x) => x !== g) : [...prev, g]
                                )
                              }
                              className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                                active
                                  ? "border-text-primary bg-text-primary text-bg-primary font-semibold"
                                  : "border-border bg-bg-primary hover:border-text-primary/40"
                              }`}
                            >
                              {g === "hombre" ? "Chicos" : g === "mujer" ? "Chicas" : "No binario"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Estancia y depósito */}
                <Card className="p-6 sm:p-7 space-y-4">
                  <h2 className="font-bold font-heading">Estancia y fianza</h2>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Estancia (meses)</label>
                      <Input type="number" min={1} max={120} value={minStay} onChange={(e) => setMinStay(e.target.value)} placeholder="6" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Fianza (mensualidades)</label>
                      <Input type="number" step="0.5" min={0} max={99} value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="1" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Disponible hasta</label>
                      {/* Si el navegador no soporta type=date el campo sale como
                          texto libre; el servidor admite también DD/MM/AAAA. */}
                      <Input type="date" placeholder="DD/MM/AAAA" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} />
                    </div>
                  </div>
                </Card>

                {/* Características housing */}
                <Card className="p-6 sm:p-7">
                  <h2 className="font-bold font-heading mb-4 flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-violet" />
                    Características y servicios
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <CheckboxButton label="Amueblado" checked={housingFlags.is_furnished} onClick={() => toggleHousing("is_furnished")} />
                    <CheckboxButton label="Gastos incluidos" checked={housingFlags.bills_included} onClick={() => toggleHousing("bills_included")} />
                    <CheckboxButton label="Agua incluida" checked={housingFlags.water_included} onClick={() => toggleHousing("water_included")} />
                    <CheckboxButton label="Luz incluida" checked={housingFlags.electricity_included} onClick={() => toggleHousing("electricity_included")} />
                    <CheckboxButton label="Wifi" icon={<Wifi className="h-4 w-4" />} checked={housingFlags.has_wifi} onClick={() => toggleHousing("has_wifi")} />
                    <CheckboxButton label="Aire acond." icon={<Wind className="h-4 w-4" />} checked={housingFlags.has_air_conditioning} onClick={() => toggleHousing("has_air_conditioning")} />
                    <CheckboxButton label="Calefacción" checked={housingFlags.has_heating} onClick={() => toggleHousing("has_heating")} />
                    <CheckboxButton label="Ascensor" checked={housingFlags.has_elevator} onClick={() => toggleHousing("has_elevator")} />
                    <CheckboxButton label="Parking" checked={housingFlags.has_parking} onClick={() => toggleHousing("has_parking")} />
                    <CheckboxButton label="Terraza" icon={<Trees className="h-4 w-4" />} checked={housingFlags.has_terrace} onClick={() => toggleHousing("has_terrace")} />
                    <CheckboxButton label="Balcón" checked={housingFlags.has_balcony} onClick={() => toggleHousing("has_balcony")} />
                    <CheckboxButton label="Lavadora" checked={housingFlags.has_washing_machine} onClick={() => toggleHousing("has_washing_machine")} />
                    <CheckboxButton label="Lavavajillas" checked={housingFlags.has_dishwasher} onClick={() => toggleHousing("has_dishwasher")} />
                    <CheckboxButton label="Piscina" checked={housingFlags.has_pool} onClick={() => toggleHousing("has_pool")} />
                    <CheckboxButton label="Gimnasio" checked={housingFlags.has_gym} onClick={() => toggleHousing("has_gym")} />
                    <CheckboxButton label="Cama doble" checked={housingFlags.has_double_bed} onClick={() => toggleHousing("has_double_bed")} />
                    <CheckboxButton label="Baño privado" checked={housingFlags.has_private_bathroom} onClick={() => toggleHousing("has_private_bathroom")} />
                  </div>
                </Card>

                {/* Contacto */}
                <Card className="p-6 sm:p-7 space-y-4">
                  <h2 className="font-bold font-heading">Contacto</h2>
                  {/* Aquí había un campo "Teléfono" que no se enviaba ni existe
                      como columna en accommodations: el propietario lo
                      rellenaba y se perdía. El teléfono de contacto de un piso
                      es el de WhatsApp, que sí se guarda y sí se enseña. */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Teléfono / WhatsApp</label>
                      <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+34 612 345 678" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Email</label>
                      <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contacto@…" />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Instagram</label>
                      <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@tu_piso" />
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* Fotos y vídeos (común; vídeos solo housing) */}
            <Card className="p-6 sm:p-7">
              <h2 className="font-bold font-heading mb-2 flex items-center gap-2">
                <Upload className="h-5 w-5 text-violet" />
                {type === "housing"
                  ? `Fotos y vídeos (${photoCount}/${MAX_PHOTOS} fotos · ${videoCount}/${MAX_VIDEOS} vídeos)`
                  : `Fotos (${photoCount}/${MAX_PHOTOS})`}
                {type === "housing" && (
                  <span className="text-xs font-semibold text-error ml-1">
                    *
                  </span>
                )}
              </h2>
              {type === "housing" && photoCount === 0 && (
                <p className="text-xs text-error mb-4 font-medium">
                  Es obligatorio subir al menos una foto del alojamiento.
                </p>
              )}
              {!(type === "housing" && photoCount === 0) && (
                <p className="text-xs text-text-muted mb-4">
                  La primera foto será la portada. Arrastra para ordenar y haz click para ampliar.
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                // Lista explícita en vez de image/*: con image/* iOS entrega la
                // foto en HEIC tal cual (y el Storage la rechaza), mientras que
                // enumerando los formatos el propio iPhone la convierte a JPEG
                // al elegirla. El conversor de image-upload.ts queda de red.
                accept={
                  type === "housing"
                    ? "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                    : "image/jpeg,image/png,image/webp,image/gif"
                }
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || (photoCount >= MAX_PHOTOS && (type !== "housing" || videoCount >= MAX_VIDEOS))}
                className="w-full h-32 rounded-xl border-2 border-dashed border-border hover:border-violet/40 hover:bg-violet/5 transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="h-6 w-6 text-text-muted" />
                <span className="text-sm text-text-secondary font-medium">
                  {uploading
                    ? "Subiendo…"
                    : type === "housing"
                    ? "Sube tus fotos y vídeos"
                    : "Sube tus fotos"}
                </span>
                <span className="text-xs text-text-muted">
                  {type === "housing"
                    ? `Fotos JPG/PNG/WEBP hasta ${MAX_PHOTO_MB}MB · Vídeos MP4/MOV/WEBM hasta ${MAX_VIDEO_MB}MB`
                    : `JPG, PNG o WEBP · máx ${MAX_PHOTO_MB}MB cada una`}
                </span>
              </button>

              {media.length > 0 && (
                <>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 mt-4">
                    {media.map((item, i) => (
                      <div
                        key={item.url}
                        draggable
                        onDragStart={() => {
                          dragFrom.current = i;
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverIdx !== i) setDragOverIdx(i);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragFrom.current !== null) moveMedia(dragFrom.current, i);
                          dragFrom.current = null;
                          setDragOverIdx(null);
                        }}
                        onDragEnd={() => {
                          dragFrom.current = null;
                          setDragOverIdx(null);
                        }}
                        onClick={() => setPreviewIdx(i)}
                        className={`relative aspect-square rounded-xl overflow-hidden bg-bg-secondary group cursor-grab active:cursor-grabbing ${
                          dragOverIdx === i ? "ring-2 ring-violet ring-offset-2" : ""
                        }`}
                        title="Click para ampliar · arrastra para ordenar"
                      >
                        {item.kind === "image" ? (
                          <img
                            src={item.url}
                            alt={`Foto ${i + 1} subida`}
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        ) : (
                          <>
                            <video
                              src={item.url}
                              className="w-full h-full object-cover pointer-events-none"
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="p-2 rounded-full bg-black/50 text-white">
                                <Play className="h-4 w-4 fill-current" />
                              </span>
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeMedia(i);
                          }}
                          aria-label="Eliminar"
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        {/* Flechas para ordenar (alternativa táctil al arrastre) */}
                        <span className="absolute bottom-1 right-1 flex gap-1">
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveMedia(i, i - 1);
                              }}
                              aria-label="Mover antes"
                              className="p-1 rounded-full bg-black/60 text-white opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {i < media.length - 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveMedia(i, i + 1);
                              }}
                              aria-label="Mover después"
                              className="p-1 rounded-full bg-black/60 text-white opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                        {i === coverIdx && (
                          <span className="absolute bottom-1 left-1 px-2 py-0.5 rounded-full bg-violet text-white text-[10px] font-semibold pointer-events-none">
                            Portada
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted mt-3">
                    Ordena tus fotos y vídeos arrastrándolos (o con las flechas) y haz click en
                    cualquiera para verlo en grande antes de publicar.
                  </p>
                </>
              )}
            </Card>

            {/* Extra info común */}
            <Card className="p-6 sm:p-7">
              <h2 className="font-bold font-heading mb-3">Información extra</h2>
              <Textarea
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
                placeholder="Cualquier cosa que quieras destacar (condiciones, observaciones, normas…)"
                rows={3}
              />
            </Card>

            {/* CTA */}
            {type === "leisure" && !planCovers && (
              <Card className="p-5">
                <LeisureBillingSelector value={billingInterval} onChange={setBillingInterval} disabled={submitting} />
              </Card>
            )}
            <div className="space-y-3">
              {deferredHousingEnabled && type === "housing" && !planCovers && <HousingOfferConsent billing="listing" accepted={housingOfferAccepted} onChange={setHousingOfferAccepted} />}
              <div className="text-center text-sm text-text-secondary">
                {planCovers ? (
                  <>
                    Incluido en tu <strong>Plan Inmobiliarias</strong>: el piso se publicará al
                    instante, sin pasarela de pago.
                  </>
                ) : deferredHousingEnabled && type === "housing" ? (
                  <>Guarda tu tarjeta sin cobro inicial. Tu piso se publica gratis hasta el primer interesado.</>
                ) : (
                  <>
                    Al continuar serás redirigido a Stripe para completar el pago de{" "}
                    <strong>{businessBillingLabel({ type: type ?? "housing", billing_interval: type === "leisure" ? billingInterval : "month" })}</strong>.
                  </>
                )}
              </div>
              <Button
                variant="gradient"
                size="lg"
                className="w-full"
                disabled={!canSubmit || submitting || (deferredHousingEnabled && type === "housing" && !planCovers && !housingOfferAccepted)}
                onClick={handleSubmit}
              >
                {submitting ? (
                  "Procesando…"
                ) : planCovers ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Publicar piso
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    {deferredHousingEnabled && type === "housing" ? "Guardar tarjeta y publicar gratis" : "Continuar al pago"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              {type === "housing" && !ownerStatus?.active && (
                <p className="text-center text-xs text-text-muted">
                  ¿Eres inmobiliaria o tienes varios pisos? Con el{" "}
                  <Link href="/negocio/propietario" className="text-violet underline underline-offset-2">
                    Plan Inmobiliarias
                  </Link>{" "}
                  {deferredHousingEnabled ? "publicas hasta 40 pisos gratis hasta el primer interesado; después, 80 €/mes." : "publicas hasta 40 pisos por 80 €/mes. Consulta la prueba disponible para tu cuenta."}
                </p>
              )}
              <button
                onClick={() => setType(null)}
                className="w-full text-sm text-text-muted hover:text-violet"
              >
                Cambiar tipo de negocio
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Lightbox: ver foto/vídeo en grande antes de publicar ── */}
      {previewIdx !== null && media[previewIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setPreviewIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa"
        >
          <button
            type="button"
            onClick={() => setPreviewIdx(null)}
            aria-label="Cerrar"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          {media.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIdx((p) => (p === null ? p : (p + media.length - 1) % media.length));
              }}
              aria-label="Anterior"
              className="absolute left-2 sm:left-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <div className="max-w-4xl max-h-[85vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {media[previewIdx].kind === "image" ? (
              <img
                src={media[previewIdx].url}
                alt={`Vista previa ${previewIdx + 1}`}
                className="max-h-[78vh] max-w-full object-contain rounded-xl"
              />
            ) : (
              <video
                src={media[previewIdx].url}
                controls
                autoPlay
                playsInline
                className="max-h-[78vh] max-w-full rounded-xl"
              />
            )}
            <p className="text-white/70 text-xs mt-3">
              {previewIdx + 1} / {media.length}
              {previewIdx === coverIdx && " · Portada"}
            </p>
          </div>

          {media.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIdx((p) => (p === null ? p : (p + 1) % media.length));
              }}
              aria-label="Siguiente"
              className="absolute right-2 sm:right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────── Sub-components ───────────
function CheckboxButton({
  label,
  checked,
  onClick,
  icon,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm border transition-all ${
        checked
          ? "border-text-primary bg-text-primary text-bg-primary font-semibold"
          : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function GenderButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl text-sm border transition-all font-medium ${
        active
          ? "border-text-primary bg-text-primary text-bg-primary"
          : "border-border bg-bg-primary hover:border-text-primary/40"
      }`}
    >
      {label}
    </button>
  );
}
