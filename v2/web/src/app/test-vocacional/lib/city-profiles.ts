/* ═══════════════════════════════════════════════════════════
   City Profiles — 42 Spanish university cities with
   lifestyle attributes for student matching.
   ═══════════════════════════════════════════════════════════ */

import type { CityProfile, CityMatch, StudentProfile } from "../types";

export const CITY_PROFILES: CityProfile[] = [
  { name: "Madrid", comunidad: "madrid", size: "XXL", cost_of_living: "alto", climate: "continental", nightlife: 10, culture: 10, beach_proximity: "no", student_friendly: 9, transport: 10, international: 10 },
  { name: "Barcelona", comunidad: "cataluna", size: "XXL", cost_of_living: "alto", climate: "mediterraneo", nightlife: 10, culture: 10, beach_proximity: "si", student_friendly: 9, transport: 10, international: 10 },
  { name: "Valencia", comunidad: "comunidad_valenciana", size: "XL", cost_of_living: "medio", climate: "mediterraneo", nightlife: 9, culture: 8, beach_proximity: "si", student_friendly: 9, transport: 8, international: 8 },
  { name: "Sevilla", comunidad: "andalucia", size: "XL", cost_of_living: "medio", climate: "calido", nightlife: 9, culture: 9, beach_proximity: "cerca", student_friendly: 9, transport: 7, international: 7 },
  { name: "Málaga", comunidad: "andalucia", size: "L", cost_of_living: "medio", climate: "calido", nightlife: 8, culture: 7, beach_proximity: "si", student_friendly: 7, transport: 7, international: 8 },
  { name: "Bilbao", comunidad: "pais_vasco", size: "L", cost_of_living: "alto", climate: "atlantico", nightlife: 7, culture: 9, beach_proximity: "cerca", student_friendly: 8, transport: 8, international: 7 },
  { name: "Zaragoza", comunidad: "aragon", size: "L", cost_of_living: "bajo", climate: "continental", nightlife: 7, culture: 7, beach_proximity: "no", student_friendly: 8, transport: 7, international: 5 },
  { name: "Granada", comunidad: "andalucia", size: "M", cost_of_living: "bajo", climate: "continental", nightlife: 9, culture: 9, beach_proximity: "cerca", student_friendly: 10, transport: 5, international: 7 },
  { name: "Salamanca", comunidad: "castilla_leon", size: "M", cost_of_living: "bajo", climate: "continental", nightlife: 8, culture: 9, beach_proximity: "no", student_friendly: 10, transport: 4, international: 8 },
  { name: "Santiago de Compostela", comunidad: "galicia", size: "M", cost_of_living: "bajo", climate: "atlantico", nightlife: 7, culture: 8, beach_proximity: "cerca", student_friendly: 9, transport: 5, international: 6 },
  { name: "Pamplona", comunidad: "navarra", size: "M", cost_of_living: "medio", climate: "atlantico", nightlife: 7, culture: 7, beach_proximity: "no", student_friendly: 8, transport: 6, international: 6 },
  { name: "San Sebastián", comunidad: "pais_vasco", size: "M", cost_of_living: "muy_alto", climate: "atlantico", nightlife: 7, culture: 9, beach_proximity: "si", student_friendly: 7, transport: 6, international: 7 },
  { name: "Alicante", comunidad: "comunidad_valenciana", size: "M", cost_of_living: "medio", climate: "mediterraneo", nightlife: 7, culture: 6, beach_proximity: "si", student_friendly: 7, transport: 6, international: 7 },
  { name: "Murcia", comunidad: "murcia", size: "L", cost_of_living: "bajo", climate: "mediterraneo", nightlife: 6, culture: 5, beach_proximity: "cerca", student_friendly: 7, transport: 5, international: 4 },
  { name: "Valladolid", comunidad: "castilla_leon", size: "M", cost_of_living: "bajo", climate: "continental", nightlife: 6, culture: 7, beach_proximity: "no", student_friendly: 8, transport: 6, international: 5 },
  { name: "Córdoba", comunidad: "andalucia", size: "M", cost_of_living: "bajo", climate: "calido", nightlife: 6, culture: 8, beach_proximity: "no", student_friendly: 7, transport: 5, international: 5 },
  { name: "A Coruña", comunidad: "galicia", size: "M", cost_of_living: "bajo", climate: "atlantico", nightlife: 6, culture: 7, beach_proximity: "si", student_friendly: 7, transport: 5, international: 5 },
  { name: "Oviedo", comunidad: "asturias", size: "M", cost_of_living: "bajo", climate: "atlantico", nightlife: 6, culture: 7, beach_proximity: "cerca", student_friendly: 7, transport: 5, international: 4 },
  { name: "Santander", comunidad: "cantabria", size: "M", cost_of_living: "medio", climate: "atlantico", nightlife: 5, culture: 6, beach_proximity: "si", student_friendly: 7, transport: 5, international: 5 },
  { name: "Las Palmas de Gran Canaria", comunidad: "canarias", size: "L", cost_of_living: "medio", climate: "subtropical", nightlife: 7, culture: 6, beach_proximity: "si", student_friendly: 6, transport: 5, international: 6 },
  { name: "Santa Cruz de Tenerife", comunidad: "canarias", size: "M", cost_of_living: "medio", climate: "subtropical", nightlife: 6, culture: 6, beach_proximity: "si", student_friendly: 6, transport: 5, international: 5 },
  { name: "Palma de Mallorca", comunidad: "baleares", size: "L", cost_of_living: "alto", climate: "mediterraneo", nightlife: 8, culture: 7, beach_proximity: "si", student_friendly: 6, transport: 6, international: 9 },
  { name: "Lleida", comunidad: "cataluna", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 4, culture: 5, beach_proximity: "no", student_friendly: 7, transport: 4, international: 4 },
  { name: "Girona", comunidad: "cataluna", size: "S", cost_of_living: "medio", climate: "mediterraneo", nightlife: 5, culture: 7, beach_proximity: "cerca", student_friendly: 7, transport: 5, international: 6 },
  { name: "Tarragona", comunidad: "cataluna", size: "S", cost_of_living: "medio", climate: "mediterraneo", nightlife: 5, culture: 6, beach_proximity: "si", student_friendly: 6, transport: 5, international: 5 },
  { name: "Cádiz", comunidad: "andalucia", size: "S", cost_of_living: "bajo", climate: "calido", nightlife: 7, culture: 7, beach_proximity: "si", student_friendly: 7, transport: 4, international: 4 },
  { name: "Jaén", comunidad: "andalucia", size: "S", cost_of_living: "bajo", climate: "calido", nightlife: 4, culture: 5, beach_proximity: "no", student_friendly: 6, transport: 3, international: 3 },
  { name: "Almería", comunidad: "andalucia", size: "S", cost_of_living: "bajo", climate: "calido", nightlife: 5, culture: 5, beach_proximity: "si", student_friendly: 6, transport: 4, international: 4 },
  { name: "Huelva", comunidad: "andalucia", size: "S", cost_of_living: "bajo", climate: "calido", nightlife: 4, culture: 5, beach_proximity: "si", student_friendly: 6, transport: 3, international: 3 },
  { name: "León", comunidad: "castilla_leon", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 5, culture: 6, beach_proximity: "no", student_friendly: 7, transport: 4, international: 4 },
  { name: "Burgos", comunidad: "castilla_leon", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 4, culture: 6, beach_proximity: "no", student_friendly: 6, transport: 4, international: 3 },
  { name: "Castellón", comunidad: "comunidad_valenciana", size: "S", cost_of_living: "bajo", climate: "mediterraneo", nightlife: 4, culture: 5, beach_proximity: "si", student_friendly: 6, transport: 4, international: 4 },
  { name: "Elche", comunidad: "comunidad_valenciana", size: "M", cost_of_living: "bajo", climate: "mediterraneo", nightlife: 5, culture: 5, beach_proximity: "cerca", student_friendly: 6, transport: 5, international: 4 },
  { name: "Vigo", comunidad: "galicia", size: "M", cost_of_living: "bajo", climate: "atlantico", nightlife: 6, culture: 6, beach_proximity: "cerca", student_friendly: 6, transport: 5, international: 4 },
  { name: "Badajoz", comunidad: "extremadura", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 4, culture: 4, beach_proximity: "no", student_friendly: 6, transport: 3, international: 3 },
  { name: "Cáceres", comunidad: "extremadura", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 5, culture: 6, beach_proximity: "no", student_friendly: 7, transport: 3, international: 3 },
  { name: "Logroño", comunidad: "la_rioja", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 5, culture: 6, beach_proximity: "no", student_friendly: 7, transport: 4, international: 3 },
  { name: "Toledo", comunidad: "castilla_la_mancha", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 4, culture: 8, beach_proximity: "no", student_friendly: 5, transport: 5, international: 4 },
  { name: "Albacete", comunidad: "castilla_la_mancha", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 4, culture: 4, beach_proximity: "no", student_friendly: 5, transport: 4, international: 3 },
  { name: "Ciudad Real", comunidad: "castilla_la_mancha", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 3, culture: 4, beach_proximity: "no", student_friendly: 5, transport: 4, international: 3 },
  { name: "Vitoria-Gasteiz", comunidad: "pais_vasco", size: "M", cost_of_living: "medio", climate: "atlantico", nightlife: 5, culture: 6, beach_proximity: "no", student_friendly: 7, transport: 6, international: 5 },
  { name: "Alcalá de Henares", comunidad: "madrid", size: "M", cost_of_living: "medio", climate: "continental", nightlife: 6, culture: 7, beach_proximity: "no", student_friendly: 8, transport: 8, international: 6 },

  // ── Audit add-ons (2026-05): cobertura adicional de ciudades universitarias ──
  { name: "Cartagena", comunidad: "murcia", size: "M", cost_of_living: "bajo", climate: "mediterraneo", nightlife: 5, culture: 6, beach_proximity: "si", student_friendly: 6, transport: 5, international: 4 },
  { name: "Lugo", comunidad: "galicia", size: "S", cost_of_living: "bajo", climate: "atlantico", nightlife: 4, culture: 5, beach_proximity: "no", student_friendly: 6, transport: 3, international: 3 },
  { name: "Ourense", comunidad: "galicia", size: "S", cost_of_living: "bajo", climate: "atlantico", nightlife: 4, culture: 5, beach_proximity: "no", student_friendly: 6, transport: 3, international: 3 },
  { name: "Pontevedra", comunidad: "galicia", size: "S", cost_of_living: "bajo", climate: "atlantico", nightlife: 5, culture: 6, beach_proximity: "cerca", student_friendly: 6, transport: 4, international: 4 },
  { name: "Huesca", comunidad: "aragon", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 4, culture: 5, beach_proximity: "no", student_friendly: 6, transport: 3, international: 3 },
  { name: "Soria", comunidad: "castilla_leon", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 3, culture: 5, beach_proximity: "no", student_friendly: 6, transport: 3, international: 3 },
  { name: "Cuenca", comunidad: "castilla_la_mancha", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 3, culture: 6, beach_proximity: "no", student_friendly: 5, transport: 4, international: 3 },
  { name: "Ávila", comunidad: "castilla_leon", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 3, culture: 7, beach_proximity: "no", student_friendly: 5, transport: 4, international: 3 },
  { name: "Segovia", comunidad: "castilla_leon", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 4, culture: 7, beach_proximity: "no", student_friendly: 6, transport: 5, international: 4 },
  { name: "Mérida", comunidad: "extremadura", size: "S", cost_of_living: "bajo", climate: "continental", nightlife: 3, culture: 6, beach_proximity: "no", student_friendly: 5, transport: 3, international: 3 },
  { name: "Reus", comunidad: "cataluna", size: "S", cost_of_living: "medio", climate: "mediterraneo", nightlife: 4, culture: 5, beach_proximity: "cerca", student_friendly: 6, transport: 4, international: 4 },
];

// ── Size numeric mapping ──
const SIZE_VALUE: Record<string, number> = { S: 2, M: 4, L: 6, XL: 8, XXL: 10 };
const COST_VALUE: Record<string, number> = { bajo: 2, medio: 5, alto: 7, muy_alto: 9 };
const BEACH_VALUE: Record<string, number> = { si: 10, cerca: 6, no: 0 };

/**
 * Match cities to a student profile based on lifestyle preferences.
 */
export function matchCities(profile: StudentProfile, topN = 5): CityMatch[] {
  const results: CityMatch[] = [];

  for (const city of CITY_PROFILES) {
    const { score, reasons } = scoreCityMatch(profile, city);
    results.push({ city, score, reasons });
  }

  // Filter by geographic preference if set
  const filtered = filterByGeography(results, profile);
  filtered.sort((a, b) => b.score - a.score);
  return filtered.slice(0, topN).map(match => ({ ...match, score: Math.max(0, Math.min(99, match.score)) }));
}

function scoreCityMatch(profile: StudentProfile, city: CityProfile): { score: number; reasons: string[] } {
  let total = 0;
  let maxTotal = 0;
  const reasons: string[] = [];

  const tags = profile.tags || {};

  // 1. Urban preference (20%)
  const urbanPref = profile.estilo_vida.urbano;
  const citySize = SIZE_VALUE[city.size] || 5;
  const urbanScore = Math.max(0, 1 - Math.abs(urbanPref - citySize) / 10);
  total += urbanScore * 20;
  maxTotal += 20;
  if (urbanScore > 0.7) reasons.push(urbanPref > 6 ? "Ciudad del tamaño que buscas" : "Ambiente más tranquilo");

  // 2. Social/nightlife (15%)
  const socialPref = profile.estilo_vida.social;
  const nlScore = Math.max(0, 1 - Math.abs(socialPref - city.nightlife) / 10);
  total += nlScore * 15;
  maxTotal += 15;
  if (nlScore > 0.7 && city.nightlife > 7) reasons.push("Gran vida nocturna y social");

  // 3. Cost vs budget (15%)
  const costVal = COST_VALUE[city.cost_of_living] || 5;
  const budgetPref = profile.pragmatico.presupuesto;
  let costScore: number;
  if (budgetPref <= 0) {
    costScore = 0.6; // not answered → neutral
  } else if (budgetPref === 1) {
    costScore = Math.max(0, 1 - costVal / 10); // tight budget → prefer cheap
  } else if (budgetPref === 3) {
    costScore = 0.8; // flexible
  } else {
    costScore = Math.max(0, 1 - costVal / 12);
  }
  total += costScore * 15;
  maxTotal += 15;
  if (costScore > 0.7 && costVal <= 3) reasons.push("Coste de vida asequible");

  // 4. Student-friendly (12%)
  total += (city.student_friendly / 10) * 12;
  maxTotal += 12;
  if (city.student_friendly >= 9) reasons.push("Ciudad muy universitaria");

  // 5. Climate preference from tags (15%)
  const climaCalido = tags.clima_calido || 0;
  const climaFrio = tags.clima_frio || 0;
  let climaScore = 0.5; // neutral default
  if (climaCalido > 0 || climaFrio > 0) {
    const warmClimates = ["calido", "mediterraneo", "subtropical"];
    const coldClimates = ["atlantico", "continental"];
    if (climaCalido > climaFrio) {
      climaScore = warmClimates.includes(city.climate) ? 1.0 : 0.2;
    } else {
      climaScore = coldClimates.includes(city.climate) ? 1.0 : 0.3;
    }
  }
  total += climaScore * 15;
  maxTotal += 15;
  if (climaScore > 0.7 && climaCalido > 0) reasons.push("Clima cálido como prefieres");
  if (climaScore > 0.7 && climaFrio > 0) reasons.push("Clima fresco como prefieres");

  // 6. Beach preference from tags (10%)
  const playaPref = tags.playa_importante || 0;
  const beachVal = BEACH_VALUE[city.beach_proximity] / 10;
  let beachScore: number;
  if (playaPref > 0) {
    beachScore = beachVal; // student wants beach → reward proximity
  } else {
    beachScore = 0.5; // neutral
  }
  total += beachScore * 10;
  maxTotal += 10;
  if (playaPref > 0 && beachVal > 0.7) reasons.push("Cerca de la playa");

  // 7. Culture (8%)
  total += (city.culture / 10) * 8;
  maxTotal += 8;
  if (city.culture >= 9) reasons.push("Rica oferta cultural");

  // 8. Transport / international preference from tags (5%)
  const internPref = tags.ciudad_internacional || 0;
  if (internPref > 0) {
    total += (city.international / 10) * 5;
  } else {
    total += 0.5 * 5; // neutral
  }
  maxTotal += 5;
  if (internPref > 0 && city.international >= 8) reasons.push("Ciudad muy internacional");

  const finalScore = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  return { score: finalScore, reasons: reasons.slice(0, 3) };
}

function filterByGeography(cities: CityMatch[], profile: StudentProfile): CityMatch[] {
  const movilidad = profile.geografico.movilidad;
  const comunidad = profile.geografico.comunidad_actual;

  // movilidad 0 = not answered, 3 = national → no filter
  if (!comunidad || movilidad === 0 || movilidad >= 3) return cities;

  if (movilidad === 1) {
    // Local only — same comunidad
    const local = cities.filter((c) => c.city.comunidad === comunidad);
    return local;
  }

  // movilidad === 2 — boost same comunidad
  return cities.map((c) => ({
    ...c,
    score: c.city.comunidad === comunidad ? c.score + 10 : c.score,
  }));
}
