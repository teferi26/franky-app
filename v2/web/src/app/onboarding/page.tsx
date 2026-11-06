"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { sanitizeNext } from "@/lib/safe-next";
import { isNonStudentRole, homeForRole } from "@/lib/roles";
import { prepareImageForUpload, isImageFile, detectMime } from "@/lib/image-upload";
import {
  User, GraduationCap, Compass, Home,
  ChevronRight, ChevronLeft, Check, AlertCircle, Loader2, Camera,
  Sparkles, Heart,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { birthDateInputBounds, birthDateMessage, checkBirthDate } from "@/lib/legal-age";
import { onboardingEssentialsDone, onboardingDestination, friendlyProfileError } from "./essentials";

const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 3 * 1024 * 1024; // 3MB (bucket limit)

/**
 * Prepara la foto de perfil para el bucket de avatares: convierte a JPEG (las
 * fotos del iPhone llegan en HEIC y el Storage las rechaza con un 415, ver
 * src/lib/image-upload.ts) y tampoco deja pasar el GIF tal cual, porque este
 * bucket no lo acepta: se le declara como JPEG para forzar la reconversión y
 * queda el primer fotograma, que es lo que interesa en un avatar.
 */
async function prepareProfileImage(file: File) {
  const source =
    detectMime(file) === "image/gif"
      ? new File([file], file.name.replace(/\.gif$/i, ".jpg"), { type: "image/jpeg" })
      : file;
  return prepareImageForUpload(source);
}

export const dynamic = 'force-dynamic'

// ── Types ──────────────────────────────────────────────────────────────────────

interface OnboardingData {
  full_name: string;
  birth_date: string;
  gender: string;
  comunidad_autonoma: string;
  city: string;
  is_student: boolean;
  student_type: string;
  bachillerato_course: number | null;
  bachillerato_modality: string;
  fp_study: string;
  university_id: string;
  career: string;
  university_course: number | null;
  master_study: string;
  knows_desired_career: boolean;
  desired_career_id: string;
  desired_city: string;
  study_anywhere: boolean;
  looking_for_housing: boolean;
  looking_for_roommate: boolean;
  smoking: string;
  partying: string;
  sleep_schedule: string;
  study_habits: string;
  cleanliness: number;
  disorder_tolerance: number;
  noise_tolerance: string;
  home_gatherings: string;
  is_homebody: boolean;
  is_early_riser: boolean;
  pet_friendly: boolean;
  accepts_different_gender_roommate: boolean;
  diet: string;
  hobbies: string[];
  budget_min: number;
  budget_max: number;
  bio: string;
  friends_at_home: string;
}

const CCAA = [
  "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias", "Cantabria",
  "Castilla-La Mancha", "Castilla y León", "Cataluña", "Ceuta",
  "Comunidad Valenciana", "Extremadura", "Galicia", "La Rioja",
  "Madrid", "Melilla", "Murcia", "Navarra", "País Vasco",
];

const HOBBIES_OPTIONS = [
  "Deporte", "Música", "Lectura", "Cine/Series", "Videojuegos", "Cocina",
  "Fotografía", "Viajes", "Arte", "Tecnología", "Naturaleza", "Yoga/Meditación",
  "Idiomas", "Voluntariado", "Fiestas", "Moda",
];

const initialData: OnboardingData = {
  full_name: "",
  birth_date: "",
  gender: "",
  comunidad_autonoma: "",
  city: "",
  is_student: false,
  student_type: "",
  bachillerato_course: null,
  bachillerato_modality: "",
  fp_study: "",
  university_id: "",
  career: "",
  university_course: null,
  master_study: "",
  knows_desired_career: false,
  desired_career_id: "",
  desired_city: "",
  study_anywhere: false,
  looking_for_housing: false,
  looking_for_roommate: false,
  smoking: "no",
  partying: "ocasional",
  sleep_schedule: "flexible",
  // Vacío a propósito, NO un valor por defecto: esta pregunta no existía y la
  // migración 157 cuenta como "cuestionario respondido" solo lo que tiene los
  // 8 valores del vocabulario bueno. Un default aquí fabricaría respuestas.
  study_habits: "",
  cleanliness: 3,
  disorder_tolerance: 3,
  noise_tolerance: "moderado",
  home_gatherings: "a_veces",
  is_homebody: false,
  is_early_riser: false,
  pet_friendly: false,
  accepts_different_gender_roommate: true,
  diet: "sin_preferencia",
  hobbies: [],
  budget_min: 200,
  budget_max: 500,
  bio: "",
  friends_at_home: "a_veces",
};

// ── Flujo de micro-páginas (estilo Typeform) ───────────────────────────────────
// Petición directa de usuarios: nada de formularios con 8-10 preguntas por
// pantalla. Cada página hace COMO MUCHO 3 preguntas y avanza SOLA cuando están
// respondidas (con una pausa breve para ver la selección). Siempre se puede
// volver atrás. Los campos de texto libre avanzan con Enter o el botón OK:
// auto-avanzar mientras se teclea cortaría a mitad de palabra.

const PHASES = {
  1: { label: "Sobre ti", icon: User },
  2: { label: "Etapa académica", icon: GraduationCap },
  3: { label: "Tus planes", icon: Compass },
  4: { label: "Tu match ideal", icon: Home },
} as const;

// Preguntas booleanas/choice que se muestran SIN respuesta preseleccionada:
// el valor por defecto existe en data, pero hasta que el usuario no pulsa, la
// pregunta se pinta vacía y no se considera respondida (set `answered`).
const ROOMMATE_KEYS = new Set([
  "smoking", "partying", "sleep_schedule", "study_habits", "cleanliness", "disorder_tolerance",
  "noise_tolerance", "home_gatherings", "is_homebody", "is_early_riser",
  "pet_friendly", "accepts_different_gender_roommate", "diet", "hobbies",
]);

const ALL_QUESTION_KEYS = [
  "is_student", "knows_desired_career", "study_anywhere",
  "looking_for_housing", "looking_for_roommate",
  "smoking", "partying", "sleep_schedule", "study_habits", "cleanliness", "disorder_tolerance",
  "noise_tolerance", "home_gatherings", "is_homebody", "is_early_riser",
  "pet_friendly", "accepts_different_gender_roommate", "diet",
];

interface PageCtx {
  data: OnboardingData;
  answered: Set<string>;
  universityCareers: { id: string; name: string }[];
  universityCareersLoading: boolean;
}

interface PageDef {
  id: string;
  phase: 1 | 2 | 3 | 4;
  /** ¿Esta página aplica con las respuestas actuales? (ramas del flujo) */
  when?: (d: OnboardingData) => boolean;
  /** ¿Están respondidas sus preguntas? (habilita avanzar / dispara el auto-avance) */
  complete: (c: PageCtx) => boolean;
  /** true → no auto-avanza (texto libre, multi-select, páginas finales) */
  manual?: boolean | ((c: PageCtx) => boolean);
  /** Página final: el botón envía en vez de avanzar */
  isFinal?: boolean;
}

const alreadyStudying = (d: OnboardingData) =>
  d.is_student && (d.student_type === "universidad" || d.student_type === "master");

const PAGES: PageDef[] = [
  { id: "nombre", phase: 1, manual: true, complete: (c) => c.data.full_name.trim().length >= 2 },
  // Menores de 14 no pueden continuar (art. 7 LOPDGDD): la página no se da
  // por completa y el mensaje explica por qué.
  { id: "nacimiento", phase: 1, complete: (c) => checkBirthDate(c.data.birth_date).ok && !!c.data.gender },
  { id: "estudiante", phase: 2, complete: (c) => c.answered.has("is_student") },
  { id: "tipo-estudios", phase: 2, when: (d) => d.is_student, complete: (c) => !!c.data.student_type },
  {
    id: "bachillerato", phase: 2, when: (d) => d.student_type === "bachillerato",
    complete: (c) => c.data.bachillerato_course != null && !!c.data.bachillerato_modality,
  },
  { id: "fp", phase: 2, when: (d) => d.student_type === "fp", manual: true, complete: (c) => !!c.data.fp_study.trim() },
  { id: "universidad", phase: 2, when: (d) => d.student_type === "universidad", complete: (c) => !!c.data.university_id },
  {
    id: "uni-carrera", phase: 2, when: (d) => d.student_type === "universidad",
    // Si la uni no tiene carreras en BD, el campo es texto libre → manual.
    manual: (c) => !c.universityCareersLoading && c.universityCareers.length === 0,
    complete: (c) => !!c.data.career.trim(),
  },
  { id: "uni-curso", phase: 2, when: (d) => d.student_type === "universidad", complete: (c) => c.data.university_course != null },
  { id: "master", phase: 2, when: (d) => d.student_type === "master", manual: true, complete: (c) => !!c.data.master_study.trim() },
  // "Dónde vives" va DESPUÉS de lo académico: el camino mínimo (edad +
  // universidad y curso) queda lo más corto posible y lo demás se puede
  // dejar con "Completar después".
  { id: "vives", phase: 1, manual: true, complete: (c) => !!c.data.comunidad_autonoma && !!c.data.city.trim() },
  { id: "futuro", phase: 3, when: (d) => !alreadyStudying(d), complete: (c) => c.answered.has("knows_desired_career") },
  {
    id: "carrera-deseada", phase: 3,
    when: (d) => !alreadyStudying(d) && d.knows_desired_career,
    complete: (c) => !!c.data.desired_career_id,
  },
  {
    id: "ciudad-deseada", phase: 3,
    when: (d) => !alreadyStudying(d) && d.knows_desired_career,
    manual: (c) => !c.data.study_anywhere,
    complete: (c) => c.data.study_anywhere || !!c.data.desired_city.trim(),
  },
  {
    id: "busquedas", phase: 3,
    complete: (c) => c.answered.has("looking_for_housing") && c.answered.has("looking_for_roommate"),
  },
  { id: "r-fuma-fiesta", phase: 4, when: (d) => d.looking_for_roommate, complete: (c) => c.answered.has("smoking") && c.answered.has("partying") },
  // study_habits entra en el gate: es una de las 8 preguntas que la migración
  // 157 exige para dar el cuestionario por respondido. Sin preguntarla aquí,
  // todo el que completaba el onboarding quedaba marcado como "cuestionario a
  // medias" y la app se lo volvía a pedir para siempre.
  { id: "r-sueno", phase: 4, when: (d) => d.looking_for_roommate, complete: (c) => c.answered.has("sleep_schedule") && c.answered.has("home_gatherings") && c.answered.has("study_habits") },
  { id: "r-limpieza", phase: 4, when: (d) => d.looking_for_roommate, complete: (c) => c.answered.has("noise_tolerance") },
  { id: "r-estilo", phase: 4, when: (d) => d.looking_for_roommate, complete: (c) => c.answered.has("is_homebody") && c.answered.has("is_early_riser") },
  { id: "r-extra", phase: 4, when: (d) => d.looking_for_roommate, complete: (c) => c.answered.has("pet_friendly") && c.answered.has("accepts_different_gender_roommate") },
  { id: "r-dieta", phase: 4, when: (d) => d.looking_for_roommate, complete: (c) => c.answered.has("diet") },
  { id: "r-hobbies", phase: 4, when: (d) => d.looking_for_roommate, manual: true, complete: (c) => c.data.hobbies.length > 0 },
  { id: "final-roomie", phase: 4, when: (d) => d.looking_for_roommate, manual: true, isFinal: true, complete: () => true },
  { id: "final-basic", phase: 3, when: (d) => !d.looking_for_roommate, manual: true, isFinal: true, complete: () => true },
];

const isManual = (p: PageDef, c: PageCtx) =>
  typeof p.manual === "function" ? p.manual(c) : !!p.manual;


// ── Sub-components ──────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">{children}</label>;
}

function RadioGroup({
  value,
  onChange,
  options,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  big?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`${big ? "px-5 py-3" : "px-4 py-2"} rounded-xl border text-sm font-medium transition-[border-color,background-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-quart)] active:scale-[0.97] ${
            value === opt.value
              ? "border-violet bg-violet-50 text-violet-deep ring-1 ring-violet"
              : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:bg-bg-secondary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Pregunta Sí/No sin respuesta preseleccionada (answered controla el pintado). */
function YesNo({
  label,
  value,
  show,
  onPick,
}: {
  label: string;
  value: boolean;
  show: boolean;
  onPick: (v: boolean) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid grid-cols-2 gap-2">
        {[{ v: true, l: "Sí" }, { v: false, l: "No" }].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onPick(o.v)}
            className={`py-3 rounded-xl border text-sm font-semibold transition-[border-color,background-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-quart)] active:scale-[0.97] ${
              show && value === o.v
                ? "border-violet bg-violet-50 text-violet-deep ring-1 ring-violet"
                : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:bg-bg-secondary"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderField({
  value,
  onChange,
  min,
  max,
  labels,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  labels?: string[];
  label: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <FieldLabel>{label}</FieldLabel>
        <span className="text-sm font-bold text-violet tabular">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet"
      />
      {labels && (
        <div className="flex justify-between text-[10px] text-text-muted mt-1">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Mismo trazo que ui/input.tsx (aqui hay muchos inputs nativos con ref y
// autoFocus; se mantienen nativos y solo se unifica el estilo).
const inputCls =
  "flex h-11 w-full rounded-xl border border-border bg-bg-primary px-3.5 py-2 text-[15px] text-text-primary placeholder:text-text-muted/80 transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out-quart)] hover:border-text-primary/20 focus:outline-none focus:border-violet focus:ring-[3px] focus:ring-violet/15";

// ── Main Component ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [pageId, setPageId] = useState("nombre");
  const [history, setHistory] = useState<string[]>([]);
  const [data, setData] = useState<OnboardingData>(initialData);
  // Preguntas respondidas EXPLÍCITAMENTE (las choice no vienen preseleccionadas).
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [existingAvatarUrl, setExistingAvatarUrl] = useState("");
  const [universities, setUniversities] = useState<{ id: string; name: string; short_name?: string | null; slug?: string | null }[]>([]);
  const [careers, setCareers] = useState<{ id: string; name: string; university_name: string }[]>([]);
  const [universityCareers, setUniversityCareers] = useState<{ id: string; name: string }[]>([]);
  const [universityCareersLoading, setUniversityCareersLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  // Cuenta que no es de estudiante (propietario, gestor de universidad) que ha
  // acabado aquí de alguna forma. Se guarda su destino para ofrecerle la salida
  // en vez de preguntarle por universidad, carrera o compañero de piso.
  const [nonStudentExit, setNonStudentExit] = useState<string | null>(null);
  // La foto ya convertida y lista para el Storage (se prepara al elegirla, no
  // al guardar, para poder avisar del problema en el momento).
  const [avatarUpload, setAvatarUpload] = useState<
    { blob: Blob; contentType: string; ext: string } | null
  >(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  // Búsquedas locales de las páginas de universidad/carrera.
  const [uniSearch, setUniSearch] = useState("");
  const [careerQuery, setCareerQuery] = useState("");
  const [desiredCareerSearch, setDesiredCareerSearch] = useState("");
  // Pantalla final "Analizando tu compatibilidad…": el guardado real ocurre
  // debajo mientras se muestra, con duración mínima y cierre de éxito.
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [analysisMsgIdx, setAnalysisMsgIdx] = useState(0);
  const [analysisPct, setAnalysisPct] = useState(0);
  // La barra de progreso nunca retrocede aunque el total de páginas cambie de
  // rama o el usuario vuelva atrás.
  const maxProgressRef = useRef(3);
  // Auto-avance: solo dispara si la página se completó ESTANDO en ella (al
  // volver atrás a una página ya completa no debe saltar sola)…
  const wasIncompleteRef = useRef(true);
  // …salvo que el usuario CAMBIE una respuesta en esa visita: entonces sí
  // vuelve a avanzar solo, como la primera vez.
  const interactedRef = useRef(false);
  const goNextRef = useRef<() => void>(() => {});

  const supabase = createClient();

  const onPickAvatar = useCallback(async (file: File | null) => {
    setError("");
    if (!file) return;
    if (!isImageFile(file)) {
      setError("Formato de imagen no admitido (usa JPG, PNG, WEBP o GIF).");
      return;
    }
    const prep = await prepareProfileImage(file);
    if (!prep.ok) {
      setError(prep.message);
      return;
    }
    // El peso se mide tras convertir: una foto recién hecha con el móvil pesa
    // varios MB en origen y se queda muy por debajo del tope al pasar a JPEG.
    if (prep.blob.size > AVATAR_MAX_BYTES) {
      setError("La foto supera 3MB. Elige una más ligera.");
      return;
    }
    setAvatarUpload({ blob: prep.blob, contentType: prep.contentType, ext: prep.ext });
    // La vista previa usa ya la versión convertida: así se ve también cuando
    // el navegador no sabe pintar el original (el HEIC del iPhone).
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(prep.blob);
    });
  }, []);

  // Check auth & load ref data
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const isEdit =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("edit") === "1";
      setEditMode(isEdit);

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      // Cuentas que no son de estudiante: este cuestionario no va con ellas.
      // Un propietario se da de alta en /negocio/alta ya con el onboarding
      // marcado, pero podía volver a caer aquí por el enlace "editar perfil
      // académico" del perfil o por el gate del middleware si su fila quedó a
      // medias. En ningún caso se le pregunta por universidad, carrera, curso
      // ni preferencias de roomie.
      if (isNonStudentRole(profile?.role)) {
        const destino = homeForRole(profile?.role);
        if (!profile?.onboarding_completed) {
          // Si no se marca, el middleware vuelve a mandarle aquí en la
          // siguiente navegación. Si el UPDATE falla, NO redirigimos (sería un
          // bucle): se le enseña la pantalla de salida de más abajo.
          const { error: fixErr } = await supabase
            .from("profiles")
            .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
            .eq("id", user.id);
          if (fixErr) {
            setNonStudentExit(destino);
            setCheckingAuth(false);
            return;
          }
        }
        window.location.assign(destino);
        return;
      }

      if (profile?.onboarding_completed && !isEdit) {
        if (profile.role === "propietario") {
          router.replace("/propietario/dashboard");
        } else {
          router.replace(
            sanitizeNext(new URLSearchParams(window.location.search).get("next"))
          );
        }
        return;
      }

      // Pre-fill name from profile or OAuth metadata (Google, Apple…)
      const metaName =
        (user.user_metadata as { full_name?: string; name?: string } | null)?.full_name ||
        (user.user_metadata as { name?: string } | null)?.name ||
        "";
      const existing = profile?.full_name ?? "";
      const prefillName = existing || metaName;
      if (prefillName) {
        setData((prev) => ({ ...prev, full_name: prefillName }));
      }
      // El nombre ya viene del registro (formulario o Google/Apple): no se
      // vuelve a preguntar. Se empieza por la fecha de nacimiento y "Atrás"
      // sigue llevando a la página del nombre (y la foto) por si quiere
      // cambiarlo.
      if (!isEdit && prefillName.trim().length >= 2) {
        setPageId("nacimiento");
        setHistory(["nombre"]);
      }

      // En modo edición precargamos TODO el perfil y marcamos todas las
      // preguntas como respondidas (aquí se revisa, no se responde de cero).
      if (isEdit && profile) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fila de profiles con columnas opcionales según migración
        const p = profile as Record<string, any>;
        if (p.avatar_url) {
          setExistingAvatarUrl(p.avatar_url);
          setAvatarPreview(p.avatar_url);
        }
        setData((prev) => ({
          ...prev,
          full_name: p.full_name ?? prev.full_name,
          birth_date: p.birth_date ?? "",
          gender: p.gender ?? "",
          comunidad_autonoma: p.comunidad_autonoma ?? "",
          city: p.city ?? "",
          is_student: p.is_student ?? false,
          student_type: p.student_type ?? "",
          bachillerato_course: p.bachillerato_course ?? null,
          bachillerato_modality: p.bachillerato_modality ?? "",
          fp_study: p.fp_study ?? "",
          university_id: p.university_id ?? "",
          career: p.career ?? "",
          university_course: p.university_course ?? null,
          master_study: p.master_study ?? "",
          knows_desired_career: p.knows_desired_career ?? false,
          desired_career_id: p.desired_career_id ?? "",
          desired_city: p.desired_city ?? "",
          study_anywhere: p.study_anywhere ?? false,
          looking_for_housing: p.looking_for_housing ?? false,
          looking_for_roommate: p.looking_for_roommate ?? false,
          smoking: p.smoking ?? prev.smoking,
          partying: p.partying ?? prev.partying,
          sleep_schedule: p.sleep_schedule ?? prev.sleep_schedule,
          // Solo se precarga si ya es un valor del cuestionario nuevo: el
          // 'moderado' heredado de la base de datos no fue nunca una respuesta.
          study_habits: ["en_casa", "biblioteca", "mixto"].includes(p.study_habits ?? "")
            ? (p.study_habits as string)
            : "",
          cleanliness: p.cleanliness ?? prev.cleanliness,
          disorder_tolerance: p.disorder_tolerance ?? prev.disorder_tolerance,
          noise_tolerance: p.noise_tolerance ?? prev.noise_tolerance,
          home_gatherings: p.home_gatherings ?? p.friends_at_home ?? prev.home_gatherings,
          is_homebody: p.is_homebody ?? false,
          is_early_riser: p.is_early_riser ?? false,
          pet_friendly: p.pet_friendly ?? false,
          accepts_different_gender_roommate: p.accepts_different_gender_roommate ?? true,
          diet: p.diet ?? prev.diet,
          hobbies: Array.isArray(p.hobbies) ? p.hobbies : prev.hobbies,
          budget_min: p.budget_min ?? prev.budget_min,
          budget_max: p.budget_max ?? prev.budget_max,
          bio: p.bio ?? "",
          friends_at_home: p.friends_at_home ?? prev.friends_at_home,
        }));
        // Todo se da por respondido para quien vuelve, MENOS "¿dónde
        // estudias?" si no hay una respuesta real: darla por contestada con
        // el valor vacío haría pasar el gate y guardar "" otra vez.
        const respondidas = new Set(ALL_QUESTION_KEYS);
        if (!["en_casa", "biblioteca", "mixto"].includes(p.study_habits ?? "")) {
          respondidas.delete("study_habits");
        }
        setAnswered(respondidas);
      }

      // Load universities (include short_name so users can search by acronym e.g. "UMH")
      const { data: unis } = await supabase
        .from("universities")
        .select("id, name, short_name, slug")
        .order("name")
        .limit(500);
      setUniversities(unis || []);

      // Load careers with university name (for search)
      const { data: careerData } = await supabase
        .from("careers")
        .select("id, name, universities(name)")
        .order("name")
        .limit(5000);
      setCareers(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- join de careers sin tipos generados
        (careerData || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          university_name: c.universities?.name || "",
        }))
      );

      setCheckingAuth(false);
    }
    init();
  }, []);

  const onChange = useCallback((partial: Partial<OnboardingData>) => {
    interactedRef.current = true;
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  /** Responde una pregunta choice: guarda el valor Y la marca como respondida. */
  const answer = useCallback((key: string, partial: Partial<OnboardingData>) => {
    interactedRef.current = true;
    setData((prev) => ({ ...prev, ...partial }));
    setAnswered((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // Carreras de la universidad elegida, a demanda.
  useEffect(() => {
    if (data.student_type !== "universidad" || !data.university_id) {
      setUniversityCareers([]);
      return;
    }
    let cancelled = false;
    setUniversityCareersLoading(true);
    supabase
      .from("careers")
      .select("id, name")
      .eq("university_id", data.university_id)
      .order("name")
      .then(({ data: rows }) => {
        if (cancelled) return;
        setUniversityCareers((rows as { id: string; name: string }[]) || []);
        setUniversityCareersLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.university_id, data.student_type]);

  // Rotación de mensajes + contador de la pantalla de análisis.
  useEffect(() => {
    if (!analyzing || analysisDone) return;
    const msgTimer = setInterval(() => setAnalysisMsgIdx((i) => i + 1), 800);
    const pctTimer = setInterval(() => {
      setAnalysisPct((p) => Math.min(97, p + Math.max(1, Math.ceil((97 - p) / 18))));
    }, 70);
    return () => {
      clearInterval(msgTimer);
      clearInterval(pctTimer);
    };
  }, [analyzing, analysisDone]);

  // ── Motor del flujo ────────────────────────────────────────────────────────
  const ctx: PageCtx = { data, answered, universityCareers, universityCareersLoading };
  const eligible = PAGES.filter((p) => !p.when || p.when(data));
  const eligibleIds = eligible.map((p) => p.id);
  const currentIdx = Math.max(0, eligibleIds.indexOf(pageId));
  const page = eligible[currentIdx] ?? eligible[0];
  const pageComplete = page.complete(ctx);
  const pageManual = isManual(page, ctx);

  const goNext = () => {
    const idx = eligibleIds.indexOf(page.id);
    const nextId = eligibleIds[idx + 1];
    if (!nextId) return;
    setHistory((h) => [...h, page.id]);
    setPageId(nextId);
  };
  goNextRef.current = goNext;

  const goBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setPageId(prev);
  };

  // Al entrar en una página, recordamos si estaba incompleta: solo entonces
  // podrá auto-avanzar (evita saltos al volver atrás a páginas ya respondidas).
  useEffect(() => {
    const p = PAGES.find((x) => x.id === pageId);
    wasIncompleteRef.current = p
      ? !p.complete({ data, answered, universityCareers, universityCareersLoading })
      : true;
    interactedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Auto-avance: cuando la página pasa a completa (y no es manual ni edición),
  // avanza tras una pausa breve para que la selección se vea.
  useEffect(() => {
    if (editMode || analyzing) return;
    if (!page || page.isFinal) return;
    if (isManual(page, ctx)) return;
    if (!page.complete(ctx)) {
      wasIncompleteRef.current = true;
      return;
    }
    if (!wasIncompleteRef.current && !interactedRef.current) return;
    const t = setTimeout(() => goNextRef.current(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, answered, pageId, editMode, analyzing, universityCareers, universityCareersLoading]);

  // ── Navegación final / guardado (idéntico al flujo anterior) ───────────────
  const navigateToDestination = () => {
    const next = sanitizeNext(
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next")
        : null
    );
    const uni = universities.find((u) => u.id === data.university_id);
    const dest = onboardingDestination({
      editMode,
      next,
      universitySlug: data.student_type === "universidad" ? uni?.slug : null,
    });
    if (typeof window !== "undefined") {
      window.location.assign(dest);
    } else {
      router.replace(dest);
    }
  };

  // "Completar después" (M-UX-013): solo aparece cuando ya está lo
  // imprescindible (edad y universidad/curso, ver essentials.ts). Guarda TODO
  // lo respondido hasta ahora (antes solo guardaba el nombre y se perdían la
  // universidad y el curso) y lleva al FOMO de su universidad.
  const handleSkip = async () => {
    if (!onboardingEssentialsDone(data, answered)) return;
    setLoading(true);
    setError("");
    const err = await persistProfile("partial");
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    navigateToDestination();
  };

  const persistProfile = async (mode: "full" | "partial" = "full"): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return "Sesión expirada. Por favor, vuelve a iniciar sesión.";
    }

    let avatarUrl: string | null = existingAvatarUrl || null;
    if (avatarUpload) {
      const path = `${user.id}/avatar_${Date.now()}.${avatarUpload.ext}`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, avatarUpload.blob, {
          contentType: avatarUpload.contentType,
          upsert: true,
        });
      if (upErr) {
        return "No se pudo subir la foto. Inténtalo de nuevo o prueba con otra.";
      }
      avatarUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    const trimmedName = data.full_name.trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload parcial de profiles
    const updateData: Record<string, any> = {
      full_name: trimmedName || null,
      avatar_url: avatarUrl,
      // Solo fechas válidas (14+): la página de nacimiento no deja avanzar sin
      // una y la base de datos lo vuelve a comprobar (migración age_gate).
      birth_date: checkBirthDate(data.birth_date).ok ? data.birth_date : null,
      gender: data.gender || null,
      comunidad_autonoma: data.comunidad_autonoma || null,
      city: data.city || null,
      is_student: data.is_student,
      student_type: data.is_student ? data.student_type || null : null,
      bachillerato_course: data.student_type === "bachillerato" ? data.bachillerato_course : null,
      bachillerato_modality: data.student_type === "bachillerato" ? data.bachillerato_modality || null : null,
      fp_study: data.student_type === "fp" ? data.fp_study || null : null,
      university_id: data.student_type === "universidad" ? data.university_id || null : null,
      career: data.student_type === "universidad" ? data.career || null : null,
      university_course: data.student_type === "universidad" ? data.university_course : null,
      master_study: data.student_type === "master" ? data.master_study || null : null,
      knows_desired_career: data.knows_desired_career,
      desired_career_id: data.knows_desired_career ? data.desired_career_id || null : null,
      desired_city: data.knows_desired_career && !data.study_anywhere ? data.desired_city || null : null,
      study_anywhere: data.study_anywhere,
      looking_for_housing: data.looking_for_housing,
      looking_for_roommate: data.looking_for_roommate,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    // "Completar después": no se guardan respuestas que el usuario no ha dado.
    // Los valores por defecto de `data` no son respuestas (fabricarían un
    // perfil de roomie o de planes que nadie ha contestado).
    if (mode === "partial") {
      if (!answered.has("knows_desired_career")) {
        delete updateData.knows_desired_career;
        delete updateData.desired_career_id;
        delete updateData.desired_city;
        delete updateData.study_anywhere;
      }
      if (!answered.has("looking_for_housing")) delete updateData.looking_for_housing;
      if (!answered.has("looking_for_roommate")) delete updateData.looking_for_roommate;
      if (!data.comunidad_autonoma) delete updateData.comunidad_autonoma;
      if (!data.city.trim()) delete updateData.city;
    }

    if (mode === "full" && data.looking_for_roommate) {
      // Se guarda en el VOCABULARIO DEL CUESTIONARIO (migración 157), no en el
      // de los botones de estas páginas. El onboarding escribía sus valores
      // tal cual ('fines_semana', 'flexible', limpieza 1-5, ruido 'moderado',
      // mascotas true/false) y lifestyle_answers_complete no reconoce ninguno:
      // todo el que terminaba el onboarding quedaba con el cuestionario "sin
      // responder" y la app se lo volvía a pedir eternamente aunque acababa de
      // contestarlo. Los mapeos de limpieza y mascotas son los mismos que ya
      // usó la migración 016 al convertir esas columnas.
      const partyingMap: Record<string, string> = {
        nunca: "nunca", ocasional: "a_veces", fines_semana: "fines_de_semana", frecuente: "mucho",
      };
      const sleepMap: Record<string, string> = {
        madrugador: "madrugador", nocturno: "nocturno", flexible: "normal",
      };
      const noiseMap: Record<string, string> = {
        silencio: "silencio", moderado: "normal", no_importa: "no_me_importa",
      };
      const friendsMap: Record<string, string> = {
        nunca: "nunca", a_veces: "a_veces", a_menudo: "frecuentemente", siempre: "frecuentemente",
      };
      Object.assign(updateData, {
        smoking: data.smoking,
        partying: partyingMap[data.partying] ?? data.partying,
        sleep_schedule: sleepMap[data.sleep_schedule] ?? data.sleep_schedule,
        study_habits: data.study_habits || null,
        cleanliness: data.cleanliness <= 2 ? "relajado" : data.cleanliness === 5 ? "muy_limpio" : "normal",
        disorder_tolerance: data.disorder_tolerance,
        noise_tolerance: noiseMap[data.noise_tolerance] ?? data.noise_tolerance,
        home_gatherings: data.home_gatherings,
        friends_at_home: friendsMap[data.home_gatherings] ?? data.home_gatherings,
        is_homebody: data.is_homebody,
        is_early_riser: data.is_early_riser,
        pet_friendly: data.pet_friendly ? "me_gustan" : "no",
        accepts_different_gender_roommate: data.accepts_different_gender_roommate,
        diet: data.diet,
        hobbies: data.hobbies,
        budget_min: data.budget_min,
        budget_max: data.budget_max,
        bio: data.bio || null,
      });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", user.id);

    if (updateError) {
      return friendlyProfileError(updateError.message);
    }

    if (trimmedName) {
      supabase.auth.updateUser({ data: { full_name: trimmedName } }).catch(() => {});
    }

    return null;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    if (editMode) {
      const err = await persistProfile();
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      navigateToDestination();
      return;
    }

    setAnalyzing(true);
    setAnalysisDone(false);
    setAnalysisMsgIdx(0);
    setAnalysisPct(0);
    const startedAt = Date.now();

    const err = await persistProfile();

    if (err) {
      setAnalyzing(false);
      setLoading(false);
      setError(err);
      return;
    }

    const MIN_ANALYSIS_MS = 2800;
    const remaining = Math.max(0, MIN_ANALYSIS_MS - (Date.now() - startedAt));
    await new Promise((r) => setTimeout(r, remaining));

    setAnalysisPct(100);
    setAnalysisDone(true);
    await new Promise((r) => setTimeout(r, 1400));

    navigateToDestination();
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet" />
      </div>
    );
  }

  // Salida para cuentas que no son de estudiante. Solo se llega aquí si no
  // pudimos marcar el onboarding por su cuenta: mejor una puerta que un
  // cuestionario de universidad y roomie que no le sirve de nada.
  if (nonStudentExit) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4">
        <div className="w-full max-w-md text-center animate-slide-up">
          <p className="eyebrow">Franky</p>
          <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
            Tu cuenta no necesita esto
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
            Este cuestionario es para estudiantes. Tu cuenta es profesional, así
            que puedes ir directo a tu panel.
          </p>
          <a
            href={nonStudentExit}
            className={cn(buttonVariants({ variant: "dark", size: "lg" }), "group mt-8")}
          >
            Ir a mi panel
            <ChevronRight className="h-4 w-4 arrow-nudge" />
          </a>
        </div>
      </div>
    );
  }

  // ── Derivados de presentación ──────────────────────────────────────────────
  const firstName = data.full_name.trim().split(/\s+/)[0] || "";
  const selectedUni = universities.find((u) => u.id === data.university_id) ?? null;
  const selectedUniName = selectedUni ? selectedUni.short_name || selectedUni.name : "";
  const phase = PHASES[page.phase];
  const PhaseIcon = phase.icon;
  const canSkip = !editMode && onboardingEssentialsDone(data, answered);

  const rawPct = Math.round(((currentIdx + (pageComplete ? 1 : 0.35)) / eligibleIds.length) * 100);
  const progressPct = Math.max(maxProgressRef.current, Math.max(3, Math.min(rawPct, 97)));
  maxProgressRef.current = progressPct;

  const roommateAnswered = [...answered].filter((k) => ROOMMATE_KEYS.has(k)).length;
  const matchPct = Math.min(60 + roommateAnswered * 4 + (data.hobbies.length > 0 ? 2 : 0), 98);

  // ── Pantalla de análisis final ─────────────────────────────────────────────
  if (analyzing) {
    const ANALYSIS_MSGS = [
      "Analizando tus respuestas…",
      "Buscando personas afines a ti…",
      selectedUniName
        ? `Conectándote con la comunidad de ${selectedUniName}…`
        : "Conectándote con tu comunidad…",
      data.looking_for_roommate
        ? "Calculando tu % de compatibilidad con roomies…"
        : "Preparando recomendaciones para ti…",
      "Dando los últimos retoques…",
    ];
    const msg = ANALYSIS_MSGS[Math.min(analysisMsgIdx, ANALYSIS_MSGS.length - 1)];

    return (
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          {/* Anillos que laten alrededor de un disco violeta solido: la unica
              animacion en bucle de la pantalla, y con motivo. */}
          <div className="relative mx-auto mb-8 h-36 w-36">
            <div className="absolute inset-0 rounded-full border border-violet/40 animate-pulse-ring" />
            <div className="absolute inset-0 rounded-full border border-violet/30 animate-pulse-ring" style={{ animationDelay: "0.6s" }} />
            <div className="absolute inset-0 rounded-full border border-violet/20 animate-pulse-ring" style={{ animationDelay: "1.2s" }} />
            <div className="absolute inset-4 flex items-center justify-center rounded-full bg-violet shadow-card-hover">
              {analysisDone ? (
                <Check className="h-12 w-12 text-white animate-pop-in" strokeWidth={2.5} />
              ) : (
                <Heart className="h-11 w-11 text-white animate-heartbeat" fill="currentColor" />
              )}
            </div>
          </div>

          <p className="mb-3 font-heading text-5xl font-extrabold tracking-tight text-text-primary tabular">
            {analysisPct}%
          </p>

          {analysisDone ? (
            <div className="animate-pop-in">
              <h1 className="mb-1.5 font-heading text-xl font-extrabold text-text-primary">
                Tu perfil está listo
              </h1>
              <p className="text-sm text-text-secondary">
                Bienvenido/a a la comunidad{selectedUniName ? ` de ${selectedUniName}` : " de Franky"}.
              </p>
            </div>
          ) : (
            <>
              <h1 key={msg} className="mb-1.5 font-heading text-lg font-bold text-text-primary animate-fade-in">
                {msg}
              </h1>
              <p className="text-sm text-text-muted">Esto tarda solo unos segundos…</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Contenido de cada micro-página ─────────────────────────────────────────
  // Cabecera grande (la pregunta) + el porqué + como mucho 3 campos.
  const renderPage = () => {
    switch (page.id) {
      case "nombre":
        return (
          <PageBody
            head={firstName ? `¡Hola, ${firstName}! ¿Es correcto?` : "¿Cómo te llamas?"}
            why="Tu nombre y tu foto hacen que la comunidad sea real, sin perfiles fantasma."
          >
            <div className="flex flex-col items-center gap-3 pb-1">
              {/* El <input file> cubre TODO el círculo: también funciona en
                  webviews (Instagram/TikTok) donde el label oculto no dispara. */}
              <label className="relative h-24 w-24 cursor-pointer">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-secondary">
                  {avatarPreview ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={avatarPreview} alt="Tu foto de perfil" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-8 w-8 text-text-muted" />
                  )}
                </div>
                <span className="pointer-events-none absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-violet text-white shadow-card ring-2 ring-bg-primary">
                  <Camera className="h-3.5 w-3.5" />
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  aria-label="Subir foto de perfil"
                  className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = "";
                  }}
                  onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
                />
              </label>
              <p className="text-xs text-text-muted">
                Foto opcional · los perfiles con foto inspiran mucha más confianza
              </p>
            </div>
            <div>
              <FieldLabel>Nombre completo</FieldLabel>
              <input
                type="text"
                autoFocus={!firstName}
                value={data.full_name}
                onChange={(e) => onChange({ full_name: e.target.value })}
                placeholder="Tu nombre y apellidos"
                maxLength={100}
                className={inputCls}
              />
            </div>
          </PageBody>
        );

      case "nacimiento": {
        const bounds = birthDateInputBounds();
        const birthCheck = checkBirthDate(data.birth_date);
        const birthMsg = birthDateMessage(birthCheck);
        return (
          <PageBody
            head="Un poco sobre ti"
            why="Para comprobar tu edad y mostrarte gente de tu edad. Nunca publicamos tu fecha exacta."
          >
            <div>
              <FieldLabel>Fecha de nacimiento</FieldLabel>
              <input
                type="date"
                value={data.birth_date}
                min={bounds.min}
                max={bounds.max}
                onChange={(e) => onChange({ birth_date: e.target.value })}
                aria-invalid={birthMsg ? true : undefined}
                aria-describedby={birthMsg ? "birth-date-msg" : undefined}
                className={inputCls}
              />
              {birthMsg && (
                <p
                  id="birth-date-msg"
                  role="status"
                  className="mt-2 rounded-xl border border-border bg-bg-secondary p-3 text-sm leading-relaxed text-text-secondary"
                >
                  {birthMsg}
                </p>
              )}
            </div>
            <div>
              <FieldLabel>Género</FieldLabel>
              <RadioGroup
                big
                value={data.gender}
                onChange={(v) => onChange({ gender: v })}
                options={[
                  { value: "hombre", label: "Hombre" },
                  { value: "mujer", label: "Mujer" },
                  { value: "no_binario", label: "No binario" },
                  { value: "prefiero_no_decirlo", label: "Prefiero no decirlo" },
                ]}
              />
            </div>
          </PageBody>
        );
      }

      case "vives":
        return (
          <PageBody
            head="¿Dónde vives?"
            why="Así te enseñamos pisos, eventos y gente cerca de ti."
          >
            <div>
              <FieldLabel>Comunidad Autónoma</FieldLabel>
              <select
                value={data.comunidad_autonoma}
                onChange={(e) => onChange({ comunidad_autonoma: e.target.value })}
                className={inputCls}
              >
                <option value="">Selecciona tu comunidad</option>
                {CCAA.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Ciudad</FieldLabel>
              <input
                type="text"
                value={data.city}
                onChange={(e) => onChange({ city: e.target.value })}
                placeholder="Tu ciudad actual"
                className={inputCls}
              />
            </div>
          </PageBody>
        );

      case "estudiante":
        return (
          <PageBody
            head="¿Eres estudiante?"
            why="Así podremos unirte a la comunidad de tu universidad y a gente como tú."
          >
            <YesNo
              label="¿Estudias actualmente?"
              value={data.is_student}
              show={answered.has("is_student")}
              onPick={(v) =>
                answer("is_student", {
                  is_student: v,
                  student_type: v ? data.student_type : "",
                })
              }
            />
          </PageBody>
        );

      case "tipo-estudios":
        return (
          <PageBody head="¿Qué estás estudiando?" why="Para presentarte a gente en tu misma etapa.">
            <RadioGroup
              big
              value={data.student_type}
              onChange={(v) =>
                onChange({
                  student_type: v,
                  bachillerato_course: null,
                  bachillerato_modality: "",
                  fp_study: "",
                  university_id: "",
                  career: "",
                  university_course: null,
                  master_study: "",
                })
              }
              options={[
                { value: "bachillerato", label: "Bachillerato" },
                { value: "fp", label: "FP" },
                { value: "universidad", label: "Universidad" },
                { value: "master", label: "Máster" },
                { value: "otro", label: "Otro" },
              ]}
            />
          </PageBody>
        );

      case "bachillerato":
        return (
          <PageBody head="Tu bachillerato" why="Para acercarte notas de corte y gente de tu modalidad.">
            <div>
              <FieldLabel>¿En qué curso estás?</FieldLabel>
              <RadioGroup
                big
                value={data.bachillerato_course?.toString() || ""}
                onChange={(v) => onChange({ bachillerato_course: Number(v) })}
                options={[
                  { value: "1", label: "1º Bachillerato" },
                  { value: "2", label: "2º Bachillerato" },
                ]}
              />
            </div>
            <div>
              <FieldLabel>Modalidad</FieldLabel>
              <RadioGroup
                big
                value={data.bachillerato_modality}
                onChange={(v) => onChange({ bachillerato_modality: v })}
                options={[
                  { value: "ciencias", label: "Ciencias" },
                  { value: "sociales", label: "Sociales" },
                  { value: "humanidades_artes", label: "Humanidades y Artes" },
                  { value: "general", label: "General" },
                ]}
              />
            </div>
          </PageBody>
        );

      case "fp":
        return (
          <PageBody head="¿Qué ciclo estudias?" why="Para conectarte con gente de tu rama.">
            <input
              type="text"
              autoFocus
              value={data.fp_study}
              onChange={(e) => onChange({ fp_study: e.target.value })}
              placeholder="Nombre de tu ciclo formativo"
              className={inputCls}
            />
          </PageBody>
        );

      case "universidad": {
        const q = uniSearch.trim().toLowerCase();
        const filteredUnis = q
          ? universities.filter(
              (u) =>
                u.name.toLowerCase().includes(q) ||
                (u.short_name?.toLowerCase().includes(q) ?? false)
            )
          : universities;
        return (
          <PageBody
            head="¿En qué universidad estás?"
            why="Te uniremos a la comunidad de tu campus: gente, eventos y pisos."
          >
            {selectedUni && (
              <div className="animate-pop-in">
                <div className="flex items-center justify-between gap-2 rounded-xl border border-violet bg-violet-50 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-violet">
                    <Check className="h-4 w-4 shrink-0" />
                    {selectedUni.short_name
                      ? `${selectedUni.name} (${selectedUni.short_name})`
                      : selectedUni.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ university_id: "", career: "" })}
                    className="shrink-0 text-xs font-medium text-text-muted hover:text-error"
                  >
                    Cambiar
                  </button>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-violet">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  ¡Bien! Te uniremos a la comunidad de {selectedUniName}
                </p>
              </div>
            )}
            <input
              type="text"
              autoFocus
              value={uniSearch}
              onChange={(e) => setUniSearch(e.target.value)}
              placeholder="Busca por nombre o siglas (ej. UMH)…"
              className={inputCls}
            />
            <div className="max-h-60 overflow-y-auto rounded-xl border border-border divide-y divide-border-light">
              {filteredUnis.map((u) => {
                const selected = data.university_id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onChange({ university_id: u.id, career: "" })}
                    aria-pressed={selected}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                      selected
                        ? "bg-violet-50 font-semibold text-violet-deep"
                        : "text-text-secondary hover:bg-bg-secondary"
                    }`}
                  >
                    <span>{u.short_name ? `${u.name} (${u.short_name})` : u.name}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
              {filteredUnis.length === 0 && (
                <p className="px-4 py-3 text-xs text-text-muted">
                  Sin resultados. Prueba con otro término.
                </p>
              )}
            </div>
          </PageBody>
        );
      }

      case "uni-carrera": {
        const cq = careerQuery.trim().toLowerCase();
        const filteredUniCareers = (
          cq
            ? universityCareers.filter((c) => c.name.toLowerCase().includes(cq))
            : universityCareers
        )
          .slice()
          .sort((a, b) => {
            if (!cq) return 0;
            const an = a.name.toLowerCase();
            const bn = b.name.toLowerCase();
            const as = an.startsWith(cq);
            const bs = bn.startsWith(cq);
            if (as !== bs) return as ? -1 : 1;
            return an.length - bn.length || an.localeCompare(bn);
          });
        return (
          <PageBody
            head="¿Qué carrera estudias?"
            why="Te presentaremos a gente de tu misma carrera."
          >
            {universityCareersLoading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando carreras…
              </div>
            ) : universityCareers.length === 0 ? (
              <input
                type="text"
                autoFocus
                value={data.career}
                onChange={(e) => onChange({ career: e.target.value })}
                placeholder="Nombre de tu carrera"
                className={inputCls}
              />
            ) : (
              <>
                {data.career && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-violet bg-violet-50 px-3 py-2.5 animate-pop-in">
                    <span className="flex items-center gap-2 text-sm font-semibold text-violet">
                      <Check className="h-4 w-4 shrink-0" />
                      {data.career}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange({ career: "" })}
                      className="shrink-0 text-xs font-medium text-text-muted hover:text-error"
                    >
                      Cambiar
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  autoFocus
                  value={careerQuery}
                  onChange={(e) => setCareerQuery(e.target.value)}
                  placeholder="Busca tu carrera…"
                  className={inputCls}
                />
                <div className="max-h-60 overflow-y-auto rounded-xl border border-border divide-y divide-border-light">
                  {filteredUniCareers.map((c) => {
                    const selected = data.career === c.name;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onChange({ career: c.name })}
                        aria-pressed={selected}
                        className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                          selected
                            ? "bg-violet-50 font-semibold text-violet-deep"
                            : "text-text-secondary hover:bg-bg-secondary"
                        }`}
                      >
                        <span>{c.name}</span>
                        {selected && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                  {filteredUniCareers.length === 0 && (
                    <p className="px-4 py-3 text-xs text-text-muted">
                      Sin resultados. Prueba con otro término.
                    </p>
                  )}
                </div>
              </>
            )}
          </PageBody>
        );
      }

      case "uni-curso":
        return (
          <PageBody head="¿En qué curso estás?" why="Un 1º y un 4º viven la uni de formas muy distintas.">
            <RadioGroup
              big
              value={data.university_course?.toString() || ""}
              onChange={(v) => onChange({ university_course: Number(v) })}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({
                value: n.toString(),
                label: `${n}º`,
              }))}
            />
          </PageBody>
        );

      case "master":
        return (
          <PageBody head="¿Qué máster estudias?" why="Para conectarte con gente de tu especialidad.">
            <input
              type="text"
              autoFocus
              value={data.master_study}
              onChange={(e) => onChange({ master_study: e.target.value })}
              placeholder="Nombre de tu máster"
              className={inputCls}
            />
          </PageBody>
        );

      case "futuro":
        return (
          <PageBody
            head="¿Sabes qué quieres estudiar?"
            why="Con esto te enseñamos notas de corte y becas de lo que te interesa."
          >
            <YesNo
              label="¿Tienes clara la carrera?"
              value={data.knows_desired_career}
              show={answered.has("knows_desired_career")}
              onPick={(v) =>
                answer("knows_desired_career", {
                  knows_desired_career: v,
                  desired_career_id: v ? data.desired_career_id : "",
                })
              }
            />
          </PageBody>
        );

      case "carrera-deseada": {
        const dq = desiredCareerSearch.trim().toLowerCase();
        const filteredCareers =
          dq.length >= 2
            ? careers
                .filter((c) => c.name.toLowerCase().includes(dq))
                .sort((a, b) => {
                  const an = a.name.toLowerCase();
                  const bn = b.name.toLowerCase();
                  const as = an.startsWith(dq);
                  const bs = bn.startsWith(dq);
                  if (as !== bs) return as ? -1 : 1;
                  return an.length - bn.length || an.localeCompare(bn);
                })
                .slice(0, 20)
            : [];
        return (
          <PageBody
            head="¿Qué carrera te interesa?"
            why="Te avisaremos de sus notas de corte y novedades."
          >
            <input
              type="text"
              autoFocus
              value={desiredCareerSearch}
              onChange={(e) => setDesiredCareerSearch(e.target.value)}
              placeholder="Escribe el nombre de la carrera..."
              className={inputCls}
            />
            {filteredCareers.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
                {filteredCareers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange({ desired_career_id: c.id });
                      setDesiredCareerSearch(c.name);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-bg-secondary ${
                      data.desired_career_id === c.id ? "bg-violet-50 font-medium text-violet-deep" : ""
                    }`}
                  >
                    {c.name}
                    <span className="text-xs text-text-muted ml-2">· {c.university_name}</span>
                  </button>
                ))}
              </div>
            )}
          </PageBody>
        );
      }

      case "ciudad-deseada":
        return (
          <PageBody
            head="¿Dónde te gustaría estudiar?"
            why="Para enseñarte alojamiento y ambiente justo donde irás."
          >
            <button
              type="button"
              onClick={() => onChange({ study_anywhere: !data.study_anywhere, desired_city: "" })}
              className={`w-full py-3 rounded-xl border text-sm font-semibold transition-[border-color,background-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-quart)] active:scale-[0.97] ${
                data.study_anywhere
                  ? "border-violet bg-violet-50 text-violet-deep ring-1 ring-violet"
                  : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:bg-bg-secondary"
              }`}
            >
              Me da igual la ciudad
            </button>
            {!data.study_anywhere && (
              <div>
                <FieldLabel>Ciudad preferida</FieldLabel>
                <input
                  type="text"
                  value={data.desired_city}
                  onChange={(e) => onChange({ desired_city: e.target.value })}
                  placeholder="Ej. Alicante, Madrid…"
                  className={inputCls}
                />
              </div>
            )}
          </PageBody>
        );

      case "busquedas":
        return (
          <PageBody
            head="¿Qué estás buscando ahora?"
            why="Activamos solo lo que necesitas: pisos, roomies o ambas."
          >
            <YesNo
              label="¿Buscas alojamiento?"
              value={data.looking_for_housing}
              show={answered.has("looking_for_housing")}
              onPick={(v) => answer("looking_for_housing", { looking_for_housing: v })}
            />
            <YesNo
              label="¿Buscas compañero/a de piso?"
              value={data.looking_for_roommate}
              show={answered.has("looking_for_roommate")}
              onPick={(v) => answer("looking_for_roommate", { looking_for_roommate: v })}
            />
            {answered.has("looking_for_roommate") && data.looking_for_roommate && (
              <p className="flex items-start gap-1.5 rounded-xl border border-violet/20 bg-violet-50 p-2.5 text-xs font-medium text-violet-deep animate-pop-in">
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ¡Genial! Ahora vienen unas preguntas rápidas para calcular tu % de
                compatibilidad con cada roomie.
              </p>
            )}
          </PageBody>
        );

      case "r-fuma-fiesta":
        return (
          <PageBody head="Tu estilo de vida" why="Cada respuesta afina tu % de compatibilidad.">
            <div>
              <FieldLabel>¿Fumas?</FieldLabel>
              <RadioGroup
                big
                value={answered.has("smoking") ? data.smoking : ""}
                onChange={(v) => answer("smoking", { smoking: v })}
                options={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                  { value: "ocasional", label: "Ocasionalmente" },
                ]}
              />
            </div>
            <div>
              <FieldLabel>¿Cuánto te gusta la fiesta?</FieldLabel>
              <RadioGroup
                big
                value={answered.has("partying") ? data.partying : ""}
                onChange={(v) => answer("partying", { partying: v })}
                options={[
                  { value: "nunca", label: "Nunca" },
                  { value: "ocasional", label: "Ocasional" },
                  { value: "fines_semana", label: "Fines de semana" },
                  { value: "frecuente", label: "Frecuente" },
                ]}
              />
            </div>
          </PageBody>
        );

      case "r-sueno":
        return (
          <PageBody head="Ritmo de casa" why="Un nocturno y un madrugador pueden chocar: mejor saberlo antes.">
            <div>
              <FieldLabel>Horario de sueño</FieldLabel>
              <RadioGroup
                big
                value={answered.has("sleep_schedule") ? data.sleep_schedule : ""}
                onChange={(v) => answer("sleep_schedule", { sleep_schedule: v })}
                options={[
                  { value: "madrugador", label: "Madrugador/a" },
                  { value: "nocturno", label: "Nocturno/a" },
                  { value: "flexible", label: "Flexible" },
                ]}
              />
            </div>
            <div>
              <FieldLabel>¿Haces quedadas en casa?</FieldLabel>
              <RadioGroup
                big
                value={answered.has("home_gatherings") ? data.home_gatherings : ""}
                onChange={(v) => answer("home_gatherings", { home_gatherings: v })}
                options={[
                  { value: "nunca", label: "Nunca" },
                  { value: "a_veces", label: "A veces" },
                  { value: "a_menudo", label: "A menudo" },
                  { value: "siempre", label: "Siempre" },
                ]}
              />
            </div>
            <div>
              {/* Una de las 8 del cuestionario de convivencia (157) y la única
                  que el onboarding no preguntaba: quien salía de aquí quedaba
                  con el cuestionario "a medias" para siempre. Mismos valores
                  que el editor de roomie-match. */}
              <FieldLabel>¿Dónde estudias?</FieldLabel>
              <RadioGroup
                big
                value={answered.has("study_habits") ? data.study_habits : ""}
                onChange={(v) => answer("study_habits", { study_habits: v })}
                options={[
                  { value: "en_casa", label: "En casa" },
                  { value: "biblioteca", label: "Biblioteca" },
                  { value: "mixto", label: "Ambos" },
                ]}
              />
            </div>
          </PageBody>
        );

      case "r-limpieza":
        return (
          <PageBody head="Limpieza y ruido" why="El desorden es la causa nº1 de conflictos entre roomies.">
            <SliderField
              label="¿Cómo de limpio/a eres?"
              value={data.cleanliness}
              onChange={(v) => answer("cleanliness", { cleanliness: v })}
              min={1}
              max={5}
              labels={["Poco", "Normal", "Muy limpio"]}
            />
            <SliderField
              label="¿Cuánto toleras el desorden?"
              value={data.disorder_tolerance}
              onChange={(v) => answer("disorder_tolerance", { disorder_tolerance: v })}
              min={1}
              max={5}
              labels={["Nada", "Normal", "Mucho"]}
            />
            <div>
              <FieldLabel>Tolerancia al ruido</FieldLabel>
              <RadioGroup
                big
                value={answered.has("noise_tolerance") ? data.noise_tolerance : ""}
                onChange={(v) => answer("noise_tolerance", { noise_tolerance: v })}
                options={[
                  { value: "silencio", label: "Necesito silencio" },
                  { value: "moderado", label: "Moderado" },
                  { value: "no_importa", label: "No me importa" },
                ]}
              />
            </div>
          </PageBody>
        );

      case "r-estilo":
        return (
          <PageBody head="¿Cómo eres en casa?" why="Sé sincero/a: es lo que hace la magia del match.">
            <YesNo
              label="¿Eres más casero/a?"
              value={data.is_homebody}
              show={answered.has("is_homebody")}
              onPick={(v) => answer("is_homebody", { is_homebody: v })}
            />
            <YesNo
              label="¿Eres madrugador/a?"
              value={data.is_early_riser}
              show={answered.has("is_early_riser")}
              onPick={(v) => answer("is_early_riser", { is_early_riser: v })}
            />
          </PageBody>
        );

      case "r-extra":
        return (
          <PageBody head="Convivencia" why="Dos detalles que evitan sorpresas al compartir piso.">
            <YesNo
              label="¿Te gustan las mascotas?"
              value={data.pet_friendly}
              show={answered.has("pet_friendly")}
              onPick={(v) => answer("pet_friendly", { pet_friendly: v })}
            />
            <YesNo
              label="¿Aceptas roomie de otro género?"
              value={data.accepts_different_gender_roommate}
              show={answered.has("accepts_different_gender_roommate")}
              onPick={(v) =>
                answer("accepts_different_gender_roommate", {
                  accepts_different_gender_roommate: v,
                })
              }
            />
          </PageBody>
        );

      case "r-dieta":
        return (
          <PageBody head="¿Sigues alguna dieta?" why="Compartir cocina es más fácil si encajáis.">
            <RadioGroup
              big
              value={answered.has("diet") ? data.diet : ""}
              onChange={(v) => answer("diet", { diet: v })}
              options={[
                { value: "sin_preferencia", label: "Sin preferencia" },
                { value: "vegetariano", label: "Vegetariano" },
                { value: "vegano", label: "Vegano" },
                { value: "halal", label: "Halal" },
                { value: "otro", label: "Otro" },
              ]}
            />
          </PageBody>
        );

      case "r-hobbies":
        return (
          <PageBody
            head="¿Qué te gusta hacer?"
            why="Los hobbies compartidos son lo que más une a los roomies. Elige al menos uno."
          >
            <div className="flex flex-wrap gap-2">
              {HOBBIES_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    const current = data.hobbies;
                    answer("hobbies", {
                      hobbies: current.includes(h)
                        ? current.filter((x) => x !== h)
                        : [...current, h],
                    });
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-[border-color,background-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out-quart)] active:scale-[0.97] ${
                    data.hobbies.includes(h)
                      ? "border-violet bg-violet-50 text-violet-deep ring-1 ring-violet"
                      : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:bg-bg-secondary"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
            {data.hobbies.length > 0 && (
              <p className="text-xs font-medium text-violet animate-pop-in">
                {data.hobbies.length} elegido{data.hobbies.length > 1 ? "s" : ""}
              </p>
            )}
          </PageBody>
        );

      case "final-roomie":
        return (
          <PageBody
            head="Último paso"
            why="Solo te mostraremos roomies con presupuestos que encajen con el tuyo."
          >
            <div>
              <FieldLabel>Presupuesto mensual (€)</FieldLabel>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={data.budget_min}
                  onChange={(e) => onChange({ budget_min: Number(e.target.value) })}
                  min={0}
                  className={cn(inputCls, "w-24 text-center tabular")}
                />
                <span className="text-text-muted text-sm">a</span>
                <input
                  type="number"
                  value={data.budget_max}
                  onChange={(e) => onChange({ budget_max: Number(e.target.value) })}
                  min={0}
                  className={cn(inputCls, "w-24 text-center tabular")}
                />
                <span className="text-text-muted text-sm">€/mes</span>
              </div>
            </div>
            <div>
              <FieldLabel>Sobre ti (opcional)</FieldLabel>
              <textarea
                value={data.bio}
                onChange={(e) => onChange({ bio: e.target.value })}
                rows={3}
                maxLength={500}
                placeholder="Cuéntanos un poco sobre ti y cómo eres en casa..."
                className={cn(inputCls, "h-auto resize-none py-2.5")}
              />
              <p className="text-xs text-text-muted mt-1">{data.bio.length}/500</p>
            </div>
          </PageBody>
        );

      case "final-basic":
        return (
          <PageBody
            head={`Todo listo${firstName ? `, ${firstName}` : ""}`}
            why="Con esto ya podemos personalizar Franky para ti."
          >
            <div className="flex flex-wrap gap-2">
              {[
                data.city,
                selectedUniName,
                data.career,
                data.looking_for_housing && "Buscando alojamiento",
              ]
                .filter(Boolean)
                .map((chip) => (
                  <span
                    key={chip as string}
                    className="rounded-full border border-border bg-bg-primary px-3 py-1.5 text-xs font-medium text-text-primary"
                  >
                    {chip}
                  </span>
                ))}
            </div>
          </PageBody>
        );

      default:
        return null;
    }
  };

  const submitLabel = editMode
    ? "Guardar cambios"
    : data.looking_for_roommate
    ? "Ver mi compatibilidad"
    : "Completar mi perfil";

  // Enter en inputs / botón → : avanza (o envía en la página final).
  const handleShellSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageComplete || loading) return;
    if (page.isFinal) {
      handleSubmit();
    } else {
      goNext();
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-bg-primary">
      {/* Barra de progreso fina pegada arriba: el avance se ve sin robar
          sitio a la pregunta. */}
      <div
        className="h-0.5 w-full bg-border-light"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPct}
        aria-label="Progreso del cuestionario"
      >
        <div
          className="h-full bg-violet transition-[width] duration-500 ease-[var(--ease-out-quart)]"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Cabecera compacta: marca + contador + salir. La pregunta manda. */}
      <div className="mx-auto w-full max-w-xl px-4 pt-6">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-5 w-5 text-violet" aria-hidden="true" />
          <div>
            <p className="font-heading text-sm font-bold leading-tight text-text-primary">
              {editMode ? "Edita tu perfil" : "Crea tu perfil"}
            </p>
            <p className="text-xs text-text-muted tabular">
              Pregunta {currentIdx + 1} de {eligibleIds.length} · {progressPct}%
            </p>
          </div>
          {canSkip && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={loading}
              className="link-underline ml-auto shrink-0 text-xs font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
            >
              Completar después
            </button>
          )}
        </div>
      </div>

      {/* Micro-página, sin tarjeta: la pregunta grande sobre el blanco. */}
      <div className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <form onSubmit={handleShellSubmit} noValidate>
          {/* Fase actual + medidor de match en la fase roomie */}
          <div className="mb-5 flex items-center gap-2">
            <span className="eyebrow inline-flex items-center gap-1.5">
              <PhaseIcon className="h-3.5 w-3.5 text-violet" aria-hidden="true" />
              {phase.label}
            </span>
            {page.phase === 4 && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-violet tabular">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Match {matchPct}%
              </span>
            )}
          </div>

          {error && (
            <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-error/20 bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          {/* Entrada animada por página. CSS puro a propósito (sin framer-motion:
              con mode="wait" podía congelarse al cambiar de pestaña). */}
          <div key={page.id} className="animate-step-in">
            {renderPage()}
          </div>

          {/* Navegación: atrás siempre; adelante solo cuando hace falta pulsar
              (texto libre, multi-select, volver a una página ya respondida o
              modo edición). En páginas auto, si está incompleta no hay botón:
              responder ES avanzar. */}
          <div className="mt-10 flex items-center justify-between border-t border-border-light pt-5">
            <Button
              type="button"
              variant="ghost"
              onClick={goBack}
              disabled={history.length === 0 || loading}
              className={history.length === 0 ? "invisible" : ""}
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </Button>

            {page.isFinal ? (
              <Button type="submit" size="lg" loading={loading}>
                {!loading && (data.looking_for_roommate && !editMode ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                ))}
                {loading ? "Guardando..." : submitLabel}
              </Button>
            ) : pageManual || editMode ? (
              <Button type="submit" disabled={!pageComplete || loading} className="group">
                OK
                <ChevronRight className="h-4 w-4 arrow-nudge" />
              </Button>
            ) : pageComplete ? (
              // Página auto ya respondida (p. ej. al volver atrás): flecha para
              // seguir sin tener que cambiar la respuesta.
              <Button type="submit" variant="secondary" className="group">
                Seguir
                <ChevronRight className="h-4 w-4 arrow-nudge" />
              </Button>
            ) : (
              <span className="text-xs text-text-muted">
                Responde y avanzamos solos
              </span>
            )}
          </div>

          {/* Con lo imprescindible ya respondido (edad y universidad/curso), el
              resto es opcional: salida clara para entrar ya y completarlo
              después desde el perfil. Oculta en edición y en la página final. */}
          {canSkip && !page.isFinal && (
            <div className="mt-6 rounded-2xl border border-border bg-bg-secondary/60 p-4 text-center">
              <p className="text-sm text-text-secondary">
                Ya tienes lo imprescindible. El resto es opcional y puedes completarlo cuando quieras desde tu
                perfil.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={handleSkip}
                disabled={loading}
                className="group mt-3"
              >
                {selectedUniName ? `Completar después y entrar en ${selectedUniName}` : "Completar después y entrar"}
                <ChevronRight className="h-4 w-4 arrow-nudge" />
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// Cuerpo estándar de una micro-página: pregunta grande + porqué + campos.
function PageBody({
  head,
  why,
  children,
}: {
  head: string;
  why: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary sm:text-3xl">{head}</h2>
      <p className="mb-7 mt-2 text-[15px] leading-relaxed text-text-muted">{why}</p>
      <div className="space-y-5">{children}</div>
    </div>
  );
}
