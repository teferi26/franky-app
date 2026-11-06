// Etiquetas legibles para los campos de estilo de vida de los perfiles roomie.
//
// En la BD conviven dos vocabularios: el del onboarding actual
// (partying: "ocasional"/"fines_semana"/"frecuente", cleanliness numérico 1-5,
// pet_friendly booleano) y el del flujo antiguo de roomie-match
// (partying: "a_veces"/"fines_de_semana"/"mucho", cleanliness textual,
// pet_friendly "no"/"me_gustan"/"tengo"). Estas funciones aceptan ambos y
// devuelven null para valores desconocidos: un chip sin traducción no se pinta
// (nunca se muestra el valor crudo tipo "5" o "false" al usuario).

const SMOKING: Record<string, string> = {
  no: "🚭 No fuma",
  ocasional: "🚬 Fuma ocasional",
  si: "🚬 Fumador/a",
};

const PARTYING: Record<string, string> = {
  nunca: "🏠 No sale de fiesta",
  a_veces: "🎉 Fiesta a veces",
  ocasional: "🎉 Fiesta ocasional",
  fines_de_semana: "🎉 Fiesta los findes",
  fines_semana: "🎉 Fiesta los findes",
  mucho: "🎊 Fiestero/a",
  frecuente: "🎊 Fiestero/a",
};

const SLEEP: Record<string, string> = {
  madrugador: "🌅 Madrugador/a",
  normal: "😴 Horario normal",
  nocturno: "🌙 Noctámbulo/a",
  flexible: "🕒 Horario flexible",
};

const CLEAN: Record<string, string> = {
  muy_limpio: "🧼 Muy limpio/a",
  normal: "🧹 Limpieza normal",
  relajado: "😎 Limpieza relajada",
};

const STUDY: Record<string, string> = {
  en_casa: "📚 Estudia en casa",
  biblioteca: "📖 Estudia en biblioteca",
  mixto: "📝 Estudia en ambos",
};

const FRIENDS: Record<string, string> = {
  nunca: "🚪 Sin visitas en casa",
  a_veces: "👥 Visitas a veces",
  a_menudo: "🎈 Visitas a menudo",
  frecuentemente: "🎈 Visitas frecuentes",
  siempre: "🎈 Visitas siempre",
};

const NOISE: Record<string, string> = {
  silencio: "🔇 Necesita silencio",
  moderado: "🔉 Ruido moderado ok",
  no_me_importa: "🔊 Le da igual el ruido",
  no_importa: "🔊 Le da igual el ruido",
};

const DIET: Record<string, string> = {
  vegetariano: "🥗 Vegetariano/a",
  vegano: "🌱 Vegano/a",
  halal: "🥘 Halal",
};

type Raw = string | number | boolean | null | undefined;

export function labelSmoking(v: Raw): string | null {
  return typeof v === "string" ? SMOKING[v] ?? null : null;
}

export function labelPartying(v: Raw): string | null {
  return typeof v === "string" ? PARTYING[v] ?? null : null;
}

export function labelSleep(v: Raw): string | null {
  return typeof v === "string" ? SLEEP[v] ?? null : null;
}

// El onboarding guarda cleanliness como slider 1-5; el flujo antiguo como texto.
export function labelCleanliness(v: Raw): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^[1-5]$/.test(v) ? Number(v) : null;
  if (n !== null) return n <= 2 ? CLEAN.relajado : n === 3 ? CLEAN.normal : CLEAN.muy_limpio;
  return typeof v === "string" ? CLEAN[v] ?? null : null;
}

export function labelStudy(v: Raw): string | null {
  return typeof v === "string" ? STUDY[v] ?? null : null;
}

export function labelFriends(v: Raw): string | null {
  return typeof v === "string" ? FRIENDS[v] ?? null : null;
}

export function labelNoise(v: Raw): string | null {
  return typeof v === "string" ? NOISE[v] ?? null : null;
}

// pet_friendly: booleano (onboarding) o "no"/"me_gustan"/"tengo" (flujo antiguo).
export function labelPet(v: Raw): string | null {
  if (v === true || v === "true") return "🐾 Mascotas OK";
  if (v === "me_gustan") return "🐾 Le gustan las mascotas";
  if (v === "tengo") return "🐾 Tiene mascota";
  return null;
}

export function labelDiet(v: Raw): string | null {
  return typeof v === "string" ? DIET[v] ?? null : null;
}
