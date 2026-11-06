// Etiquetas legibles de los campos de estilo de vida de un perfil roomie.
// Espejo de web/src/lib/lifestyle-labels.ts, con UNA diferencia deliberada:
// aquí solo se traduce el vocabulario del CUESTIONARIO ACTUAL.
//
// POR QUÉ: desde la migración 157, los valores del onboarding ('flexible',
// 'moderado', cleanliness numérico, pet_friendly booleano) significan
// exactamente "esta persona NO ha contestado el cuestionario". Traducirlos
// sería volver a enseñar como suyo un valor por defecto que nunca eligió, que
// es justo el problema que arreglan la 157 y la 158.
//
// Regla de oro: valor desconocido -> null -> ese dato NO se pinta. Nunca se
// enseña el valor crudo ('5', 'false') ni se rellena el hueco con una
// suposición.

const SMOKING: Record<string, string> = {
  no: '🚭 No fuma',
  ocasional: '🚬 Fuma ocasional',
  si: '🚬 Fumador/a',
};

const PARTYING: Record<string, string> = {
  nunca: '🏠 No sale de fiesta',
  a_veces: '🎉 Fiesta a veces',
  fines_de_semana: '🎉 Fiesta los findes',
  mucho: '🎊 Fiestero/a',
};

const SLEEP: Record<string, string> = {
  madrugador: '🌅 Madrugador/a',
  normal: '😴 Horario normal',
  nocturno: '🌙 Noctámbulo/a',
};

const CLEAN: Record<string, string> = {
  muy_limpio: '🧼 Muy limpio/a',
  normal: '🧹 Limpieza normal',
  relajado: '😎 Limpieza relajada',
};

const STUDY: Record<string, string> = {
  en_casa: '📚 Estudia en casa',
  biblioteca: '📖 Estudia en biblioteca',
  mixto: '📝 Estudia en ambos',
};

const FRIENDS: Record<string, string> = {
  nunca: '🚪 Sin visitas en casa',
  a_veces: '👥 Visitas a veces',
  frecuentemente: '🎈 Visitas frecuentes',
};

const NOISE: Record<string, string> = {
  silencio: '🔇 Necesita silencio',
  normal: '🔉 Ruido normal ok',
  no_me_importa: '🔊 Le da igual el ruido',
};

const PET: Record<string, string> = {
  no: '🚫 Prefiere sin mascotas',
  me_gustan: '🐾 Le gustan las mascotas',
  tengo: '🐾 Tiene mascota',
};

// ── Las seis preguntas que antes solo hacía la web (010 y 006) ──
// Etiquetas de OPCIÓN (para los chips del editor de roomie) y de PERFIL (para
// enseñar la respuesta en una ficha). Mismos valores que los CHECK de las
// columnas y que el onboarding web.
export const HOME_GATHERINGS_OPTIONS: { value: string; label: string }[] = [
  { value: 'nunca', label: 'Nunca' },
  { value: 'a_veces', label: 'A veces' },
  { value: 'a_menudo', label: 'A menudo' },
  { value: 'siempre', label: 'Siempre' },
];
export const DIET_OPTIONS: { value: string; label: string }[] = [
  { value: 'sin_preferencia', label: 'Sin preferencia' },
  { value: 'vegetariano', label: 'Vegetariano' },
  { value: 'vegano', label: 'Vegano' },
  { value: 'halal', label: 'Halal' },
  { value: 'otro', label: 'Otro' },
];
// disorder_tolerance es un entero 1..5 (slider en la web con las etiquetas
// Nada / Normal / Mucho en los extremos y el centro).
export const DISORDER_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Nada' },
  { value: 2, label: 'Poco' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Bastante' },
  { value: 5, label: 'Mucho' },
];

const GATHERINGS: Record<string, string> = {
  nunca: '🚪 Nunca hace quedadas en casa',
  a_veces: '🎈 Quedadas en casa a veces',
  a_menudo: '🎈 Quedadas en casa a menudo',
  siempre: '🎉 Siempre hay gente en casa',
};
const DIET: Record<string, string> = {
  sin_preferencia: '🍽️ Come de todo',
  vegetariano: '🥗 Vegetariano/a',
  vegano: '🌱 Vegano/a',
  halal: '🕌 Halal',
  otro: '🍽️ Dieta especial',
};

type Raw = string | number | boolean | null | undefined;

const pick = (dict: Record<string, string>) => (v: Raw): string | null =>
  typeof v === 'string' ? dict[v] ?? null : null;

export const labelHomeGatherings = pick(GATHERINGS);
export const labelDiet = pick(DIET);
export const labelDisorderTolerance = (v: Raw): string | null => {
  if (typeof v !== 'number' || v < 1 || v > 5) return null;
  return v <= 2 ? '🧹 Tolera poco el desorden' : v === 3 ? '🧹 Tolera el desorden normal' : '😌 Le da igual el desorden';
};
// Booleanos: solo se pintan si hay respuesta explícita (null = sin contestar).
export const labelHomebody = (v: Raw): string | null =>
  v === true ? '🛋️ Casero/a' : v === false ? '🚶 Poco casero/a' : null;
export const labelEarlyRiser = (v: Raw): string | null =>
  v === true ? '⏰ Madruga' : v === false ? '🌙 No madruga' : null;
export const labelAcceptsDifferentGender = (v: Raw): string | null =>
  v === true ? '🤝 Roomie de cualquier género' : v === false ? '🚻 Roomie de su mismo género' : null;

export const labelSmoking = pick(SMOKING);
export const labelPartying = pick(PARTYING);
export const labelSleep = pick(SLEEP);
export const labelCleanliness = pick(CLEAN);
export const labelStudy = pick(STUDY);
export const labelFriends = pick(FRIENDS);
export const labelNoise = pick(NOISE);
export const labelPet = pick(PET);

/** Los ocho datos de estilo de vida, ya traducidos y sin los que falten. */
export function lifestyleChips(p: {
  smoking?: Raw; partying?: Raw; study_habits?: Raw; sleep_schedule?: Raw;
  cleanliness?: Raw; noise_tolerance?: Raw; friends_at_home?: Raw; pet_friendly?: Raw;
}): string[] {
  return [
    labelSmoking(p.smoking),
    labelPartying(p.partying),
    labelStudy(p.study_habits),
    labelSleep(p.sleep_schedule),
    labelCleanliness(p.cleanliness),
    labelNoise(p.noise_tolerance),
    labelFriends(p.friends_at_home),
    labelPet(p.pet_friendly),
  ].filter((x): x is string => x !== null);
}
