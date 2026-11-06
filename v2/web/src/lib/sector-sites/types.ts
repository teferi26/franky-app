import type { ProVerticalId } from "@/lib/pro/types";

/*
 * Esquema de las webs comerciales de cada sector (<sector>.franky.es).
 *
 * Los campos obligatorios son los de la primera versión y bastan para pintar
 * una página completa. Los campos marcados como opcionales añaden contenido
 * rico: la página solo pinta una sección si su campo está relleno, así los 16
 * sectores funcionan mientras se van completando.
 *
 * Reglas de contenido: solo capacidades que existen hoy en Franky Pro, nada de
 * cifras inventadas, nada de guion largo y nada de textos legales.
 */

/** Un punto con título y explicación breve. */
export type SectorPoint = { title: string; body: string };

/** Una pregunta frecuente. */
export type SectorQuestion = { question: string; answer: string };

/**
 * Iconos disponibles para los módulos (nombres de lucide). Es una lista
 * cerrada para que los datos no importen componentes y el mapa de iconos de
 * `components/sector-sites/sector-icons.ts` compruebe que no falta ninguno.
 */
export const SECTOR_ICON_NAMES = [
  "Armchair",
  "BadgePercent",
  "Bell",
  "BookOpen",
  "Briefcase",
  "Building2",
  "CalendarCheck",
  "CalendarClock",
  "CalendarDays",
  "CalendarRange",
  "Camera",
  "ChartColumn",
  "ClipboardList",
  "Clock",
  "Coffee",
  "Contact",
  "CreditCard",
  "Crown",
  "DoorOpen",
  "Dumbbell",
  "FileCheck2",
  "FileText",
  "Flame",
  "Gift",
  "Globe",
  "GraduationCap",
  "Handshake",
  "HeartHandshake",
  "Home",
  "KeyRound",
  "LayoutGrid",
  "Link2",
  "Lock",
  "MapPin",
  "Megaphone",
  "MessageCircle",
  "Music",
  "Palette",
  "PartyPopper",
  "QrCode",
  "Receipt",
  "ScanLine",
  "Scissors",
  "Settings2",
  "ShieldCheck",
  "Smartphone",
  "Sofa",
  "Sparkles",
  "Stamp",
  "Star",
  "Ticket",
  "Timer",
  "TrendingUp",
  "Trophy",
  "UserCheck",
  "Users",
  "UsersRound",
  "UtensilsCrossed",
  "Wallet",
  "Wine",
  "Zap",
] as const;

export type SectorIconName = (typeof SECTOR_ICON_NAMES)[number];

/** Dónde se usa una capacidad: la web de Franky Pro, la app móvil o ambas. */
export type SectorSurface = "web" | "app";

/** Una cosa concreta que el negocio puede hacer dentro de un módulo. */
export type SectorCapability = {
  /** Frase corta con verbo: "Mueve una cita con un toque". */
  title: string;
  /** Una o dos frases que expliquen el para qué, desde el lado del negocio. */
  body: string;
};

/** Grupo de servicios de Franky Pro (Agenda, Caja, Equipo...). */
export type SectorModule = {
  /** Ancla del módulo (#modulo-agenda). Minúsculas, números y guiones. */
  id: string;
  /** Nombre del módulo tal como aparece en Franky Pro. */
  name: string;
  icon: SectorIconName;
  /** Qué resuelve el módulo, en una frase. */
  summary: string;
  /** Lo que se puede hacer, de lo más útil a lo menos. Entre 3 y 8. */
  capabilities: SectorCapability[];
  /** Dónde está disponible. */
  where: SectorSurface[];
};

/** Un momento de la jornada contado con Franky. */
export type SectorMoment = {
  /** Hora en formato 24 h ("09:30"). */
  time: string;
  title: string;
  body: string;
};

/** Una herramienta que el negocio suele pagar aparte y que Franky incluye. */
export type SectorGainRow = {
  /** Tipo de herramienta, sin marcas: "Agenda y reservas online". */
  category: string;
  /** Precio orientativo tal como se lee: "25 a 60 € al mes". */
  usualPrice: string;
  /**
   * Rango mensual en euros para sumar el total de la tabla. Se omite cuando el
   * coste no es una cuota (comisiones, horas de trabajo...).
   */
  monthly?: { min: number; max: number };
  /** Cómo lo resuelve Franky (se pinta en la columna "En Franky"). */
  inFranky: string;
};

/** Tiempo y dinero: lo que gana el negocio al usar Franky. */
export type SectorGains = {
  title: string;
  intro: string;
  rows: SectorGainRow[];
  /** Cómo se han estimado los precios, en una frase. */
  note: string;
  /** Tiempo que se ahorra, sin cifras que no se puedan medir. */
  time?: SectorPoint[];
};

/** Sección de estudiantes ampliada (la sección oscura de la página). */
export type SectorStudentSection = {
  /** Rótulo en mayúsculas sobre el título. */
  eyebrow?: string;
  /** Qué hace Franky para traer estudiantes al negocio. */
  points: SectorPoint[];
};

/** Qué puede hacer el negocio desde el móvil. */
export type SectorMobileApp = {
  title: string;
  body: string;
  /** Acciones concretas, una frase cada una. */
  actions: string[];
};

/** Prueba real (cifras medidas o testimonio con nombre). Nunca inventada. */
export type SectorProof = {
  title: string;
  items: {
    value: string;
    label: string;
    /** De dónde sale la cifra: evento, fecha, negocio. */
    source: string;
  }[];
};

export type SectorSite = {
  slug: string;
  vertical: ProVerticalId;
  name: string;
  /** Cómo se nombra al negocio en frases ("peluquería"). */
  audienceLabel: string;
  eyebrow: string;
  title: string;
  /** Segunda parte del titular, en violeta. */
  accent: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  /** Lo esencial en tres puntos (también lo usa /pro/empezar). */
  benefits: SectorPoint[];
  /** Cómo se empieza, paso a paso. */
  workflow: SectorPoint[];
  studentTitle: string;
  studentBody: string;
  /** Preguntas frecuentes, sin límite de número. */
  faq: SectorQuestion[];
  keywords: string[];

  /** Tres frases cortas bajo el titular. Si falta, se usan unas genéricas. */
  highlights?: string[];
  /** Todos los módulos de Franky Pro para el sector, con índice y anclas. */
  modules?: SectorModule[];
  /** Un día de trabajo con Franky, de la apertura al cierre. */
  dayWithFranky?: SectorMoment[];
  /** Tabla de herramientas que se pagan aparte y tiempo ahorrado. */
  gains?: SectorGains;
  /** Amplía la sección de estudiantes con lo que Franky hace por el negocio. */
  studentSection?: SectorStudentSection;
  /** Qué se puede hacer desde el móvil. */
  mobileApp?: SectorMobileApp;
  /** Qué incluye el plan, en frases cortas. Si falta, se listan los módulos. */
  planIncludes?: string[];
  /** Cifras reales o testimonios con fuente. Solo si existen. */
  proof?: SectorProof;
};
