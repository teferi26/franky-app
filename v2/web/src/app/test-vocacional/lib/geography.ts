import type { CareerProfile, StudentProfile } from '../types';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
const communities: Record<string, string[]> = {
  andalucia: ['Andalucía'], aragon: ['Aragón'], asturias: ['Asturias', 'Principado de Asturias'],
  baleares: ['Baleares', 'Islas Baleares', 'Illes Balears'], canarias: ['Canarias', 'Islas Canarias'], cantabria: ['Cantabria'],
  castilla_leon: ['Castilla y León', 'Castilla León'], castilla_la_mancha: ['Castilla-La Mancha'],
  cataluna: ['Cataluña', 'Catalunya'], comunidad_valenciana: ['Comunidad Valenciana', 'Comunitat Valenciana'],
  extremadura: ['Extremadura'], galicia: ['Galicia'], la_rioja: ['La Rioja'], madrid: ['Madrid', 'Comunidad de Madrid'],
  murcia: ['Murcia', 'Región de Murcia'], navarra: ['Navarra', 'Comunidad Foral de Navarra'], pais_vasco: ['País Vasco', 'Euskadi'],
  ceuta: ['Ceuta'], melilla: ['Melilla'], extranjero: ['Extranjero', 'Vivo fuera de España'],
};
const regionByName = new Map(Object.entries(communities).flatMap(([key, names]) => [key, ...names].map(name => [normalize(name), key])));

export function normalizeCommunity(value: string | null | undefined): string | null {
  return value ? regionByName.get(normalize(value)) ?? null : null;
}

// Exact campus/locality names only. A generic faculty name cannot identify a
// different region; keep the university's region as a documented fallback.
const campusNames: Record<string, string[]> = {
  andalucia: ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'],
  aragon: ['Huesca', 'Teruel', 'Zaragoza'], asturias: ['Oviedo', 'Gijón', 'Mieres'],
  baleares: ['Palma', 'Palma de Mallorca'], canarias: ['Las Palmas', 'Las Palmas de Gran Canaria', 'Tenerife', 'La Laguna', 'Santa Cruz de Tenerife'],
  cantabria: ['Santander', 'Torrelavega'], castilla_leon: ['Ávila', 'Burgos', 'León', 'Palencia', 'Ponferrada', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'],
  castilla_la_mancha: ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo', 'Talavera de la Reina', 'Almadén'],
  cataluna: ['Barcelona', 'Castelldefels', 'Cerdanyola del Vallès', 'Girona', 'Lleida', 'Reus', 'Tarragona', 'Terrassa', 'Vic', 'Manresa', 'Sabadell'],
  comunidad_valenciana: ['Alicante', 'Alacant', 'Alcoy', 'Alcoi', 'Altea', 'Castellón', 'Castelló', 'Elche', 'Elx', 'Gandía', 'Gandia', 'Orihuela', 'Sant Joan d’Alacant', "Sant Joan d'Alacant", 'Valencia', 'València'],
  extremadura: ['Badajoz', 'Cáceres', 'Mérida', 'Plasencia'], galicia: ['A Coruña', 'La Coruña', 'Ferrol', 'Lugo', 'Ourense', 'Pontevedra', 'Santiago de Compostela', 'Vigo'],
  la_rioja: ['Logroño'], madrid: ['Alcalá de Henares', 'Alcorcón', 'Aranjuez', 'Ciempozuelos', 'Fuenlabrada', 'Getafe', 'Leganés', 'Móstoles', 'Pozuelo de Alarcón', 'Vicálvaro', 'Villaviciosa de Odón'],
  murcia: ['Cartagena'], navarra: ['Pamplona', 'Iruña', 'Tudela'], pais_vasco: ['Álava', 'Araba', 'Bilbao', 'Donostia', 'San Sebastián', 'Guipúzcoa', 'Gipuzkoa', 'Vizcaya', 'Bizkaia', 'Vitoria', 'Vitoria-Gasteiz', 'Mondragón', 'Arrasate'],
};
const regionByCampus = new Map(Object.entries(campusNames).flatMap(([key, names]) => names.map(name => [normalize(name), key])));

export function careerCommunity(campus: string | null | undefined, universityCommunity: string | null | undefined): string | null {
  return (campus ? regionByCampus.get(normalize(campus)) ?? normalizeCommunity(campus) : null) ?? normalizeCommunity(universityCommunity);
}

export function isDistanceOffer(modality: string | null | undefined): boolean {
  return modality ? ['online', 'a distancia', 'distancia', 'virtual', 'no presencial'].includes(normalize(modality)) : false;
}

/** Apply the explicit local constraint before choosing a representative offer. */
export function matchesGeography(profile: StudentProfile, career: CareerProfile): boolean {
  if (profile.geografico.movilidad !== 1) return true;
  const home = normalizeCommunity(profile.geografico.comunidad_actual);
  if (!home) return true;
  return isDistanceOffer(career.modality) || normalizeCommunity(career.location_region) === home;
}
