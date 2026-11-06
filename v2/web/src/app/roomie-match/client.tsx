"use client";

import { useState, useCallback, useEffect, useMemo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  Users, Heart, Moon, BookOpen, Dog, Cigarette, LogIn, HeartHandshake,
  MapPin, Euro, X, Volume2, SprayCanIcon as Spray, PartyPopper,
  GraduationCap, Smile, SlidersHorizontal, RefreshCw, Check, Undo2,
  AlertTriangle, ArrowRight, ArrowLeft,
} from "lucide-react";
import { motion, MotionConfig, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Reveal, CountUp } from "@/components/motion";
import { cn } from "@/lib/utils";
import VerifiedBadge from "@/components/VerifiedBadge";
import RoomieConnections from "./components/RoomieConnections";
import HousingStatusCard from "./components/housing-status-card";
import {
  labelSmoking, labelPartying, labelSleep, labelCleanliness,
  labelStudy, labelFriends, labelPet,
} from "@/lib/lifestyle-labels";

// Chip de opción del cuestionario: contorno hairline en reposo y oscuro (casi
// negro) al seleccionar. Es el mismo gesto que el chip "Comparar" del catálogo
// de pisos.
const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.98]",
    active
      ? "border-text-primary bg-text-primary text-bg-primary"
      : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/40 hover:text-text-primary"
  );

// Segmento de pestañas (mismo aspecto que ui/tabs): la activa en blanco con
// sombra hairline, el resto en gris.
const segmentClass = (active: boolean) =>
  cn(
    "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-[color,background-color,box-shadow] duration-200",
    active
      ? "bg-bg-primary font-semibold text-text-primary shadow-card"
      : "text-text-muted hover:text-text-primary"
  );

// Botón redondo de acción de la tarjeta (pasar / me gusta): contorno, icono
// suelto, sin tintes ni degradados.
const roundActionClass =
  "inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-bg-primary text-text-primary transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-text-primary/40 hover:shadow-card-hover active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:hover:translate-y-0";

const LIFESTYLE_QUESTIONS = [
  {
    id: "smoking",
    label: "¿Fumas?",
    icon: Cigarette,
    options: ["no", "ocasional", "si"],
    labels: ["No fumo", "Ocasional", "Sí, fumo"],
  },
  {
    id: "partying",
    label: "¿Sales de fiesta?",
    icon: PartyPopper,
    options: ["nunca", "a_veces", "fines_de_semana", "mucho"],
    labels: ["Nunca", "A veces", "Fines de semana", "Mucho"],
  },
  {
    id: "study_habits",
    label: "¿Dónde estudias?",
    icon: BookOpen,
    options: ["en_casa", "biblioteca", "mixto"],
    labels: ["En casa", "Biblioteca", "Ambos"],
  },
  {
    id: "sleep_schedule",
    label: "Horario de sueño",
    icon: Moon,
    options: ["madrugador", "normal", "nocturno"],
    labels: ["Madrugador", "Normal (23-8h)", "Noctámbulo"],
  },
  {
    id: "cleanliness",
    label: "Nivel de limpieza",
    icon: Spray,
    options: ["muy_limpio", "normal", "relajado"],
    labels: ["Muy limpio", "Normal", "Relajado"],
  },
  {
    id: "noise_tolerance",
    label: "Tolerancia al ruido",
    icon: Volume2,
    options: ["silencio", "normal", "no_me_importa"],
    labels: ["Necesito silencio", "Normal", "No me importa"],
  },
  {
    id: "friends_at_home",
    label: "¿Traes amigos a casa?",
    icon: Smile,
    options: ["nunca", "a_veces", "frecuentemente"],
    labels: ["Nunca", "A veces", "Frecuentemente"],
  },
  {
    id: "pet_friendly",
    label: "¿Mascotas?",
    icon: Dog,
    options: ["no", "me_gustan", "tengo"],
    labels: ["Prefiero sin", "Me gustan", "Tengo mascota"],
  },
];

/**
 * ¿Estas respuestas son de verdad las del cuestionario?
 *
 * No basta con que las 8 columnas tengan algo: los DEFAULT de la migración 006
 * y el onboarding las rellenan solas con OTRO vocabulario ('flexible',
 * 'moderado', cleanliness numérico…), y por eso casi todo el mundo aparecía
 * como "con cuestionario hecho" y salían compatibilidades del 100 %. Aquí se
 * exige que cada valor pertenezca a las opciones reales de la pregunta, que es
 * exactamente el mismo predicado que aplica el servidor en la migración 157
 * (public.lifestyle_answers_complete).
 */
function answeredQuestionnaire(lifestyle: Record<string, string>): boolean {
  return LIFESTYLE_QUESTIONS.every((q) => q.options.includes(lifestyle[q.id]));
}

// Normaliza texto para comparar ciudades: minúsculas, sin espacios sobrantes
// y sin acentos (NFD), igual que FomoUniversityPicker. Así "Alacant " o
// "MÁLAGA" coinciden con "Alacant"/"Malaga".
function normalizeCity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

interface RoomieProfile {
  id: string;
  full_name: string;
  avatar_url?: string;
  photos?: string[];
  bio?: string;
  career?: string;
  gender?: string;
  diet?: string;
  academic_year?: number;
  city: string;
  budget_min: number;
  budget_max: number;
  smoking: string;
  partying: string;
  study_habits: string;
  sleep_schedule: string;
  cleanliness: string | number;
  noise_tolerance: string;
  friends_at_home: string;
  pet_friendly: string | boolean;
  hobbies: string[];
  university_name?: string;
  // Correo universitario confirmado (migración 025): el distintivo de
  // estudiante verificado pesa a la hora de elegir con quién vives.
  student_email_verified?: boolean | null;
  /** null = no hay porcentaje honesto que enseñar (migración 157). */
  compatibility: number | null;
  /** Por qué no lo hay: 'me' = falta MI cuestionario, 'them' = el suyo. */
  compatReason: CompatReason;
}

type CompatReason = "ok" | "me" | "them" | "both";

function SwipeCard({
  profile,
  onLike,
  onPass,
}: {
  profile: RoomieProfile;
  onLike: () => void;
  onPass: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const passOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > 120) onLike();
    else if (info.offset.x < -120) onPass();
  };

  // Galería: primero `photos[]`, si no hay se usa avatar_url.
  const galleryPhotos =
    profile.photos && profile.photos.length > 0
      ? profile.photos
      : profile.avatar_url
      ? [profile.avatar_url]
      : [];
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    setPhotoIdx(0);
  }, [profile.id]);
  const nextPhoto = () => {
    if (galleryPhotos.length > 0) setPhotoIdx((i) => (i + 1) % galleryPhotos.length);
  };
  const prevPhoto = () => {
    if (galleryPhotos.length > 0)
      setPhotoIdx((i) => (i - 1 + galleryPhotos.length) % galleryPhotos.length);
  };

  // Chips de estilo de vida: solo se pintan los valores con traducción conocida
  // (labelX devuelve null para valores raros y así no sale "5" o "false" crudo).
  const lifestyleChips = [
    labelSmoking(profile.smoking),
    labelPartying(profile.partying),
    labelSleep(profile.sleep_schedule),
    labelCleanliness(profile.cleanliness),
    labelStudy(profile.study_habits),
    labelFriends(profile.friends_at_home),
    labelPet(profile.pet_friendly),
  ].filter((l): l is string => l !== null);

  return (
    <motion.div
      className="absolute w-full cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      onDragEnd={handleDragEnd}
    >
      <div className="relative overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-float">
        {/* Sellos que aparecen con el arrastre: oscuro para el like, contorno para el pase */}
        <motion.div
          className="pointer-events-none absolute right-6 top-6 z-10 rotate-12 rounded-full border border-text-primary bg-text-primary px-4 py-1.5 font-heading text-sm font-bold uppercase tracking-wider text-bg-primary shadow-card"
          style={{ opacity: likeOpacity }}
          aria-hidden="true"
        >
          Me gusta
        </motion.div>
        <motion.div
          className="pointer-events-none absolute left-6 top-6 z-10 -rotate-12 rounded-full border border-text-primary bg-bg-primary px-4 py-1.5 font-heading text-sm font-bold uppercase tracking-wider text-text-primary shadow-card"
          style={{ opacity: passOpacity }}
          aria-hidden="true"
        >
          Paso
        </motion.div>

        {/* Foto en marco redondeado con zoom lento */}
        <div className="p-3 pb-0">
          <div className="img-zoom relative h-72 overflow-hidden rounded-3xl bg-bg-secondary sm:h-80">
            {galleryPhotos.length > 0 ? (
              <img
                key={galleryPhotos[photoIdx]}
                src={galleryPhotos[photoIdx]}
                alt={`Foto ${photoIdx + 1} de ${profile.full_name}`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="font-heading text-7xl font-extrabold text-violet/25">{profile.full_name[0]}</span>
              </div>
            )}

            {galleryPhotos.length > 1 && (
              <>
                {/* Zonas de toque (como en las historias) */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-0 left-0 top-0 z-[5] w-1/3 bg-transparent"
                  aria-label="Foto anterior"
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-0 right-0 top-0 z-[5] w-1/3 bg-transparent"
                  aria-label="Siguiente foto"
                />
                {/* Barras indicadoras */}
                <div className="absolute left-3 right-3 top-3 z-[6] flex gap-1">
                  {galleryPhotos.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full transition-colors",
                        i === photoIdx ? "bg-white" : "bg-white/40"
                      )}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Afinidad. Sin cuestionario no hay porcentaje (157). */}
            <div
              className={cn(
                "absolute right-3 top-3 z-[7] rounded-full bg-bg-primary/95 px-3 py-1.5 text-xs font-bold shadow-card backdrop-blur tabular",
                profile.compatibility === null ? "text-text-muted" : "text-text-primary"
              )}
            >
              {profile.compatibility === null ? "Sin cuestionario" : `${profile.compatibility}% match`}
            </div>

            {/* Perfil completo */}
            <Link
              href={`/perfil/${profile.id}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="group absolute bottom-3 right-3 z-[7] inline-flex items-center gap-1.5 rounded-full bg-bg-primary/95 px-3 py-1.5 text-xs font-semibold text-text-primary shadow-card backdrop-blur transition-colors hover:bg-bg-primary"
            >
              Ver perfil completo
              <ArrowRight className="h-3.5 w-3.5 arrow-nudge" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="p-5">
          {/* Nombre y carrera */}
          <div className="mb-3">
            <h3 className="flex items-center gap-1.5 font-heading text-2xl font-bold tracking-tight text-text-primary">
              <span className="truncate">{profile.full_name}</span>
              <VerifiedBadge verified={profile.student_email_verified} size="md" />
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {profile.career && (
                <span className="text-sm font-medium text-text-secondary">{profile.career}</span>
              )}
              {profile.university_name && (
                <span className="flex items-center gap-1 text-xs text-text-muted">
                  <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {profile.university_name}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" strokeWidth={1.75} />{profile.city}</span>
              <span className="flex items-center gap-1 tabular"><Euro className="h-3 w-3" strokeWidth={1.75} />{profile.budget_min} a {profile.budget_max}€/mes</span>
            </div>
          </div>

          {/* Sin porcentaje: se explica por qué en vez de inventar un número. */}
          {profile.compatibility === null && (
            <p className="mb-3 rounded-xl border border-border-light px-3 py-2 text-xs text-text-muted">
              {profile.compatReason === "them"
                ? "Esta persona aún no ha respondido el cuestionario de convivencia."
                : "Completa tu cuestionario de convivencia para ver vuestra compatibilidad."}
            </p>
          )}

          {/* Bio */}
          {profile.bio && (
            <p className="mb-3 line-clamp-2 text-sm text-text-secondary">{profile.bio}</p>
          )}

          {/* Hábitos */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {lifestyleChips.map((label) => (
              <span key={label} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary">{label}</span>
            ))}
          </div>

          {/* Aficiones */}
          {profile.hobbies && profile.hobbies.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.hobbies.slice(0, 6).map((h) => (
                <span key={h} className="rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Acciones: dos botones redondos de contorno */}
        <div className="flex items-center justify-center gap-6 border-t border-border-light p-4">
          <button type="button" onClick={onPass} aria-label="Pasar" className={roundActionClass}>
            <X className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button type="button" onClick={onLike} aria-label="Me gusta" className={cn(roundActionClass, "text-violet")}>
            <Heart className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Mazo desde el servidor (get_discovery_feed) ──────────────────────────
// Antes la web bajaba TODOS los perfiles de public_profiles, pedía el
// porcentaje aparte (get_roomie_compatibility) y anotaba los swipes con un
// upsert directo a roommate_matches, así que un descarte hecho en la app
// volvía a salir aquí y al revés. La app nunca hizo eso: usa las RPC de
// descubrimiento (migraciones 011/108/119/140/163), que ya excluyen a quien
// has deslizado (swipe_actions), exigen foto y perfil completo, ordenan por
// boost y compatibilidad y, en el like, abren el chat y detectan el match.
// Ahora la web usa EXACTAMENTE las mismas cuatro RPC que mobile/app/roomie.tsx:
//   · get_discovery_feed(p_user_id, 'roomie', p_limit)  → mazo (SETOF JSONB)
//   · process_swipe_action(p_user_id, p_target_id, 'roomie', 'like' | 'pass')
//   · undo_last_swipe('roomie')      → uuid del perfil que vuelve al mazo
//   · reset_passed_swipes('roomie')  → nº de descartes borrados (likes intactos)
// El porcentaje lo calcula el servidor (157) y viene dentro de cada fila; aquí
// no se calcula nada.

/** Una fila del JSON que devuelve get_discovery_feed para 'roomie' (163). */
interface FeedRow {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  photos?: string[] | null;
  bio?: string | null;
  career?: string | null;
  academic_year?: number | null;
  city?: string | null;
  hobbies?: string[] | null;
  interests?: string[] | null;
  budget_min?: number | null;
  budget_max?: number | null;
  university_name?: string | null;
  is_verified?: boolean | null;
  smoking?: string | null;
  partying?: string | null;
  study_habits?: string | null;
  sleep_schedule?: string | null;
  // cleanliness llega como número (slider 1-5 del onboarding) o texto (flujo
  // antiguo); pet_friendly como booleano o texto. Ver lib/lifestyle-labels.ts.
  cleanliness?: string | number | null;
  noise_tolerance?: string | null;
  friends_at_home?: string | null;
  pet_friendly?: string | boolean | null;
  /** null = no hay porcentaje honesto que enseñar (migración 157). */
  compatibility?: number | null;
  compatibility_reason?: CompatReason | null;
}

function mapFeedRow(p: FeedRow): RoomieProfile {
  return {
    id: p.id,
    full_name: p.full_name || "Estudiante",
    avatar_url: p.avatar_url || undefined,
    photos: Array.isArray(p.photos) && p.photos.length > 0 ? p.photos : undefined,
    bio: p.bio || undefined,
    career: p.career || undefined,
    academic_year: p.academic_year || undefined,
    city: p.city || "",
    budget_min: p.budget_min || 200,
    budget_max: p.budget_max || 500,
    smoking: p.smoking ?? "",
    partying: p.partying ?? "",
    study_habits: p.study_habits ?? "",
    sleep_schedule: p.sleep_schedule ?? "",
    cleanliness: p.cleanliness ?? "",
    noise_tolerance: p.noise_tolerance ?? "",
    friends_at_home: p.friends_at_home ?? "",
    pet_friendly: p.pet_friendly ?? "",
    // Las aficiones reales (158); si no hay, los intereses del perfil antiguo.
    hobbies:
      Array.isArray(p.hobbies) && p.hobbies.length > 0
        ? p.hobbies
        : Array.isArray(p.interests)
          ? p.interests
          : [],
    university_name: p.university_name || undefined,
    student_email_verified: p.is_verified ?? null,
    compatibility: typeof p.compatibility === "number" ? p.compatibility : null,
    compatReason: p.compatibility_reason ?? "both",
  };
}

type SwipeAction = "like" | "pass";
type RpcErrorLike = { code?: string; message?: string; hint?: string } | null | undefined;

/**
 * Igual que classifySwipeFailure en la app: 'incomplete' si el servidor ha
 * rechazado el swipe por perfil de roomie incompleto (migración 119), 'server'
 * si volvió con un código de Postgres (llegó al servidor, no es la red) y
 * 'network' en cualquier otro caso.
 */
function classifySwipeFailure(error: RpcErrorLike): "incomplete" | "network" | "server" {
  const text = `${error?.message ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  if (text.includes("roomie_profile_incomplete")) return "incomplete";
  const hasPgCode = !!error?.code;
  const mentionsNetwork = /network|fetch|conexi[oó]n|timeout|timed out/.test(text);
  if (!hasPgCode || mentionsNetwork) return "network";
  return "server";
}

// "La función aún no existe" (migración 140 sin aplicar en prod). Fail-soft:
// Deshacer y Volver a ver descartados se ocultan sin más si no existen.
function isMissingRpcError(error: RpcErrorLike): boolean {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  return code === "42883" || code === "PGRST202"
    || msg.includes("could not find the function") || msg.includes("does not exist");
}


function RoomieMatchClientInner() {
  const searchParams = useSearchParams();
  const connectionTab = searchParams.get('tab');
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const isCurrent = useSessionGuard(user?.id ?? null);
  const operation = useRef(false);
  const loadGeneration = useRef(0);
  const [profileError, setProfileError] = useState(false);
  const [retryProfile, setRetryProfile] = useState(0);
  const [view, setView] = useState<'discover' | 'connections'>('discover');
  useEffect(() => {
    if (window.location.hash === '#roomie-likes' || ['connections','received','given','matches'].includes(connectionTab ?? '')) setView('connections');
  }, [connectionTab]);

  // Datos
  // El mazo tal cual lo manda el servidor (ya sin la gente deslizada, con foto
  // y ordenado). La ciudad se acota aquí, en memoria.
  const [deck, setDeck] = useState<RoomieProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState(false);
  // Cuántas personas buscan roomie en total (solo para la cabecera): el mazo
  // llega acotado (máx. 50) y sin la gente que ya has deslizado.
  const [totalLooking, setTotalLooking] = useState<number | null>(null);
  const [hasLifestyle, setHasLifestyle] = useState(false);
  const [myLifestyle, setMyLifestyle] = useState<Record<string, string>>({});
  const [myCity, setMyCity] = useState("");
  const [myBudgetMin, setMyBudgetMin] = useState(200);
  const [myBudgetMax, setMyBudgetMax] = useState(500);
  // Requisitos del perfil de búsqueda (deben coincidir con roomie_profile_complete,
  // migración 120): búsqueda activa + presupuesto + ciudad + bio + foto.
  const [reqs, setReqs] = useState({ search: false, budget: false, city: false, bio: false, photo: false });
  const searchReady = reqs.search && reqs.budget && reqs.city && reqs.bio && reqs.photo;

  // Lifestyle form modal
  const [formOpen, setFormOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);

  // Swipe
  const [swipeCity, setSwipeCity] = useState("");
  // Perfiles deslizados en esta sesión: se quitan del mazo sin recargar y
  // "Deshacer" los puede devolver al frente.
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [likedCount, setLikedCount] = useState(0);
  // Último swipe guardado (para saber si al deshacer baja el contador de likes).
  const lastSwipeRef = useRef<{ id: string; action: SwipeAction } | null>(null);
  // 140: hay un último swipe GUARDADO en el servidor que se puede deshacer. Es
  // de un solo uso: tras deshacer (o si el swipe ni se guardó) vuelve a false.
  const [canUndo, setCanUndo] = useState(false);
  // Fail-soft: si undo_last_swipe/reset_passed_swipes no existen aún en prod
  // (migración 140 sin aplicar) se ocultan sin más, sin volver a intentarlo.
  const [undoUnavailable, setUndoUnavailable] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Pide el mazo al servidor. Se llama al entrar, tras guardar preferencias y
  // tras "volver a ver descartados". Sin perfil de roomie completo el servidor
  // devuelve vacío (163), así que en ese caso ni se pide: el bloqueo de abajo
  // ya explica qué falta.
  const loadDeck = useCallback(async (ready: boolean) => {
    if (!user || !isCurrent()) return;
    const generation = ++loadGeneration.current;
    setCanUndo(false);
    lastSwipeRef.current = null;
    setSwipedIds(new Set());
    setDeckError(false);
    if (!ready) {
      setDeck([]);
      return;
    }
    setDeckLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_discovery_feed", {
        p_user_id: user.id,
        p_target_type: "roomie",
        p_limit: 50,
      });
      if (!isCurrent() || generation !== loadGeneration.current) return;
      if (error) throw error;
      setDeck(((data ?? []) as FeedRow[]).map(mapFeedRow));
    } catch (err) {
      if (!isCurrent() || generation !== loadGeneration.current) return;
      console.error("get_discovery_feed:", err);
      setDeck([]);
      setDeckError(true);
    } finally {
      if (isCurrent() && generation === loadGeneration.current) setDeckLoading(false);
    }
  }, [user, isCurrent]);

  // Al entrar: mi perfil (para el bloqueo y las preferencias) y el mazo.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }

    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setProfileError(false);
      try {
        const supabase = createClient();
        const lifestyle: Record<string, string> = {};

        const { data: myProfile, error: profError } = await supabase
          .from("profiles")
          .select("smoking, partying, study_habits, sleep_schedule, cleanliness, noise_tolerance, friends_at_home, pet_friendly, city, budget_min, budget_max, looking_for_roommate, bio, avatar_url, photos")
          .eq("id", user!.id)
          .single();

        if (cancelled || !isCurrent()) return;
        // Sin el perfil no se puede decidir si está completo: un fallo de red
        // aquí enseñaba "te faltan 5 cosas" a quien lo tenía todo relleno.
        if (profError || !myProfile) {
          setProfileError(true);
          return;
        }

        for (const q of LIFESTYLE_QUESTIONS) {
          const val = (myProfile as Record<string, unknown>)[q.id];
          if (val) lifestyle[q.id] = String(val);
        }
        setHasLifestyle(answeredQuestionnaire(lifestyle));
        setMyLifestyle(lifestyle);
        setSwipeCity(myProfile.city || "");
        setMyCity(myProfile.city || "");
        setMyBudgetMin(myProfile.budget_min ?? 200);
        setMyBudgetMax(myProfile.budget_max ?? 500);
        // Requisitos del perfil de búsqueda (idénticos a roomie_profile_complete)
        const mp = myProfile as Record<string, unknown>;
        const photosArr = Array.isArray(mp.photos) ? (mp.photos as unknown[]) : [];
        const nextReqs = {
          search: mp.looking_for_roommate === true,
          budget: mp.budget_min != null,
          city: (myProfile.city || "").trim().length >= 2,
          bio: String(mp.bio ?? "").trim().length >= 10,
          photo: String(mp.avatar_url ?? "").trim().length > 0 || photosArr.length > 0,
        };
        setReqs(nextReqs);
        const ready = nextReqs.search && nextReqs.budget && nextReqs.city && nextReqs.bio && nextReqs.photo;

        // Cabecera: cuánta gente busca roomie ahora mismo, sin bajar sus
        // perfiles (public_profiles no lleva PII y la vista deja contar).
        const { count } = await supabase
          .from("public_profiles")
          .select("id", { count: "exact", head: true })
          .eq("looking_for_roommate", true)
          .neq("id", user!.id);
        if (cancelled || !isCurrent()) return;
        setTotalLooking(count ?? null);

        await loadDeck(ready);
      } catch (err) {
        if (cancelled || !isCurrent()) return;
        console.error("loadData error:", err);
        setProfileError(true);
      } finally {
        if (!cancelled && isCurrent()) setLoading(false);
      }
    }

    void loadData();
    return () => { cancelled = true; loadGeneration.current += 1; };
  }, [user, authLoading, loadDeck, isCurrent, retryProfile]);

  // Mazo visible: lo del servidor menos lo deslizado en esta sesión, acotado a
  // la ciudad elegida. La primera carta es la que se enseña.
  const swipeProfiles = useMemo(() => {
    const cityNeedle = normalizeCity(swipeCity);
    return deck.filter(
      (p) => !swipedIds.has(p.id) && (!cityNeedle || normalizeCity(p.city).includes(cityNeedle))
    );
  }, [deck, swipeCity, swipedIds]);
  const [browseMode, setBrowseMode] = useState<"list" | "swipe">("swipe");
  const current = swipeProfiles[0] ?? null;
  // Quedan cartas en el mazo pero ninguna en la ciudad escrita (distinto de
  // haber agotado el mazo, que es cuando se ofrece recuperar descartados).
  const hiddenByCity = current === null && deck.some((p) => !swipedIds.has(p.id));

  const showIncomplete = useCallback(() => {
    toast.error(
      "Completa tu perfil de roomie",
      "Activa tu búsqueda y añade presupuesto, ciudad, foto y una bio para empezar a hacer match."
    );
  }, [toast]);

  // Un like o un descarte. process_swipe_action guarda la fila en swipe_actions
  // (lo que el feed excluye a partir de ahora, también en la app) y en el like
  // abre el chat y dice si hay match. La carta solo se quita si el servidor lo
  // ha guardado: si falla, se queda y se avisa, no se pierde en silencio.
  const swipe = useCallback(async (action: SwipeAction, target?: RoomieProfile) => {
    const profile = target ?? current;
    if (!profile || !user || operation.current || !isCurrent()) return;
    if (!searchReady) {
      // Defensa en cliente: el servidor también lo rechaza (migración 119).
      showIncomplete();
      return;
    }
    operation.current = true;
    setSwiping(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("process_swipe_action", {
        p_user_id: user.id,
        p_target_id: profile.id,
        p_target_type: "roomie",
        p_action: action,
      });
      if (!isCurrent()) return;
      if (error) {
        const kind = classifySwipeFailure(error);
        if (kind === "incomplete") {
          // El servidor es la fuente de verdad de la completitud (119).
          showIncomplete();
          return;
        }
        // Este swipe NO llegó a guardarse: no hay nada que deshacer todavía.
        setCanUndo(false);
        console.error("process_swipe_action:", error);
        const what = action === "like" ? "tu like" : "el descarte";
        if (kind === "network") {
          toast.error(`No se pudo guardar ${what}`, "Revisa tu conexión e inténtalo de nuevo.");
        } else {
          toast.error(`No se pudo guardar ${what}`, "Ha fallado el servidor. Prueba de nuevo en un momento.");
        }
        return;
      }
      setSwipedIds((prev) => new Set(prev).add(profile.id));
      lastSwipeRef.current = { id: profile.id, action };
      setCanUndo((data as { match?: boolean } | null)?.match !== true);
      if (action === "like") {
        setLikedCount((n) => n + 1);
        const matched = (data as { match?: boolean } | null)?.match === true;
        if (matched) {
          const chatId = (data as { conversation_id?: string | null } | null)?.conversation_id;
          toast.success("¡Match!", `${profile.full_name} también te había dado like. ${chatId ? "Tenéis una conversación disponible en Matches." : "El interés es mutuo. El chat depende de vuestras preferencias de privacidad."}`);
        }
      }
    } catch {
      if (isCurrent()) toast.error("No se pudo guardar", "La tarjeta sigue aquí. Comprueba tu conexión y reintenta.");
    } finally {
      operation.current = false;
      if (isCurrent()) setSwiping(false);
    }
  }, [current, user, searchReady, showIncomplete, toast, isCurrent]);

  const handleLike = useCallback(() => { void swipe("like"); }, [swipe]);
  const handlePass = useCallback(() => { void swipe("pass"); }, [swipe]);

  // Deshacer el último swipe (140): borra su fila en swipe_actions y devuelve
  // la carta al frente del mazo. Un solo uso por swipe (canUndo se apaga tanto
  // si funciona como si el servidor no tenía nada que deshacer).
  const handleUndo = useCallback(async () => {
    if (!canUndo || undoUnavailable || operation.current || !isCurrent()) return;
    operation.current = true;
    setUndoing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("undo_last_swipe", { p_target_type: "roomie" });
      if (!isCurrent()) return;
      if (error) {
        if (isMissingRpcError(error)) { setUndoUnavailable(true); return; }
        console.error("undo_last_swipe:", error);
        toast.error("No se pudo deshacer", "Inténtalo de nuevo en unos segundos.");
        return;
      }
      setCanUndo(false);
      const restoredId = typeof data === "string" ? data : null;
      if (!restoredId) return; // no había nada que deshacer en el servidor
      const last = lastSwipeRef.current;
      lastSwipeRef.current = null;
      if (last?.id === restoredId && last.action === "like") setLikedCount((n) => Math.max(0, n - 1));
      const item = deck.find((p) => p.id === restoredId);
      if (!item) {
        // Se deslizó desde la app o el mazo se recargó: se pide otra vez.
        await loadDeck(searchReady);
        return;
      }
      setDeck((prev) => [item, ...prev.filter((p) => p.id !== restoredId)]);
      setSwipedIds((prev) => {
        const next = new Set(prev);
        next.delete(restoredId);
        return next;
      });
    } catch {
      if (isCurrent()) toast.error("No se pudo deshacer", "Comprueba tu conexión y reintenta.");
    } finally {
      operation.current = false;
      if (isCurrent()) setUndoing(false);
    }
  }, [canUndo, undoUnavailable, deck, loadDeck, searchReady, toast, isCurrent]);

  // "Volver a ver descartados" (140): borra SOLO los descartes en el servidor
  // (los likes nunca, que pueden ser matches) y recarga el mazo. Solo se
  // ofrece con el mazo agotado, como en la app.
  const handleResetPassed = useCallback(async () => {
    if (operation.current || !isCurrent()) return;
    operation.current = true;
    setResetting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("reset_passed_swipes", { p_target_type: "roomie" });
      if (!isCurrent()) return;
      if (error) {
        if (isMissingRpcError(error)) {
          setUndoUnavailable(true);
          toast.info("Aún no disponible", "Esta función llega en una próxima actualización.");
          return;
        }
        console.error("reset_passed_swipes:", error);
        toast.error("No se pudo reiniciar", "Inténtalo de nuevo en unos segundos.");
        return;
      }
      const n = typeof data === "number" ? data : 0;
      if (n === 0) {
        toast.info("Nada que recuperar", "No tenías perfiles descartados. Tus likes nunca se borran con esto.");
        return;
      }
      toast.success(n === 1 ? "1 perfil recuperado" : `${n} perfiles recuperados`, "Vuelven a salir en el mazo.");
      await loadDeck(searchReady);
    } catch {
      if (isCurrent()) toast.error("No se pudo recuperar", "Comprueba tu conexión y reintenta.");
    } finally {
      operation.current = false;
      if (isCurrent()) setResetting(false);
    }
  }, [toast, loadDeck, searchReady, isCurrent]);

  // Save lifestyle preferences + enable roomie matching
  const handleSaveLifestyle = useCallback(async (payload: {
    lifestyle: Record<string, string>;
    city: string;
    budget_min: number;
    budget_max: number;
  }) => {
    if (!user || operation.current || !isCurrent()) return;
    operation.current = true;
    setFormSaving(true);
    try {
      const supabase = createClient();
      const update: Record<string, unknown> = {
        smoking: payload.lifestyle.smoking || null,
        partying: payload.lifestyle.partying || null,
        study_habits: payload.lifestyle.study_habits || null,
        sleep_schedule: payload.lifestyle.sleep_schedule || null,
        cleanliness: payload.lifestyle.cleanliness || null,
        noise_tolerance: payload.lifestyle.noise_tolerance || null,
        friends_at_home: payload.lifestyle.friends_at_home || null,
        pet_friendly: payload.lifestyle.pet_friendly || null,
        city: payload.city || null,
        budget_min: payload.budget_min,
        budget_max: payload.budget_max,
        looking_for_roommate: true,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
      if (!isCurrent()) return;
      if (error) {
        toast.error("No se han guardado tus preferencias. Revisa la conexión e inténtalo de nuevo.");
        return;
      }
      // Update local state + recompute compatibility
      setMyLifestyle(payload.lifestyle);
      setMyCity(payload.city);
      setMyBudgetMin(payload.budget_min);
      setMyBudgetMax(payload.budget_max);
      setHasLifestyle(answeredQuestionnaire(payload.lifestyle));
      // El formulario activa la búsqueda y fija presupuesto/ciudad; refrescamos
      // esos requisitos (bio y foto se completan en el perfil, no aquí).
      setReqs((r) => ({
        ...r,
        search: true,
        budget: payload.budget_min != null,
        city: (payload.city || "").trim().length >= 2,
      }));
      if (payload.city && !swipeCity) setSwipeCity(payload.city);
      setFormOpen(false);
      // Los porcentajes los calcula el servidor y vienen dentro del mazo: al
      // acabar de contestar se vuelve a pedir entero (con el perfil ya
      // completo puede que el servidor devuelva gente que antes no daba).
      const ready =
        reqs.bio && reqs.photo && payload.budget_min != null && (payload.city || "").trim().length >= 2;
      await loadDeck(ready);
    } catch {
      if (!isCurrent()) return;
      toast.error("No se pudo guardar", "Tus preferencias siguen abiertas. Revisa la conexión y reintenta.");
    } finally {
      operation.current = false;
      if (isCurrent()) setFormSaving(false);
    }
  }, [user, swipeCity, reqs.bio, reqs.photo, loadDeck, isCurrent, toast]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16" role="status" aria-busy="true">
        <span className="sr-only">Cargando roomies</span>
        <Skeleton className="h-3 w-40 rounded-md" />
        <Skeleton className="mt-4 h-12 w-72 max-w-full" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full rounded-lg" />
        <div className="mx-auto mt-12 max-w-5xl">
          <Skeleton className="h-11 w-72 max-w-full" />
          <Skeleton className="mt-8 h-20 w-full rounded-2xl" />
          <Skeleton className="mx-auto mt-6 h-[520px] w-full max-w-md rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Reveal className="max-w-xl">
            <p className="eyebrow">RoomieMatch</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">Encuentra tu roomie ideal</h1>
            <p className="mt-4 max-w-xl text-text-muted">
              Compara ciudad, presupuesto y hábitos. Guarda tus likes y encuentra tus matches para empezar a hablar de convivencia.
            </p>
            <div className="mt-8">
              <Link
                href="/login?next=%2Froomie-match"
                className={cn(buttonVariants({ variant: "dark", size: "lg" }), "group btn-shine")}
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Iniciar Sesión
                <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    );
  }

  const goConnections = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setView("connections");
  };
  const actionsBusy = undoing || swiping || resetting || formSaving;

  return (
    <div className="bg-bg-primary">
      {/* Cabecera de listado: eyebrow, título grande y acciones a la derecha */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <Reveal className="max-w-xl">
              <p className="eyebrow">Tu próxima convivencia</p>
              <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">RoomieMatch</h1>
              <p className="mt-3 max-w-xl text-text-muted">
                Compara presupuesto y hábitos, guarda a quienes te encajan y habla cuando el interés sea mutuo.
                {!hasLifestyle && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => setFormOpen(true)}
                      className="link-underline font-semibold text-violet"
                    >
                      Completa tus preferencias
                    </button>{" "}
                    para ver % de compatibilidad.
                  </>
                )}
              </p>
              {totalLooking != null && totalLooking > 0 && (
                <p className="mt-5 flex items-center gap-2 text-sm text-text-muted">
                  <Users className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" />
                  <span className="font-heading text-lg font-bold text-text-primary tabular">
                    <CountUp value={totalLooking} />
                  </span>
                  {totalLooking === 1 ? "persona busca roomie ahora mismo" : "personas buscan roomie ahora mismo"}
                </p>
              )}
            </Reveal>

            <Reveal delay={80} className="flex flex-wrap items-center gap-2">
              <Link
                href="/roomie-match?tab=connections"
                onClick={goConnections}
                className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
              >
                <Heart className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" />
                Mis matches y likes
              </Link>
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => setFormOpen(true)}
                aria-label="Editar preferencias de roomie"
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Editar preferencias
              </Button>
            </Reveal>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <nav aria-label="RoomieMatch" className="mb-8 flex gap-1 rounded-xl bg-bg-secondary p-1 sm:inline-flex">
          <button type="button" onClick={() => setView("discover")} aria-pressed={view === "discover"} className={segmentClass(view === "discover")}>
            Descubrir compañeros
          </button>
          <button type="button" onClick={() => setView("connections")} aria-pressed={view === "connections"} className={segmentClass(view === "connections")}>
            Likes y matches
          </button>
        </nav>

        {view === "connections" && (
          <div key="connections" className="animate-page-in">
            <RoomieConnections key={connectionTab} initialTab={connectionTab === "received" || connectionTab === "given" ? connectionTab : "matches"} />
          </div>
        )}

        {view === "discover" && (
          <div key="discover" className="animate-page-in">
            <HousingStatusCard />

            {profileError ? (
              <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-border bg-bg-primary shadow-card">
                <EmptyState
                  icon={AlertTriangle}
                  title="No pudimos cargar tu perfil"
                  description="Comprueba la conexión para recuperar tus preferencias y compañeros."
                  action={{ onClick: () => setRetryProfile((n) => n + 1), label: "Reintentar" }}
                />
              </div>
            ) : !searchReady ? (
              /* Bloqueo: sin perfil de búsqueda completo no se puede deslizar */
              <div className="mx-auto max-w-lg rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8">
                <HeartHandshake className="h-8 w-8 text-violet" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="mt-4 font-heading text-2xl font-bold tracking-tight text-text-primary">
                  Completa tu perfil para empezar a hacer match
                </h3>
                <p className="mt-2 text-sm text-text-muted">
                  Para dar like o pasar y aparecer ante otros estudiantes necesitas tener
                  tu perfil de búsqueda al día:
                </p>
                <ul className="mt-6 divide-y divide-border-light border-y border-border-light text-sm">
                  {([
                    { ok: reqs.search, label: "Activar tu búsqueda de compañero de piso" },
                    { ok: reqs.budget, label: "Indicar tu presupuesto" },
                    { ok: reqs.city, label: "Indicar la ciudad donde buscas" },
                    { ok: reqs.photo, label: "Tener una foto de perfil" },
                    { ok: reqs.bio, label: "Escribir una bio (mín. 10 caracteres)" },
                  ] as { ok: boolean; label: string }[]).map((r, i) => (
                    <li
                      key={i}
                      className="animate-list-in flex items-center gap-3 py-2.5"
                      style={{ "--i": i } as CSSProperties}
                    >
                      {r.ok ? (
                        <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.25} aria-hidden="true" />
                      ) : (
                        <X className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
                      )}
                      <span className={r.ok ? "text-text-muted line-through" : "font-medium text-text-primary"}>{r.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                  <Button variant="dark" className="flex-1" onClick={() => setFormOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    Búsqueda y preferencias
                  </Button>
                  <Button asChild variant="outline" className="flex-1">
                    <Link href="/perfil">Foto y bio</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Barra de control: modo de exploración, ciudad y cuántas personas quedan */}
                <div className="mb-6 rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
                  <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-end">
                    <div>
                      <p className="mb-1.5 block text-xs font-semibold text-text-secondary">Cómo explorar</p>
                      <div className="flex gap-1 rounded-xl bg-bg-secondary p-1" role="group" aria-label="Modo de exploración">
                        <button type="button" aria-pressed={browseMode === "swipe"} onClick={() => setBrowseMode("swipe")} className={segmentClass(browseMode === "swipe")}>
                          Uno a uno
                        </button>
                        <button type="button" aria-pressed={browseMode === "list"} onClick={() => setBrowseMode("list")} className={segmentClass(browseMode === "list")}>
                          Comparar perfiles
                        </button>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="roomie-city" className="mb-1.5 block text-xs font-semibold text-text-secondary">
                        Ciudad destino
                      </label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" strokeWidth={1.75} aria-hidden="true" />
                        <Input
                          id="roomie-city"
                          aria-label="Ciudad donde quieres vivir"
                          value={swipeCity}
                          onChange={(e) => setSwipeCity(e.target.value)}
                          placeholder="¿En qué ciudad buscas piso?"
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-text-muted lg:pb-3">
                      <span className="font-heading text-lg font-bold text-text-primary tabular">{swipeProfiles.length}</span>{" "}
                      roomie{swipeProfiles.length !== 1 ? "s" : ""}
                      {swipeCity ? ` en ${swipeCity}` : " disponibles"}
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-text-muted">Solo verás personas que quieren vivir en la ciudad que escribas.</p>
                </div>

                {deckLoading ? (
                  /* Cargando el mazo (también al recuperar descartados) */
                  <div className="mx-auto max-w-md" role="status" aria-busy="true">
                    <span className="sr-only">Buscando roomies</span>
                    <div className="rounded-3xl border border-border bg-bg-primary p-3 shadow-card">
                      <Skeleton className="h-72 rounded-3xl sm:h-80" />
                      <div className="space-y-3 p-2 pt-5">
                        <Skeleton className="h-6 w-1/2 rounded-md" />
                        <Skeleton className="h-3 w-3/4 rounded-md" />
                        <Skeleton className="h-3 w-2/3 rounded-md" />
                      </div>
                    </div>
                  </div>
                ) : deckError ? (
                  /* El servidor no ha devuelto el mazo: se dice y se puede reintentar */
                  <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-border bg-bg-primary shadow-card">
                    <EmptyState
                      icon={AlertTriangle}
                      title="No se pudo cargar el mazo"
                      description="Revisa tu conexión e inténtalo de nuevo."
                      action={{ onClick: () => void loadDeck(searchReady), label: "Reintentar" }}
                    />
                  </div>
                ) : current && browseMode === "list" ? (
                  <div className="space-y-6">
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {swipeProfiles.map((person, i) => (
                        <article
                          key={person.id}
                          className="hover-lift animate-list-in group flex flex-col overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
                          style={{ "--i": i } as CSSProperties}
                        >
                          <div className="img-zoom relative aspect-[4/3] bg-bg-secondary">
                            {person.avatar_url || person.photos?.[0] ? (
                              <Image src={person.photos?.[0] || person.avatar_url!} alt={person.full_name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Users className="h-10 w-10 text-text-muted/40" strokeWidth={1.5} aria-hidden="true" />
                              </div>
                            )}
                            {person.compatibility != null && (
                              <span className="absolute right-3 top-3 rounded-full bg-bg-primary/95 px-3 py-1.5 text-xs font-bold text-text-primary shadow-card backdrop-blur tabular">
                                {Math.round(person.compatibility)}% de afinidad
                              </span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-4 p-5">
                            <div>
                              <h3 className="font-heading text-2xl font-bold tracking-tight text-text-primary">{person.full_name}</h3>
                              <p className="mt-1 text-sm text-text-muted">{person.career || "Estudiante"}{person.university_name ? ` · ${person.university_name}` : ""}</p>
                            </div>
                            <dl className="grid grid-cols-2 gap-3 border-y border-border-light py-3 text-sm">
                              <div>
                                <dt className="text-xs text-text-muted">Quiere vivir en</dt>
                                <dd className="font-semibold text-text-primary">{person.city || "Por concretar"}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-text-muted">Presupuesto al mes</dt>
                                <dd className="font-semibold text-text-primary tabular">de {person.budget_min || 0} a {person.budget_max || "…"} €</dd>
                              </div>
                            </dl>
                            <p className="line-clamp-3 text-sm text-text-secondary">{person.bio || "Abre una conversación cuando hagáis match y descubrid qué buscáis para vuestra próxima casa."}</p>
                            {!!person.hobbies?.length && (
                              <div className="flex flex-wrap gap-1.5">
                                {person.hobbies.slice(0, 4).map((h) => (
                                  <span key={h} className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary">{h}</span>
                                ))}
                              </div>
                            )}
                            {person.compatibility == null && <p className="text-xs text-text-muted">Faltan respuestas para calcular vuestra afinidad.</p>}
                            <details className="text-sm">
                              <summary className="cursor-pointer font-semibold text-text-primary">Hábitos de convivencia</summary>
                              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                {[["Tabaco", person.smoking], ["Horario de sueño", person.sleep_schedule], ["Estudio", person.study_habits], ["Visitas", person.friends_at_home]].map(([label, value]) => (
                                  <div key={String(label)}>
                                    <dt className="text-text-muted">{label}</dt>
                                    <dd className="text-text-primary">{({ nunca: "No fuma", no: "No", si: "Sí", ocasional: "A veces", temprano: "Madruga", tarde: "Trasnocha", flexible: "Flexible", casa: "En casa", biblioteca: "En biblioteca", mixto: "Combina ambos", pocas: "Pocas", muchas: "Frecuentes" } as Record<string, string>)[String(value)] || String(value || "Sin indicar")}</dd>
                                  </div>
                                ))}
                              </dl>
                            </details>
                            <div className="mt-auto flex gap-2 pt-1">
                              <Button disabled={swiping || operation.current} className="flex-1" onClick={() => void swipe("like", person)}>
                                <Heart className="h-4 w-4" aria-hidden="true" />
                                Me encaja
                              </Button>
                              <Button disabled={swiping || operation.current} variant="outline" onClick={() => void swipe("pass", person)}>
                                Pasar
                              </Button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    {canUndo && !undoUnavailable && (
                      <Button variant="outline" disabled={actionsBusy} onClick={() => void handleUndo()}>
                        <Undo2 className="h-4 w-4" aria-hidden="true" />
                        Deshacer mi última decisión
                      </Button>
                    )}
                  </div>
                ) : current ? (
                  <div className="mx-auto max-w-md">
                    <p className="mb-3 text-center text-xs text-text-muted tabular">
                      {likedCount} {likedCount === 1 ? "like" : "likes"} · {swipeProfiles.length} por ver
                    </p>
                    <div className="relative min-h-[600px]">
                      <div key={current.id} className="animate-scale-in">
                        <SwipeCard profile={current} onLike={handleLike} onPass={handlePass} />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col items-center gap-3">
                      <p className="text-center text-xs text-text-muted">
                        Desliza ← para pasar · Desliza → para like
                      </p>
                      {canUndo && !undoUnavailable && (
                        <Button size="sm" variant="outline" disabled={actionsBusy} onClick={() => void handleUndo()}>
                          <Undo2 className="h-4 w-4" aria-hidden="true" />
                          Deshacer el último
                        </Button>
                      )}
                    </div>
                  </div>
                ) : hiddenByCity ? (
                  /* Hay mazo, pero nadie en la ciudad escrita */
                  <div className="mx-auto max-w-lg rounded-2xl border border-border bg-bg-primary shadow-card">
                    <EmptyState
                      icon={MapPin}
                      title={`No hay roomies en ${swipeCity || "esta ciudad"}`}
                      description="Prueba con otra ciudad o borra el filtro."
                      action={{ onClick: () => setSwipeCity(""), label: "Ver todas las ciudades" }}
                    />
                  </div>
                ) : (
                  /* Mazo agotado: deshacer el último, recuperar descartados o ir a los matches */
                  <div className="mx-auto max-w-lg rounded-2xl border border-border bg-bg-primary shadow-card">
                    <EmptyState
                      icon={HeartHandshake}
                      title={deck.length === 0 ? "Nadie nuevo por ahora" : "¡Has visto todos los roomies!"}
                      description={
                        deck.length === 0
                          ? "Cuando alguien más busque piso te aparecerá aquí. Si quieres, recupera a quien descartaste."
                          : `Has dado like a ${likedCount} persona${likedCount !== 1 ? "s" : ""} en esta tanda.`
                      }
                    >
                      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                        {canUndo && !undoUnavailable && (
                          <Button variant="outline" disabled={actionsBusy} onClick={() => void handleUndo()}>
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                            Deshacer el último
                          </Button>
                        )}
                        {!undoUnavailable && (
                          <Button variant="outline" disabled={actionsBusy} onClick={() => void handleResetPassed()}>
                            <RefreshCw className={cn("h-4 w-4", resetting && "animate-spin")} aria-hidden="true" />
                            Volver a ver descartados
                          </Button>
                        )}
                        <Button asChild variant="dark">
                          <Link href="/roomie-match?tab=connections" onClick={goConnections}>Ver mis matches</Link>
                        </Button>
                      </div>
                    </EmptyState>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Cuestionario de preferencias (paso a paso) */}
      <LifestyleFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSaveLifestyle}
        saving={formSaving}
        initialLifestyle={myLifestyle}
        initialCity={myCity}
        initialBudgetMin={myBudgetMin}
        initialBudgetMax={myBudgetMax}
      />
    </div>
  );
}

// ── Cuestionario de preferencias, paso a paso ────────────────────────────────
// Paso 0: ciudad y presupuesto. Pasos 1 a 8: una pregunta de convivencia por
// pantalla, con barra de progreso fina y un solo botón al final. El payload
// que se guarda es exactamente el mismo que antes (misma forma, mismas claves).
function LifestyleFormModal({
  open,
  onClose,
  onSave,
  saving,
  initialLifestyle,
  initialCity,
  initialBudgetMin,
  initialBudgetMax,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    lifestyle: Record<string, string>;
    city: string;
    budget_min: number;
    budget_max: number;
  }) => void;
  saving: boolean;
  initialLifestyle: Record<string, string>;
  initialCity: string;
  initialBudgetMin: number;
  initialBudgetMax: number;
}) {
  const [lifestyle, setLifestyle] = useState<Record<string, string>>(initialLifestyle);
  const [city, setCity] = useState(initialCity);
  const [budgetMin, setBudgetMin] = useState(initialBudgetMin);
  const [budgetMax, setBudgetMax] = useState(initialBudgetMax);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setLifestyle(initialLifestyle);
      setCity(initialCity);
      setBudgetMin(initialBudgetMin);
      setBudgetMax(initialBudgetMax);
      setStep(0);
      setTouched(false);
    }
  }, [open, initialLifestyle, initialCity, initialBudgetMin, initialBudgetMax]);

  // Bloquea el scroll del fondo mientras está abierto y cierra con Escape
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalSteps = LIFESTYLE_QUESTIONS.length + 1;
  const isLast = step === totalSteps - 1;
  const question = step > 0 ? LIFESTYLE_QUESTIONS[step - 1] : null;
  const QuestionIcon = question?.icon;

  const cityError = touched && !city.trim() ? "Escribe la ciudad donde buscas piso." : null;
  const budgetError =
    touched && !(budgetMin > 0 && budgetMax >= budgetMin)
      ? "El máximo tiene que ser mayor o igual que el mínimo."
      : null;
  const baseValid = !!city.trim() && budgetMin > 0 && budgetMax >= budgetMin;
  const allAnswered = LIFESTYLE_QUESTIONS.every((q) => lifestyle[q.id]);
  const canSave = allAnswered && baseValid;
  const stepValid = step === 0 ? baseValid : !!lifestyle[question!.id];
  const missing = LIFESTYLE_QUESTIONS.filter((q) => !lifestyle[q.id]).length;

  const next = () => {
    if (step === 0 && !baseValid) {
      setTouched(true);
      return;
    }
    if (!stepValid) return;
    if (isLast) {
      onSave({ lifestyle, city: city.trim(), budget_min: budgetMin, budget_max: budgetMax });
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      {/* Fondo */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-bg-dark/50 animate-fade-in"
      />
      {/* Panel */}
      <div
        className="animate-sheet-in relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-bg-primary shadow-float md:max-h-[90vh] md:max-w-xl md:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-label="Preferencias de roomie"
      >
        {/* Cabecera */}
        <div className="shrink-0 border-b border-border-light p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Paso {step + 1} de {totalSteps}</p>
              <h2 className="mt-1 font-heading text-xl font-extrabold tracking-tight text-text-primary sm:text-2xl">
                Tus preferencias de roomie
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">Se usan para calcular tu % de compatibilidad.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-m-2 rounded-lg p-2 text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/30"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
          {/* Barra de progreso fina */}
          <div
            className="mt-4 h-1 w-full overflow-hidden rounded-full bg-bg-secondary"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={step + 1}
            aria-label="Progreso del cuestionario"
          >
            <div
              className="h-full rounded-full bg-violet transition-[width] duration-300 ease-[var(--ease-out-quart)]"
              style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* Cuerpo: un paso por pantalla, con entrada animada al cambiar */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 ? (
            <div key="step-base" className="animate-step-in space-y-5">
              <div>
                <p className="eyebrow">Dónde y cuánto</p>
                <h3 className="mt-2 font-heading text-2xl font-bold tracking-tight text-text-primary">
                  ¿Dónde buscas piso y con qué presupuesto?
                </h3>
              </div>
              <Field id="roomie-pref-city" label="Ciudad donde buscas piso" error={cityError} required>
                <Input
                  id="roomie-pref-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ej. Madrid, Valencia..."
                  autoComplete="address-level2"
                />
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-text-primary">
                  Presupuesto: <span className="tabular">{budgetMin}€ a {budgetMax}€/mes</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="roomie-pref-min" label={<span className="text-xs font-semibold text-text-secondary">Mínimo</span>}>
                    <Input
                      id="roomie-pref-min"
                      type="number" min={100} max={budgetMax} step={25}
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(Math.max(100, Number(e.target.value) || 0))}
                      className="tabular"
                    />
                  </Field>
                  <Field
                    id="roomie-pref-max"
                    label={<span className="text-xs font-semibold text-text-secondary">Máximo</span>}
                    error={budgetError}
                  >
                    <Input
                      id="roomie-pref-max"
                      type="number" min={budgetMin} max={2000} step={25}
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(Math.max(budgetMin, Number(e.target.value) || 0))}
                      className="tabular"
                    />
                  </Field>
                </div>
              </div>
            </div>
          ) : question ? (
            <div key={question.id} className="animate-step-in space-y-5">
              <div>
                <p className="eyebrow">Pregunta {step} de {LIFESTYLE_QUESTIONS.length}</p>
                <h3 className="mt-2 flex items-center gap-2.5 font-heading text-2xl font-bold tracking-tight text-text-primary">
                  {QuestionIcon && <QuestionIcon className="h-6 w-6 shrink-0 text-violet" strokeWidth={1.75} aria-hidden="true" />}
                  {question.label}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label={question.label}>
                {question.options.map((opt, i) => (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={lifestyle[question.id] === opt}
                    onClick={() => setLifestyle((prev) => ({ ...prev, [question.id]: opt }))}
                    className={chipClass(lifestyle[question.id] === opt)}
                  >
                    {question.labels[i]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Pie: atrás a la izquierda, un solo CTA a la derecha */}
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t border-border-light bg-bg-primary p-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}
              disabled={saving}
            >
              {step === 0 ? (
                "Cancelar"
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Atrás
                </>
              )}
            </Button>
            <p className="hidden text-xs text-text-muted sm:block tabular">
              {allAnswered ? "¡Todo listo!" : `Faltan ${missing} preguntas`}
            </p>
          </div>
          <Button
            variant={isLast ? "default" : "dark"}
            disabled={isLast ? !canSave || saving : step > 0 && !stepValid}
            loading={saving}
            onClick={next}
          >
            {isLast ? (saving ? "Guardando…" : "Guardar preferencias") : (
              <>
                Siguiente
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// reducedMotion vivía en el MotionConfig global de AppProviders; al sacar
// framer-motion del árbol raíz, cada pantalla que lo usa lo declara en local.
export default function RoomieMatchClient() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16" role="status" aria-busy="true">
        <span className="sr-only">Cargando Roomie</span>
        <Skeleton className="h-3 w-40 rounded-md" />
        <Skeleton className="mt-4 h-12 w-72 max-w-full" />
        <Skeleton className="mt-3 h-5 w-96 max-w-full rounded-lg" />
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <RoomieMatchClientInner key={user?.id ?? "anonymous"} />
    </MotionConfig>
  );
}
