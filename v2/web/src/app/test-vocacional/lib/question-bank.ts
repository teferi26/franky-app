/* ═══════════════════════════════════════════════════════════
   Adaptive Question Bank — complete set of ~120 questions
   across 4 stages for the vocational test.
   ═══════════════════════════════════════════════════════════ */

import type { AdaptiveQuestion } from "../types";

const BASE_QUESTIONS: AdaptiveQuestion[] = [
  // ══════════════════════════════════════════════════════
  // STAGE 1 — DISCOVERY (15 questions, show 6-8)
  // ══════════════════════════════════════════════════════
  {
    id: "q1_01", stage: 1, text: "Estás zapeando y un documental te engancha. ¿Cuál de estos?",
    type: "choice", weight: 3, info_gain_estimate: 9,
    options: [
      { text: "Cómo los cirujanos operan a corazón abierto", emoji: "🏥", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.S", delta: 3 },{ dimension: "aversiones.sangre", delta: -3 },{ dimension: "aptitudes.cientifico_tecnica", delta: 1 }] },
      { text: "Los misterios del espacio y la materia oscura", emoji: "🌌", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 2 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "El proceso creativo detrás de una película de Pixar", emoji: "🎬", impacts: [{ dimension: "riasec.A", delta: 4 },{ dimension: "valores.creatividad", delta: 2 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
      { text: "Un caso judicial que cambió la ley de un país", emoji: "⚖️", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "riasec.S", delta: 1 },{ dimension: "aptitudes.verbal_linguistica", delta: 2 },{ dimension: "valores.impacto_social", delta: 2 }] },
      { text: "Cómo se construyó un puente que parecía imposible", emoji: "🏗️", impacts: [{ dimension: "riasec.R", delta: 4 },{ dimension: "riasec.I", delta: 2 },{ dimension: "aptitudes.espacial_visual", delta: 2 },{ dimension: "aptitudes.logico_matematica", delta: 1 }] },
    ],
  },
  {
    id: "q1_02", stage: 1, text: "Si pudieras elegir UN superpoder profesional, ¿cuál sería?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    options: [
      { text: "Ganar el doble que cualquiera en mi campo", emoji: "💰", impacts: [{ dimension: "valores.seguridad_economica", delta: 4 },{ dimension: "ambicion.economica", delta: 3 }] },
      { text: "Que mi trabajo ayude a miles de personas", emoji: "🌍", impacts: [{ dimension: "valores.impacto_social", delta: 4 },{ dimension: "riasec.S", delta: 2 },{ dimension: "ambicion.social", delta: 3 }] },
      { text: "Crear algo que nadie haya hecho antes", emoji: "🎨", impacts: [{ dimension: "valores.creatividad", delta: 4 },{ dimension: "riasec.A", delta: 2 },{ dimension: "valores.autonomia", delta: 2 }] },
      { text: "Que todo el mundo conozca mi nombre en mi sector", emoji: "👔", impacts: [{ dimension: "valores.prestigio", delta: 4 },{ dimension: "riasec.E", delta: 2 },{ dimension: "ambicion.social", delta: 2 }] },
      { text: "Trabajar 4 días a la semana y tener tiempo para mí", emoji: "🏡", impacts: [{ dimension: "valores.conciliacion", delta: 4 },{ dimension: "estilo_vida.ritmo", delta: -2 }] },
    ],
  },
  {
    id: "q1_03", stage: 1, text: "Un sábado sin planes. ¿Qué acabas haciendo?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Desmontando algo para ver cómo funciona por dentro", emoji: "🔧", impacts: [{ dimension: "riasec.R", delta: 4 },{ dimension: "riasec.I", delta: 2 },{ dimension: "aptitudes.logico_matematica", delta: 1 }] },
      { text: "Leyendo sobre un tema random que me ha picado la curiosidad", emoji: "📚", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "aptitudes.verbal_linguistica", delta: 1 },{ dimension: "ambicion.academica", delta: 2 }] },
      { text: "Dibujando, haciendo fotos o creando contenido", emoji: "📸", impacts: [{ dimension: "riasec.A", delta: 4 },{ dimension: "valores.creatividad", delta: 2 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
      { text: "Quedando con amigos o ayudando a alguien", emoji: "🤗", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 2 },{ dimension: "estilo_vida.social", delta: 2 }] },
      { text: "Organizando un plan o un proyecto con gente", emoji: "📋", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "riasec.C", delta: 2 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
    ],
  },
  {
    id: "q1_04", stage: 1, text: "En una fiesta alguien se cae y se hace una herida fea. ¿Qué haces?",
    type: "choice", weight: 2, info_gain_estimate: 8,
    options: [
      { text: "Voy corriendo, le miro la herida y decido si hay que ir a urgencias", emoji: "🩹", impacts: [{ dimension: "riasec.S", delta: 3 },{ dimension: "aversiones.sangre", delta: -4 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "Busco a alguien que sepa de primeros auxilios, yo soy de coordinar", emoji: "📞", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "riasec.C", delta: 2 },{ dimension: "aptitudes.interpersonal", delta: 1 }] },
      { text: "Me acerco a calmarle y distraerle del dolor", emoji: "💬", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 3 },{ dimension: "aversiones.sangre", delta: -1 }] },
      { text: "Prefiero no acercarme, no me va la sangre", emoji: "😬", impacts: [{ dimension: "aversiones.sangre", delta: 5 },{ dimension: "riasec.S", delta: -1 }] },
    ],
  },
  {
    id: "q1_05", stage: 1, text: "Tenéis que hacer un proyecto libre en el instituto. ¿Qué papel coges?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "La investigación: busco datos, papers, estadísticas", emoji: "🔬", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "riasec.C", delta: 2 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "El diseño: la presentación, el poster, lo visual", emoji: "🎨", impacts: [{ dimension: "riasec.A", delta: 4 },{ dimension: "aptitudes.espacial_visual", delta: 3 }] },
      { text: "La parte técnica: montar algo, construir, programar", emoji: "💻", impacts: [{ dimension: "riasec.R", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 2 },{ dimension: "riasec.I", delta: 1 }] },
      { text: "La coordinación: organizo al equipo y hago que nadie se escaquee", emoji: "🗂️", impacts: [{ dimension: "riasec.E", delta: 4 },{ dimension: "riasec.C", delta: 2 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "La exposición oral: yo presento", emoji: "🎤", impacts: [{ dimension: "riasec.E", delta: 2 },{ dimension: "aversiones.hablar_publico", delta: -4 },{ dimension: "aptitudes.verbal_linguistica", delta: 3 }] },
    ],
  },
  {
    id: "q1_06", stage: 1, text: "Sin pensar en dinero ni nota, ¿qué tipo de día de trabajo te molaría?",
    type: "choice", weight: 3, info_gain_estimate: 9,
    options: [
      { text: "En un laboratorio, probando hipótesis y midiendo resultados", emoji: "🧪", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "riasec.R", delta: 2 },{ dimension: "aversiones.trabajar_solo", delta: -2 },{ dimension: "aptitudes.cientifico_tecnica", delta: 3 }] },
      { text: "En un hospital o consulta, atendiendo gente que necesita ayuda", emoji: "🏥", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "aversiones.sangre", delta: -2 },{ dimension: "valores.impacto_social", delta: 3 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "En un estudio creativo, diseñando cosas visualmente", emoji: "🖌️", impacts: [{ dimension: "riasec.A", delta: 4 },{ dimension: "valores.creatividad", delta: 3 },{ dimension: "aptitudes.espacial_visual", delta: 3 }] },
      { text: "En una oficina moderna, liderando un equipo o proyecto", emoji: "🏢", impacts: [{ dimension: "riasec.E", delta: 4 },{ dimension: "riasec.C", delta: 2 },{ dimension: "aptitudes.interpersonal", delta: 2 },{ dimension: "valores.prestigio", delta: 2 }] },
      { text: "Al aire libre o en obra, viendo resultados tangibles de mi trabajo", emoji: "🌿", impacts: [{ dimension: "riasec.R", delta: 4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 2 },{ dimension: "aversiones.rutina", delta: -2 }] },
    ],
  },
  {
    id: "q1_07", stage: 1, text: "Imagina que tienes que elegir una vida profesional. ¿Cuál?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    options: [
      { text: "Años duros de estudio → carrera prestigiosa y buen sueldo de por vida", emoji: "📈", impacts: [{ dimension: "ambicion.academica", delta: 4 },{ dimension: "ambicion.economica", delta: 3 },{ dimension: "valores.prestigio", delta: 2 },{ dimension: "valores.seguridad_economica", delta: 2 }] },
      { text: "Algo que me encante hacer cada día, aunque no pague tanto", emoji: "❤️", impacts: [{ dimension: "valores.creatividad", delta: 2 },{ dimension: "valores.conciliacion", delta: 3 },{ dimension: "valores.autonomia", delta: 2 }] },
      { text: "Un trabajo con impacto real donde sienta que cambio cosas", emoji: "🌎", impacts: [{ dimension: "valores.impacto_social", delta: 4 },{ dimension: "ambicion.social", delta: 3 },{ dimension: "riasec.S", delta: 2 }] },
      { text: "Ser mi propio jefe y no depender de nadie", emoji: "🚀", impacts: [{ dimension: "valores.autonomia", delta: 4 },{ dimension: "riasec.E", delta: 3 },{ dimension: "ambicion.economica", delta: 2 }] },
    ],
  },
  {
    id: "q1_08", stage: 1, text: "Si pudieras resolver UN problema del mundo, ¿cuál sería?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Curar enfermedades que hoy no tienen cura", emoji: "💊", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.S", delta: 2 },{ dimension: "valores.impacto_social", delta: 2 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "Que la justicia funcione de verdad para todos", emoji: "⚖️", impacts: [{ dimension: "riasec.E", delta: 2 },{ dimension: "riasec.S", delta: 2 },{ dimension: "aptitudes.verbal_linguistica", delta: 2 }] },
      { text: "El cambio climático y la contaminación", emoji: "🌱", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.R", delta: 1 },{ dimension: "valores.impacto_social", delta: 3 }] },
      { text: "Que la educación sea accesible y buena para todos", emoji: "📖", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "valores.impacto_social", delta: 3 }] },
      { text: "La pobreza y la desigualdad económica", emoji: "💰", impacts: [{ dimension: "riasec.S", delta: 2 },{ dimension: "riasec.E", delta: 2 },{ dimension: "valores.impacto_social", delta: 3 }] },
    ],
  },
  {
    id: "q1_09", stage: 1, text: "De estas asignaturas, ¿cuáles te resultan más fáciles o te gustan más?",
    subtext: "Elige la que más se acerque", type: "choice", weight: 3, info_gain_estimate: 9,
    options: [
      { text: "Mates / Física", emoji: "📐", impacts: [{ dimension: "aptitudes.logico_matematica", delta: 4 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 },{ dimension: "aversiones.matematicas", delta: -4 }] },
      { text: "Lengua / Historia / Filosofía", emoji: "📜", impacts: [{ dimension: "aptitudes.verbal_linguistica", delta: 4 },{ dimension: "riasec.A", delta: 1 },{ dimension: "riasec.I", delta: 1 }] },
      { text: "Biología / Química", emoji: "🧬", impacts: [{ dimension: "aptitudes.cientifico_tecnica", delta: 4 },{ dimension: "riasec.I", delta: 2 }] },
      { text: "Dibujo / Arte / Música", emoji: "🎭", impacts: [{ dimension: "aptitudes.espacial_visual", delta: 3 },{ dimension: "riasec.A", delta: 3 },{ dimension: "valores.creatividad", delta: 2 }] },
      { text: "Inglés / Idiomas", emoji: "🌐", impacts: [{ dimension: "aptitudes.verbal_linguistica", delta: 3 },{ dimension: "riasec.A", delta: 1 }] },
      { text: "Educación Física / Deporte", emoji: "⚽", impacts: [{ dimension: "aptitudes.corporal_kinestesica", delta: 4 },{ dimension: "riasec.R", delta: 1 }] },
    ],
  },
  {
    id: "q1_10", stage: 1, text: "¿Qué situación laboral te daría más pereza o agobio?",
    type: "choice", weight: 2, info_gain_estimate: 8,
    options: [
      { text: "Estar 8 horas sentado haciendo lo mismo cada día", emoji: "😴", impacts: [{ dimension: "aversiones.rutina", delta: 4 },{ dimension: "valores.creatividad", delta: 2 },{ dimension: "riasec.C", delta: -2 }] },
      { text: "Tener que hablar en público o presentar delante de mucha gente", emoji: "😰", impacts: [{ dimension: "aversiones.hablar_publico", delta: 4 },{ dimension: "riasec.E", delta: -1 }] },
      { text: "Trabajar solo en una oficina sin casi hablar con nadie", emoji: "🏚️", impacts: [{ dimension: "aversiones.trabajar_solo", delta: 4 },{ dimension: "riasec.S", delta: 2 },{ dimension: "estilo_vida.social", delta: 2 }] },
      { text: "Tener que resolver problemas de mates o programación complicados", emoji: "🤯", impacts: [{ dimension: "aversiones.matematicas", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: -2 }] },
      { text: "Aguantar presión y deadlines con mucho estrés", emoji: "⏰", impacts: [{ dimension: "valores.conciliacion", delta: 3 },{ dimension: "ambicion.academica", delta: -2 },{ dimension: "estilo_vida.ritmo", delta: -2 }] },
    ],
  },
  {
    id: "q1_11", stage: 1, text: "¿Qué tipo de vídeo acabas viendo en YouTube hasta las 2 de la mañana?",
    type: "choice", weight: 1, info_gain_estimate: 6,
    options: [
      { text: "True crime, crímenes sin resolver o casos policiales", emoji: "🔍", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.E", delta: 1 },{ dimension: "aptitudes.verbal_linguistica", delta: 1 }] },
      { text: "Ciencia, tecnología o curiosidades del espacio", emoji: "🚀", impacts: [{ dimension: "riasec.I", delta: 3 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "Tutoriales creativos (diseño, arte, edición)", emoji: "🎨", impacts: [{ dimension: "riasec.A", delta: 3 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
      { text: "Emprendedores o cómo montaron sus negocios", emoji: "💼", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "valores.autonomia", delta: 2 },{ dimension: "ambicion.economica", delta: 2 }] },
      { text: "Historias humanas, superación o psicología", emoji: "🧠", impacts: [{ dimension: "riasec.S", delta: 3 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
    ],
  },
  {
    id: "q1_12", stage: 1, text: "Un tío lejano te deja 100.000€ para invertir en tu futuro. ¿Qué harías?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Estudiar en la mejor universidad posible, aunque sea cara", emoji: "🎓", impacts: [{ dimension: "ambicion.academica", delta: 4 },{ dimension: "valores.prestigio", delta: 3 }] },
      { text: "Montar un negocio o una startup", emoji: "🏢", impacts: [{ dimension: "riasec.E", delta: 4 },{ dimension: "valores.autonomia", delta: 3 },{ dimension: "ambicion.economica", delta: 3 }] },
      { text: "Viajar un año para conocer culturas y después decidir", emoji: "✈️", impacts: [{ dimension: "valores.conciliacion", delta: 2 },{ dimension: "valores.creatividad", delta: 2 },{ dimension: "estilo_vida.movilidad", delta: 3 }] },
      { text: "Invertirlo para tener seguridad económica mientras estudio", emoji: "🏦", impacts: [{ dimension: "riasec.C", delta: 3 },{ dimension: "valores.seguridad_economica", delta: 4 }] },
      { text: "Montar un proyecto social o una ONG", emoji: "🤝", impacts: [{ dimension: "valores.impacto_social", delta: 4 },{ dimension: "riasec.S", delta: 3 },{ dimension: "ambicion.social", delta: 3 }] },
    ],
  },
  {
    id: "q1_13", stage: 1, text: "Un amigo te dice que no sabe qué estudiar. ¿Qué le recomiendas?",
    type: "choice", weight: 1, info_gain_estimate: 6,
    options: [
      { text: "Que piense en qué se le da bien, las notas no mienten", emoji: "📊", impacts: [{ dimension: "riasec.C", delta: 2 },{ dimension: "riasec.I", delta: 2 }] },
      { text: "Que siga su pasión, lo que le haga feliz", emoji: "❤️", impacts: [{ dimension: "valores.creatividad", delta: 2 },{ dimension: "valores.conciliacion", delta: 2 },{ dimension: "riasec.A", delta: 1 }] },
      { text: "Que mire qué carreras tienen más salidas y buen sueldo", emoji: "💶", impacts: [{ dimension: "valores.seguridad_economica", delta: 3 },{ dimension: "ambicion.economica", delta: 2 }] },
      { text: "Que piense en qué tipo de impacto quiere tener", emoji: "🌍", impacts: [{ dimension: "valores.impacto_social", delta: 3 },{ dimension: "riasec.S", delta: 2 }] },
    ],
  },
  {
    id: "q1_14", stage: 1, text: "¿Te imaginas en un trabajo donde uses mucho las manos?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Sí, me encanta trabajar haciendo cosas físicas", emoji: "✋", impacts: [{ dimension: "riasec.R", delta: 4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 3 }] },
      { text: "Algo mixto, pero no solo pantalla todo el día", emoji: "⚖️", impacts: [{ dimension: "riasec.R", delta: 2 },{ dimension: "aptitudes.corporal_kinestesica", delta: 1 }] },
      { text: "Prefiero trabajar más con la cabeza", emoji: "🧠", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.R", delta: -1 }] },
      { text: "Ni hablar, quiero un trabajo intelectual", emoji: "💻", impacts: [{ dimension: "riasec.I", delta: 3 },{ dimension: "riasec.R", delta: -2 },{ dimension: "aptitudes.corporal_kinestesica", delta: -2 }] },
    ],
  },
  {
    id: "q1_15", stage: 1, text: "Si tuvieras que crear contenido profesional, ¿cuál sería tu estilo?",
    type: "choice", weight: 1, info_gain_estimate: 5,
    options: [
      { text: "Hilos explicando cosas complicadas de forma fácil", emoji: "🧵", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "aptitudes.verbal_linguistica", delta: 2 },{ dimension: "riasec.S", delta: 1 }] },
      { text: "Vídeos cortos visuales (edición, diseño, arte)", emoji: "🎬", impacts: [{ dimension: "riasec.A", delta: 3 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
      { text: "Consejos sobre dinero, negocios o productividad", emoji: "📈", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "valores.seguridad_economica", delta: 1 }] },
      { text: "Historias inspiradoras de personas reales", emoji: "🎙️", impacts: [{ dimension: "riasec.S", delta: 3 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
    ],
  },

  // ── Stage 1 Extended (10 more discovery questions) ──
  {
    id: "q1_16", stage: 1, text: "¿Te imaginas programando o trabajando con tecnología?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Sí, me flipa programar o cacharrear con tecnología", emoji: "💻", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.R", delta: 2 },{ dimension: "aptitudes.logico_matematica", delta: 2 },{ dimension: "tags.programacion", delta: 3 }] },
      { text: "Me interesa la tecnología pero no programar", emoji: "📱", impacts: [{ dimension: "riasec.R", delta: 2 },{ dimension: "aptitudes.logico_matematica", delta: 1 }] },
      { text: "Me es indiferente", emoji: "🤷", impacts: [] },
      { text: "No, prefiero trabajos alejados de pantallas", emoji: "🌳", impacts: [{ dimension: "riasec.R", delta: 2 },{ dimension: "aptitudes.corporal_kinestesica", delta: 1 }] },
    ],
  },
  {
    id: "q1_17", stage: 1, text: "¿Prefieres trabajar en equipo o por tu cuenta?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "En equipo siempre, rindo mejor con gente", emoji: "👥", impacts: [{ dimension: "riasec.S", delta: 2 },{ dimension: "riasec.E", delta: 2 },{ dimension: "aptitudes.interpersonal", delta: 2 },{ dimension: "aversiones.trabajar_solo", delta: 3 }] },
      { text: "Prefiero individual pero colaboro bien", emoji: "👤", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "aversiones.trabajar_solo", delta: -2 }] },
      { text: "Solo 100%. Trabajo mejor sin distracciones", emoji: "🧘", impacts: [{ dimension: "riasec.I", delta: 3 },{ dimension: "aversiones.trabajar_solo", delta: -4 },{ dimension: "riasec.S", delta: -1 }] },
      { text: "Depende del proyecto, soy flexible", emoji: "🔄", impacts: [{ dimension: "riasec.S", delta: 1 },{ dimension: "riasec.I", delta: 1 }] },
    ],
  },
  {
    id: "q1_18", stage: 1, text: "¿Cuánto te conecta la naturaleza y el medio ambiente?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Muchísimo, podría trabajar al aire libre", emoji: "🌿", impacts: [{ dimension: "riasec.R", delta: 3 },{ dimension: "valores.impacto_social", delta: 2 },{ dimension: "tags.medio_ambiente", delta: 3 }] },
      { text: "Me preocupa el medio ambiente pero no como trabajo", emoji: "♻️", impacts: [{ dimension: "valores.impacto_social", delta: 2 }] },
      { text: "Me gusta para el ocio, no profesionalmente", emoji: "⛰️", impacts: [{ dimension: "riasec.R", delta: 1 }] },
      { text: "Soy más de ciudad y tecnología", emoji: "🏙️", impacts: [{ dimension: "estilo_vida.urbano", delta: 2 },{ dimension: "riasec.I", delta: 1 }] },
    ],
  },
  {
    id: "q1_19", stage: 1, text: "¿Cómo te llevas con el riesgo y la incertidumbre?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Me gusta arriesgar, el caos me motiva", emoji: "🎲", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "valores.autonomia", delta: 2 },{ dimension: "ambicion.economica", delta: 2 }] },
      { text: "Riesgo calculado: arriesgo pero con plan", emoji: "📊", impacts: [{ dimension: "riasec.E", delta: 2 },{ dimension: "riasec.I", delta: 1 }] },
      { text: "Prefiero estabilidad y un camino más seguro", emoji: "🛡️", impacts: [{ dimension: "riasec.C", delta: 2 },{ dimension: "valores.seguridad_economica", delta: 3 }] },
      { text: "No me gusta nada la incertidumbre", emoji: "😰", impacts: [{ dimension: "riasec.C", delta: 3 },{ dimension: "valores.seguridad_economica", delta: 4 },{ dimension: "riasec.E", delta: -2 }] },
    ],
  },
  {
    id: "q1_20", stage: 1, text: "¿Eres de fijarte en los detalles o de ver el panorama general?",
    type: "choice", weight: 1, info_gain_estimate: 5,
    options: [
      { text: "Los detalles: reviso todo 3 veces", emoji: "🔎", impacts: [{ dimension: "riasec.C", delta: 3 },{ dimension: "aptitudes.logico_matematica", delta: 1 }] },
      { text: "El panorama general: primero la estrategia", emoji: "🗺️", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "riasec.I", delta: 1 }] },
      { text: "Depende de la situación", emoji: "⚖️", impacts: [{ dimension: "riasec.C", delta: 1 },{ dimension: "riasec.E", delta: 1 }] },
    ],
  },
  {
    id: "q1_21", stage: 1, text: "¿Cuánto importa la actividad física en tu vida?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Es central, hago deporte casi a diario", emoji: "💪", impacts: [{ dimension: "aptitudes.corporal_kinestesica", delta: 4 },{ dimension: "tags.deporte", delta: 3 },{ dimension: "riasec.R", delta: 2 }] },
      { text: "Me gusta mantenerme activo pero no es lo mío profesionalmente", emoji: "🚶", impacts: [{ dimension: "aptitudes.corporal_kinestesica", delta: 2 }] },
      { text: "Paso bastante del deporte", emoji: "🛋️", impacts: [{ dimension: "aptitudes.corporal_kinestesica", delta: -1 },{ dimension: "riasec.I", delta: 1 }] },
    ],
  },
  {
    id: "q1_22", stage: 1, text: "¿Te ves trabajando o estudiando en el extranjero algún día?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Sí, seguro. Quiero una carrera internacional", emoji: "🌍", impacts: [{ dimension: "estilo_vida.movilidad", delta: 3 },{ dimension: "tags.ciudad_internacional", delta: 3 },{ dimension: "ambicion.academica", delta: 1 }] },
      { text: "Quizás, un Erasmus o algo temporal", emoji: "✈️", impacts: [{ dimension: "estilo_vida.movilidad", delta: 2 },{ dimension: "tags.ciudad_internacional", delta: 1 }] },
      { text: "Prefiero quedarme en España", emoji: "🇪🇸", impacts: [{ dimension: "estilo_vida.movilidad", delta: -1 }] },
      { text: "Ni loco, no me muevo de mi zona", emoji: "🏠", impacts: [{ dimension: "estilo_vida.movilidad", delta: -2 }] },
    ],
  },
  {
    id: "q1_23", stage: 1, text: "¿Te consideras una persona paciente?",
    type: "choice", weight: 1, info_gain_estimate: 5,
    options: [
      { text: "Sí, no me importa esperar y trabajar a largo plazo", emoji: "🐢", impacts: [{ dimension: "ambicion.academica", delta: 2 },{ dimension: "riasec.I", delta: 2 },{ dimension: "valores.seguridad_economica", delta: 1 }] },
      { text: "Término medio, depende del tema", emoji: "⏳", impacts: [{ dimension: "ambicion.academica", delta: 1 }] },
      { text: "No mucho, quiero resultados rápidos", emoji: "⚡", impacts: [{ dimension: "riasec.E", delta: 2 },{ dimension: "valores.autonomia", delta: 2 },{ dimension: "ambicion.academica", delta: -1 }] },
    ],
  },
  {
    id: "q1_24", stage: 1, text: "¿Qué te motiva más a la hora de elegir una carrera?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Que me apasione el tema, aunque sea difícil", emoji: "🔥", impacts: [{ dimension: "valores.creatividad", delta: 2 },{ dimension: "valores.autonomia", delta: 2 }] },
      { text: "Que tenga buenas salidas laborales y sueldo", emoji: "💼", impacts: [{ dimension: "valores.seguridad_economica", delta: 3 },{ dimension: "ambicion.economica", delta: 2 }] },
      { text: "Que sea útil para la sociedad", emoji: "🤝", impacts: [{ dimension: "valores.impacto_social", delta: 3 },{ dimension: "ambicion.social", delta: 2 }] },
      { text: "Que no sea demasiado difícil ni estresante", emoji: "😌", impacts: [{ dimension: "valores.conciliacion", delta: 3 },{ dimension: "estilo_vida.ritmo", delta: -2 }] },
    ],
  },
  {
    id: "q1_25", stage: 1, text: "¿Cómo reaccionas cuando tienes que hablar delante de mucha gente?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Me encanta, disfruto el escenario", emoji: "🎤", impacts: [{ dimension: "aversiones.hablar_publico", delta: -4 },{ dimension: "aptitudes.verbal_linguistica", delta: 2 },{ dimension: "riasec.E", delta: 2 }] },
      { text: "No me importa, lo hago sin problema", emoji: "👍", impacts: [{ dimension: "aversiones.hablar_publico", delta: -2 }] },
      { text: "Me pone algo nervioso pero lo hago", emoji: "😬", impacts: [{ dimension: "aversiones.hablar_publico", delta: 2 }] },
      { text: "Lo evito como sea, me da mucha ansiedad", emoji: "😰", impacts: [{ dimension: "aversiones.hablar_publico", delta: 5 },{ dimension: "riasec.E", delta: -2 }] },
    ],
  },

  // ── Stage 1 ANCHOR DIRECTAS (preguntas claras de motivación, prioritarias) ──
  {
    id: "q1_anchor_motivation", stage: 1, text: "Lo más importante para ti en una carrera es…",
    subtext: "Elige solo una: la que más pesa.",
    type: "choice", weight: 3, info_gain_estimate: 10,
    options: [
      { text: "💰 Ganar dinero. Quiero estabilidad económica y un buen sueldo.", impacts: [{ dimension: "valores.seguridad_economica", delta: 4 },{ dimension: "ambicion.economica", delta: 4 }] },
      { text: "🚀 Ser mi propio jefe. Autonomía y libertad para decidir.", impacts: [{ dimension: "valores.autonomia", delta: 4 },{ dimension: "riasec.E", delta: 3 },{ dimension: "ambicion.economica", delta: 2 }] },
      { text: "❤️ Que me apasione el día a día, aunque pague menos.", impacts: [{ dimension: "valores.creatividad", delta: 3 },{ dimension: "valores.conciliacion", delta: 2 },{ dimension: "valores.autonomia", delta: 1 }] },
      { text: "🌍 Tener impacto: ayudar a personas o cambiar algo.", impacts: [{ dimension: "valores.impacto_social", delta: 4 },{ dimension: "riasec.S", delta: 2 },{ dimension: "ambicion.social", delta: 3 }] },
      { text: "🏆 Prestigio. Que mi profesión sea reconocida y respetada.", impacts: [{ dimension: "valores.prestigio", delta: 4 },{ dimension: "ambicion.academica", delta: 2 },{ dimension: "ambicion.social", delta: 2 }] },
    ],
  },
  {
    id: "q1_anchor_boss", stage: 1, text: "¿Te ves más como tu propio jefe o como empleado?",
    type: "choice", weight: 3, info_gain_estimate: 9,
    options: [
      { text: "Mi propio jefe sí o sí. Quiero montar mi negocio o ser autónomo.", emoji: "👔", impacts: [{ dimension: "riasec.E", delta: 4 },{ dimension: "valores.autonomia", delta: 4 },{ dimension: "ambicion.economica", delta: 3 }] },
      { text: "Empleado en una empresa potente con buen sueldo y crecimiento.", emoji: "🏢", impacts: [{ dimension: "riasec.C", delta: 2 },{ dimension: "riasec.E", delta: 1 },{ dimension: "valores.seguridad_economica", delta: 3 }] },
      { text: "Empleado en algo público o estable: prefiero reducir la incertidumbre.", emoji: "🛡️", impacts: [{ dimension: "riasec.C", delta: 4 },{ dimension: "valores.seguridad_economica", delta: 4 },{ dimension: "valores.conciliacion", delta: 2 }] },
      { text: "Liberal/freelance: dependiendo de mí pero sin equipo a cargo.", emoji: "💼", impacts: [{ dimension: "valores.autonomia", delta: 4 },{ dimension: "riasec.I", delta: 1 },{ dimension: "riasec.A", delta: 1 }] },
      { text: "Aún no lo tengo claro.", emoji: "🤷", impacts: [] },
    ],
  },
  {
    id: "q1_anchor_work_with", stage: 1, text: "¿Con qué prefieres trabajar?",
    subtext: "Elige lo que más te llama.",
    type: "choice", weight: 3, info_gain_estimate: 10,
    options: [
      { text: "Personas: enseñar, atender, vender, ayudar.", emoji: "👥", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "riasec.E", delta: 1 },{ dimension: "aptitudes.interpersonal", delta: 3 }] },
      { text: "Datos y números: analizar, estructurar, optimizar.", emoji: "📊", impacts: [{ dimension: "riasec.I", delta: 3 },{ dimension: "riasec.C", delta: 3 },{ dimension: "aptitudes.logico_matematica", delta: 3 }] },
      { text: "Ideas y conocimiento: investigar, escribir, pensar.", emoji: "💡", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "aptitudes.verbal_linguistica", delta: 2 }] },
      { text: "Cosas físicas: máquinas, herramientas, construir.", emoji: "🔧", impacts: [{ dimension: "riasec.R", delta: 4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 2 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
      { text: "Arte y expresión: crear, diseñar, comunicar visualmente.", emoji: "🎨", impacts: [{ dimension: "riasec.A", delta: 4 },{ dimension: "valores.creatividad", delta: 3 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
    ],
  },
  {
    id: "q1_anchor_role", stage: 1, text: "En un equipo, ¿qué papel encaja más contigo?",
    type: "choice", weight: 3, info_gain_estimate: 9,
    options: [
      { text: "El que lidera, organiza y reparte tareas.", emoji: "👑", impacts: [{ dimension: "riasec.E", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 2 },{ dimension: "ambicion.social", delta: 2 }] },
      { text: "El experto técnico al que le preguntan cuando hay dudas.", emoji: "🎯", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "El meticuloso que se asegura de que nada falle.", emoji: "📋", impacts: [{ dimension: "riasec.C", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 1 }] },
      { text: "El creativo de las ideas locas que hace que destaquemos.", emoji: "🎨", impacts: [{ dimension: "riasec.A", delta: 4 },{ dimension: "valores.creatividad", delta: 3 }] },
      { text: "El que mantiene buen rollo y motivación.", emoji: "💗", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 3 }] },
      { text: "Prefiero trabajar solo, no soy de equipos.", emoji: "🧘", impacts: [{ dimension: "aversiones.trabajar_solo", delta: -4 },{ dimension: "riasec.I", delta: 2 }] },
    ],
  },
  {
    id: "q1_anchor_money_vs_passion", stage: 1, text: "Si te ofrecen un trabajo que te encanta pero paga la mitad, ¿lo eliges?",
    type: "choice", weight: 2, info_gain_estimate: 8,
    options: [
      { text: "Sí sin pensarlo, prefiero ser feliz con lo que hago.", emoji: "❤️", impacts: [{ dimension: "valores.conciliacion", delta: 3 },{ dimension: "valores.autonomia", delta: 2 },{ dimension: "ambicion.economica", delta: -2 }] },
      { text: "Lo pensaría: depende de cuánto baja y de mi situación.", emoji: "🤔", impacts: [{ dimension: "valores.seguridad_economica", delta: 1 },{ dimension: "valores.conciliacion", delta: 1 }] },
      { text: "No: el dinero importa, no quiero un trabajo mal pagado.", emoji: "💸", impacts: [{ dimension: "valores.seguridad_economica", delta: 4 },{ dimension: "ambicion.economica", delta: 4 }] },
    ],
  },
  {
    id: "q1_anchor_risk", stage: 1, text: "Tu carrera tiene un futuro brillante pero requiere 6 años de estudio. ¿Te lanzas?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Sí, me sobra paciencia para algo que merezca la pena.", emoji: "🎯", impacts: [{ dimension: "ambicion.academica", delta: 4 },{ dimension: "valores.prestigio", delta: 2 }] },
      { text: "Sí pero solo si veo claro que me va a compensar.", emoji: "📈", impacts: [{ dimension: "ambicion.academica", delta: 2 },{ dimension: "valores.seguridad_economica", delta: 2 }] },
      { text: "No, prefiero algo de 4 años para empezar a trabajar antes.", emoji: "⏱️", impacts: [{ dimension: "ambicion.academica", delta: -2 },{ dimension: "valores.conciliacion", delta: 2 }] },
    ],
  },
  {
    id: "q1_anchor_create_vs_apply", stage: 1, text: "¿Te tira más crear cosas nuevas o aplicar lo que ya existe?",
    type: "choice", weight: 2, info_gain_estimate: 8,
    options: [
      { text: "Crear: investigar, descubrir, inventar.", emoji: "🔬", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "valores.creatividad", delta: 2 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "Diseñar: crear pero con un sentido estético/utilidad.", emoji: "🎨", impacts: [{ dimension: "riasec.A", delta: 3 },{ dimension: "valores.creatividad", delta: 3 }] },
      { text: "Construir: aplicar conocimiento técnico a problemas reales.", emoji: "🏗️", impacts: [{ dimension: "riasec.R", delta: 3 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "Gestionar: organizar lo que hace una empresa o equipo.", emoji: "📊", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "riasec.C", delta: 2 }] },
      { text: "Servir: aplicar lo que sé directamente a personas que lo necesitan.", emoji: "🤝", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "valores.impacto_social", delta: 2 }] },
    ],
  },
  {
    id: "q1_anchor_environment", stage: 1, text: "Donde mejor rindes es…",
    type: "choice", weight: 2, info_gain_estimate: 7,
    options: [
      { text: "Una oficina con horario claro y procesos definidos.", emoji: "🏢", impacts: [{ dimension: "riasec.C", delta: 3 },{ dimension: "valores.seguridad_economica", delta: 2 }] },
      { text: "Un entorno dinámico con presión y cambios constantes.", emoji: "⚡", impacts: [{ dimension: "riasec.E", delta: 3 },{ dimension: "estilo_vida.ritmo", delta: 3 }] },
      { text: "En un sitio tranquilo donde pueda concentrarme solo/a.", emoji: "📚", impacts: [{ dimension: "riasec.I", delta: 3 },{ dimension: "aversiones.trabajar_solo", delta: -3 }] },
      { text: "Al aire libre o en sitios variados, no en una mesa.", emoji: "🌿", impacts: [{ dimension: "riasec.R", delta: 3 },{ dimension: "aversiones.rutina", delta: 3 }] },
      { text: "Un estudio o lugar creativo, sin imposiciones.", emoji: "🎭", impacts: [{ dimension: "riasec.A", delta: 3 },{ dimension: "valores.autonomia", delta: 2 },{ dimension: "valores.creatividad", delta: 2 }] },
    ],
  },

  // ══════════════════════════════════════════════════════
  // STAGE 5 — RAMA + DOBLE GRADO (always shown right after Stage 1)
  // ══════════════════════════════════════════════════════
  {
    id: "q5_rama", stage: 5, text: "Si tuvieras que elegir AHORA una rama del conocimiento, ¿cuál?",
    subtext: "La que más te llama, aunque después decidas la carrera dentro.",
    type: "choice", weight: 3, info_gain_estimate: 10,
    options: [
      { text: "🩺 Ciencias de la Salud (medicina, enfermería, fisio, psicología, farmacia…)",
        impacts: [
          { dimension: "tags.rama_ciencias_salud", delta: 5 },
          { dimension: "riasec.S", delta: 3 }, { dimension: "riasec.I", delta: 1 },
          { dimension: "aptitudes.cientifico_tecnica", delta: 2 },
        ] },
      { text: "🔧 Ingeniería y Arquitectura (informática, industrial, civil, telecos, arquitectura…)",
        impacts: [
          { dimension: "tags.rama_ingenieria_arquitectura", delta: 5 },
          { dimension: "riasec.R", delta: 3 }, { dimension: "riasec.I", delta: 2 },
          { dimension: "aptitudes.logico_matematica", delta: 3 },
        ] },
      { text: "🔬 Ciencias puras (matemáticas, física, química, biología, geología…)",
        impacts: [
          { dimension: "tags.rama_ciencias", delta: 5 },
          { dimension: "riasec.I", delta: 4 },
          { dimension: "aptitudes.cientifico_tecnica", delta: 3 }, { dimension: "aptitudes.logico_matematica", delta: 2 },
        ] },
      { text: "⚖️ Ciencias Sociales y Jurídicas (derecho, ADE, economía, RRHH, periodismo, criminología…)",
        impacts: [
          { dimension: "tags.rama_ciencias_sociales_juridicas", delta: 5 },
          { dimension: "riasec.E", delta: 3 }, { dimension: "riasec.S", delta: 1 }, { dimension: "riasec.C", delta: 2 },
          { dimension: "aptitudes.verbal_linguistica", delta: 2 },
        ] },
      { text: "🎨 Artes y Humanidades (bellas artes, diseño, audiovisual, filología, historia, filosofía…)",
        impacts: [
          { dimension: "tags.rama_artes_humanidades", delta: 5 },
          { dimension: "riasec.A", delta: 4 },
          { dimension: "valores.creatividad", delta: 3 }, { dimension: "aptitudes.verbal_linguistica", delta: 2 },
        ] },
    ],
  },
  {
    id: "q5_rama_secondary", stage: 5, text: "¿Hay otra rama que también te tire?",
    subtext: "La segunda en tu corazón. Esto nos ayuda a recomendarte dobles grados cruzados.",
    type: "choice", weight: 2, info_gain_estimate: 8,
    options: [
      { text: "🩺 Salud", impacts: [{ dimension: "tags.rama_ciencias_salud", delta: 2 },{ dimension: "riasec.S", delta: 1 }] },
      { text: "🔧 Ingeniería / Arquitectura", impacts: [{ dimension: "tags.rama_ingenieria_arquitectura", delta: 2 },{ dimension: "riasec.R", delta: 1 }] },
      { text: "🔬 Ciencias puras", impacts: [{ dimension: "tags.rama_ciencias", delta: 2 },{ dimension: "riasec.I", delta: 1 }] },
      { text: "⚖️ Sociales / Jurídicas", impacts: [{ dimension: "tags.rama_ciencias_sociales_juridicas", delta: 2 },{ dimension: "riasec.E", delta: 1 }] },
      { text: "🎨 Artes / Humanidades", impacts: [{ dimension: "tags.rama_artes_humanidades", delta: 2 },{ dimension: "riasec.A", delta: 1 }] },
      { text: "Solo me tira una rama, no necesito segunda.", emoji: "🎯", impacts: [{ dimension: "tags.rama_unica", delta: 1 }] },
    ],
  },
  {
    id: "q5_doble_grado", stage: 5, text: "¿Te imaginas haciendo un DOBLE GRADO?",
    subtext: "Combina dos titulaciones. La duración y la carga dependen del plan de estudios: revisa ambas antes de decidir.",
    type: "choice", weight: 3, info_gain_estimate: 10,
    options: [
      { text: "Sí, definitivo. Quiero un doble grado. Me motivan los retos.", emoji: "🚀", impacts: [{ dimension: "tags.doble_grado", delta: 4 },{ dimension: "ambicion.academica", delta: 3 }] },
      { text: "Lo consideraría si encajan dos cosas que me gustan.", emoji: "🤔", impacts: [{ dimension: "tags.doble_grado", delta: 2 },{ dimension: "ambicion.academica", delta: 1 }] },
      { text: "Prefiero un grado simple bien elegido y especializarme luego.", emoji: "🎓", impacts: [{ dimension: "tags.grado_simple", delta: 3 }] },
      { text: "No me importa, lo que diga el resultado del test.", emoji: "🤷", impacts: [{ dimension: "tags.doble_grado_neutral", delta: 1 }] },
    ],
  },
  {
    id: "q5_combo_engineering", stage: 5, text: "Como te gusta INGENIERÍA, ¿qué combinación te suena más?",
    subtext: "Algunas combinaciones existen como doble grado. Marca la que más te tire (o ninguna).",
    type: "choice", weight: 2, info_gain_estimate: 8,
    conditions: [
      { dimension: "tags.rama_ingenieria_arquitectura", operator: "gt", value: 0 },
      { dimension: "tags.doble_grado", operator: "gt", value: 1 },
    ],
    options: [
      { text: "💻 Informática + ADE (programar + emprender)", impacts: [{ dimension: "tags.informatica", delta: 4 },{ dimension: "tags.ade", delta: 4 },{ dimension: "tags.empresa", delta: 2 },{ dimension: "tags.programacion", delta: 3 }] },
      { text: "📡 Telecomunicaciones + Empresariales", impacts: [{ dimension: "tags.telecomunicaciones", delta: 4 },{ dimension: "tags.ade", delta: 3 },{ dimension: "tags.empresa", delta: 2 }] },
      { text: "🧮 Matemáticas + Informática (hard tech)", impacts: [{ dimension: "tags.matematicas", delta: 4 },{ dimension: "tags.informatica", delta: 4 },{ dimension: "tags.programacion", delta: 3 }] },
      { text: "🏗️ Civil + Arquitectura", impacts: [{ dimension: "tags.civil", delta: 4 },{ dimension: "tags.arquitectura", delta: 4 }] },
      { text: "⚙️ Industrial + Mecánica / Electrónica", impacts: [{ dimension: "tags.industrial", delta: 4 },{ dimension: "tags.mecanica", delta: 3 },{ dimension: "tags.electronica", delta: 2 }] },
      { text: "🧬 Biotech + Ingeniería Química", impacts: [{ dimension: "tags.biotecnologia", delta: 4 },{ dimension: "tags.quimica", delta: 4 }] },
      { text: "Ninguna en concreto, sigamos.", emoji: "🤷", impacts: [] },
    ],
  },
  {
    id: "q5_combo_health", stage: 5, text: "Como te gusta SALUD, ¿qué combinación te suena más?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    conditions: [
      { dimension: "tags.rama_ciencias_salud", operator: "gt", value: 0 },
      { dimension: "tags.doble_grado", operator: "gt", value: 1 },
    ],
    options: [
      { text: "🩺 Medicina (uno solo, ya es exigente)", impacts: [{ dimension: "tags.medicina", delta: 4 },{ dimension: "tags.grado_simple", delta: 1 }] },
      { text: "🧪 Biotecnología + Bioquímica / Farmacia", impacts: [{ dimension: "tags.biotecnologia", delta: 4 },{ dimension: "tags.farmacia", delta: 3 }] },
      { text: "🦷 Odontología + Estética / cirugía", impacts: [{ dimension: "tags.odontologia", delta: 4 }] },
      { text: "👁️ Óptica + Optometría", impacts: [{ dimension: "tags.optica", delta: 4 },{ dimension: "tags.optometria", delta: 3 }] },
      { text: "💪 Fisioterapia + Ciencias del Deporte", impacts: [{ dimension: "tags.fisioterapia", delta: 4 },{ dimension: "tags.deporte", delta: 4 }] },
      { text: "🧠 Psicología + Criminología", impacts: [{ dimension: "tags.psicologia", delta: 4 },{ dimension: "tags.criminologia", delta: 3 }] },
      { text: "Ninguna en concreto, sigamos.", emoji: "🤷", impacts: [] },
    ],
  },
  {
    id: "q5_combo_social", stage: 5, text: "Como te gusta SOCIALES/JURÍDICAS, ¿qué combinación te suena más?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    conditions: [
      { dimension: "tags.rama_ciencias_sociales_juridicas", operator: "gt", value: 0 },
      { dimension: "tags.doble_grado", operator: "gt", value: 1 },
    ],
    options: [
      { text: "⚖️ Derecho + ADE (el clásico imbatible)", impacts: [{ dimension: "tags.derecho", delta: 4 },{ dimension: "tags.ade", delta: 4 },{ dimension: "tags.empresa", delta: 2 }] },
      { text: "🌐 Derecho + Relaciones Internacionales", impacts: [{ dimension: "tags.derecho", delta: 4 },{ dimension: "tags.relaciones_internacionales", delta: 4 }] },
      { text: "📊 ADE + Finanzas / Economía", impacts: [{ dimension: "tags.ade", delta: 4 },{ dimension: "tags.finanzas", delta: 4 },{ dimension: "tags.economia", delta: 3 }] },
      { text: "📣 Periodismo + Comunicación Audiovisual", impacts: [{ dimension: "tags.periodismo", delta: 4 },{ dimension: "tags.audiovisual", delta: 3 },{ dimension: "tags.comunicacion", delta: 3 }] },
      { text: "🔍 Criminología + Psicología", impacts: [{ dimension: "tags.criminologia", delta: 4 },{ dimension: "tags.psicologia", delta: 4 }] },
      { text: "🤝 RRHH + Trabajo Social", impacts: [{ dimension: "tags.rrhh", delta: 4 },{ dimension: "tags.trabajo_social", delta: 3 }] },
      { text: "Ninguna en concreto, sigamos.", emoji: "🤷", impacts: [] },
    ],
  },

  // ══════════════════════════════════════════════════════
  // STAGE 2 — REFINEMENT (cluster-specific questions)
  // ══════════════════════════════════════════════════════

  // ── Health Cluster ──
  {
    id: "q2_s01", stage: 2, text: "En una serie médica, ¿qué papel te gustaría hacer?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 4 }],
    options: [
      { text: "El investigador que descubre la cura en el lab", emoji: "🔬", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "tags.investigacion_biomedica", delta: 1 }] },
      { text: "El médico que diagnostica el caso que nadie puede", emoji: "🩺", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.S", delta: 2 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "El cirujano que opera bajo presión", emoji: "🔪", impacts: [{ dimension: "riasec.R", delta: 3 },{ dimension: "aversiones.sangre", delta: -4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 3 }] },
      { text: "El psicólogo que ayuda al paciente con su trauma", emoji: "🧠", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 3 }] },
      { text: "El farmacéutico que diseña el tratamiento perfecto", emoji: "💊", impacts: [{ dimension: "riasec.C", delta: 2 },{ dimension: "riasec.I", delta: 2 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
    ],
  },
  {
    id: "q2_s02", stage: 2, text: "¿Pacientes o laboratorio?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 3 }],
    options: [
      { text: "Pacientes: quiero ayudar directamente a personas", emoji: "👨‍⚕️", impacts: [{ dimension: "riasec.S", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 3 },{ dimension: "aversiones.trabajar_solo", delta: -2 }] },
      { text: "Laboratorio: quiero descubrir cosas que ayuden a millones", emoji: "🧫", impacts: [{ dimension: "riasec.I", delta: 4 },{ dimension: "aversiones.trabajar_solo", delta: -3 },{ dimension: "ambicion.social", delta: 2 }] },
      { text: "Algo mixto: docencia o investigación clínica", emoji: "🔄", impacts: [{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.S", delta: 2 }] },
    ],
  },
  {
    id: "q2_s03", stage: 2, text: "¿Con animales o con personas?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 3 }],
    options: [
      { text: "Me mola más la idea de trabajar con animales", emoji: "🐾", impacts: [{ dimension: "tags.veterinaria", delta: 4 },{ dimension: "riasec.R", delta: 2 }] },
      { text: "Prefiero personas, los animales no son lo mío", emoji: "👥", impacts: [{ dimension: "riasec.S", delta: 2 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "Ambos, pero si tuviera que elegir, personas", emoji: "🤷", impacts: [{ dimension: "riasec.S", delta: 1 },{ dimension: "aptitudes.interpersonal", delta: 1 }] },
    ],
  },
  {
    id: "q2_s04", stage: 2, text: "¿Cómo te llevas con el cuerpo humano?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 3 }],
    options: [
      { text: "Me fascina, podría estar horas aprendiendo del cuerpo", emoji: "🫀", impacts: [{ dimension: "aptitudes.cientifico_tecnica", delta: 3 },{ dimension: "aversiones.sangre", delta: -3 }] },
      { text: "Me parece interesante pero no es mi obsesión", emoji: "🤔", impacts: [{ dimension: "aptitudes.cientifico_tecnica", delta: 1 }] },
      { text: "Me da un poco de repelús ver órganos", emoji: "😅", impacts: [{ dimension: "aversiones.sangre", delta: 3 }] },
    ],
  },

  // ── Engineering / Tech Cluster ──
  {
    id: "q2_t01", stage: 2, text: "¿Construir en el mundo real o en el mundo digital?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.R", operator: "gt", value: 3 }],
    options: [
      { text: "Físico: que lo pueda tocar y ver en el mundo real", emoji: "🏗️", impacts: [{ dimension: "riasec.R", delta: 4 },{ dimension: "aptitudes.espacial_visual", delta: 2 },{ dimension: "aptitudes.corporal_kinestesica", delta: 2 }] },
      { text: "Digital: una app, un algoritmo, un sistema", emoji: "💻", impacts: [{ dimension: "riasec.I", delta: 3 },{ dimension: "aptitudes.logico_matematica", delta: 3 }] },
      { text: "Lo que sea, mientras resuelva un problema real", emoji: "⚡", impacts: [{ dimension: "riasec.R", delta: 2 },{ dimension: "riasec.I", delta: 2 }] },
    ],
  },
  {
    id: "q2_t02", stage: 2, text: "¿Qué tipo de ingeniería te atrae más?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.R", operator: "gt", value: 3 }],
    options: [
      { text: "Diseñar un puente que soporte terremotos", emoji: "🌉", impacts: [{ dimension: "tags.construccion", delta: 3 },{ dimension: "aptitudes.espacial_visual", delta: 3 }] },
      { text: "Programar una IA que conduzca un coche", emoji: "🤖", impacts: [{ dimension: "tags.programacion", delta: 3 },{ dimension: "aptitudes.logico_matematica", delta: 3 }] },
      { text: "Crear un dron autónomo que vuele solo", emoji: "🛸", impacts: [{ dimension: "tags.robotica", delta: 3 },{ dimension: "aptitudes.logico_matematica", delta: 2 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
      { text: "Diseñar el producto más ergonómico y bonito del mercado", emoji: "📱", impacts: [{ dimension: "tags.diseño_industrial", delta: 3 },{ dimension: "riasec.A", delta: 2 },{ dimension: "aptitudes.espacial_visual", delta: 3 }] },
      { text: "Optimizar la energía de una central para que sea renovable", emoji: "♻️", impacts: [{ dimension: "tags.energia", delta: 3 },{ dimension: "valores.impacto_social", delta: 2 }] },
    ],
  },
  {
    id: "q2_t03", stage: 2, text: "Las mates en la carrera... ¿cómo lo ves?",
    type: "choice", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.R", operator: "gt", value: 2 }],
    options: [
      { text: "Se me dan bien de verdad, disfruto resolviéndolas", emoji: "🧮", impacts: [{ dimension: "aptitudes.logico_matematica", delta: 4 },{ dimension: "aversiones.matematicas", delta: -4 }] },
      { text: "Me defiendo, apruebo pero no disfruto", emoji: "📝", impacts: [{ dimension: "aptitudes.logico_matematica", delta: 1 },{ dimension: "aversiones.matematicas", delta: 1 }] },
      { text: "Me cuestan bastante y no es lo mío", emoji: "😓", impacts: [{ dimension: "aptitudes.logico_matematica", delta: -2 },{ dimension: "aversiones.matematicas", delta: 4 }] },
    ],
  },

  // ── Social / Education Cluster ──
  {
    id: "q2_e01", stage: 2, text: "¿Cómo te gustaría ayudar a los demás?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 4 }],
    options: [
      { text: "Enseñándoles cosas nuevas y viéndoles crecer", emoji: "📚", impacts: [{ dimension: "tags.ensenanza", delta: 4 },{ dimension: "riasec.S", delta: 2 }] },
      { text: "Escuchándoles y ayudándoles con sus problemas emocionales", emoji: "🧠", impacts: [{ dimension: "tags.terapia", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 3 }] },
      { text: "Defendiendo sus derechos ante la ley o el sistema", emoji: "⚖️", impacts: [{ dimension: "tags.justicia", delta: 4 },{ dimension: "riasec.E", delta: 2 }] },
      { text: "Protegiéndoles y mejorando su barrio o comunidad", emoji: "🏘️", impacts: [{ dimension: "tags.comunidad", delta: 4 },{ dimension: "valores.impacto_social", delta: 3 }] },
      { text: "Atendiendo su salud y acompañando su recuperación", emoji: "🩺", impacts: [{ dimension: "riasec.S", delta: 2 },{ dimension: "tags.salud", delta: 4 }] },
      { text: "Todavía no tengo una preferencia clara", emoji: "🤔", impacts: [] },
    ],
  },
  {
    id: "q2_e02", stage: 2, text: "¿Con qué edades te gustaría trabajar?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 4 }],
    options: [
      { text: "Con niños: su energía y aprender con ellos me encanta", emoji: "👶", impacts: [{ dimension: "tags.ninos", delta: 4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 1 }] },
      { text: "Con adolescentes: me siento cercano a esa edad", emoji: "🎒", impacts: [{ dimension: "tags.adolescentes", delta: 4 }] },
      { text: "Con adultos: me interesa acompañar sus necesidades y proyectos", emoji: "👔", impacts: [{ dimension: "tags.adultos", delta: 4 },{ dimension: "riasec.E", delta: 1 }] },
      { text: "No tengo preferencia por una edad concreta", emoji: "👥", impacts: [] },
    ],
  },

  // ── Art / Creativity Cluster ──
  {
    id: "q2_a01", stage: 2, text: "¿Qué tipo de creación te va más?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.A", operator: "gt", value: 4 }],
    options: [
      { text: "Visual: pintura, escultura, foto, vídeo", emoji: "🖼️", impacts: [{ dimension: "tags.arte_visual", delta: 4 },{ dimension: "aptitudes.espacial_visual", delta: 3 }] },
      { text: "Narrativa: escribir, guiones, periodismo", emoji: "✍️", impacts: [{ dimension: "tags.narrativa", delta: 4 },{ dimension: "aptitudes.verbal_linguistica", delta: 3 }] },
      { text: "Audiovisual: cine, edición, producción de contenido", emoji: "🎬", impacts: [{ dimension: "tags.audiovisual", delta: 4 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
      { text: "Diseño funcional: productos, interiorismo, UX", emoji: "✏️", impacts: [{ dimension: "tags.diseño_funcional", delta: 4 },{ dimension: "riasec.R", delta: 2 }] },
      { text: "Publicidad / comunicación: convencer con creatividad", emoji: "📢", impacts: [{ dimension: "tags.publicidad", delta: 4 },{ dimension: "riasec.E", delta: 2 }] },
    ],
  },

  // ── Business / Law Cluster ──
  {
    id: "q2_b01", stage: 2, text: "¿En qué escenario profesional te ves más?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.E", operator: "gt", value: 3 }],
    options: [
      { text: "En un tribunal defendiendo a alguien inocente", emoji: "🏛️", impacts: [{ dimension: "tags.derecho", delta: 4 },{ dimension: "aptitudes.verbal_linguistica", delta: 3 },{ dimension: "aversiones.hablar_publico", delta: -3 }] },
      { text: "Dirigiendo un equipo en una multinacional", emoji: "🏢", impacts: [{ dimension: "tags.empresa", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "Gestionando las finanzas de una empresa o fondo de inversión", emoji: "💹", impacts: [{ dimension: "tags.finanzas", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 3 }] },
      { text: "Creando mi propia empresa desde cero", emoji: "🚀", impacts: [{ dimension: "tags.emprendimiento", delta: 4 },{ dimension: "valores.autonomia", delta: 3 }] },
      { text: "En política o gestión pública, cambiando las reglas", emoji: "🗳️", impacts: [{ dimension: "tags.politica", delta: 4 },{ dimension: "valores.impacto_social", delta: 3 }] },
    ],
  },

  // ── Pure Sciences Cluster ──
  {
    id: "q2_c01", stage: 2, text: "¿Qué tipo de investigación te fliparía más?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "riasec.I", operator: "gt", value: 5 }],
    options: [
      { text: "Las leyes del universo: partículas, energía, gravedad", emoji: "⚛️", impacts: [{ dimension: "tags.fisica", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 2 }] },
      { text: "La vida a nivel celular: ADN, proteínas, evolución", emoji: "🧬", impacts: [{ dimension: "tags.biologia", delta: 4 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "Matemáticas puras: demostrar teoremas que nadie ha resuelto", emoji: "📐", impacts: [{ dimension: "tags.matematicas", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 3 }] },
      { text: "Datos y estadística: encontrar patrones ocultos", emoji: "📊", impacts: [{ dimension: "tags.datos", delta: 4 },{ dimension: "riasec.C", delta: 2 }] },
      { text: "Reacciones químicas: crear nuevos materiales o medicamentos", emoji: "🧪", impacts: [{ dimension: "tags.quimica", delta: 4 },{ dimension: "riasec.R", delta: 2 }] },
    ],
  },

  // ── Stage 2 Extended ──
  {
    id: "q2_s05", stage: 2, text: "¿Qué área de la salud te interesa más?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 4 }],
    options: [
      { text: "Rehabilitación y fisioterapia", emoji: "🦵", impacts: [{ dimension: "tags.fisioterapia", delta: 4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 2 }] },
      { text: "Salud mental y psicología", emoji: "🧠", impacts: [{ dimension: "tags.psicologia", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "Nutrición y dietética", emoji: "🥗", impacts: [{ dimension: "tags.nutricion", delta: 4 },{ dimension: "aptitudes.cientifico_tecnica", delta: 1 }] },
      { text: "Odontología", emoji: "🦷", impacts: [{ dimension: "tags.odontologia", delta: 4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 2 }] },
      { text: "Medicina y diagnóstico clínico", emoji: "🩺", impacts: [{ dimension: "tags.medicina", delta: 4 },{ dimension: "aptitudes.cientifico_tecnica", delta: 2 }] },
      { text: "Enfermería y cuidados de las personas", emoji: "💗", impacts: [{ dimension: "tags.enfermeria", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "Otra área o todavía no lo tengo claro", emoji: "🤔", impacts: [] },
    ],
  },
  {
    id: "q2_t04", stage: 2, text: "En tecnología, ¿qué área te llama más?",
    type: "choice", weight: 3, info_gain_estimate: 8,
    conditions: [{ dimension: "aptitudes.logico_matematica", operator: "gt", value: 3 }],
    options: [
      { text: "Inteligencia artificial y machine learning", emoji: "🤖", impacts: [{ dimension: "tags.ia", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 2 }] },
      { text: "Ciberseguridad y hacking ético", emoji: "🔐", impacts: [{ dimension: "tags.ciberseguridad", delta: 4 },{ dimension: "riasec.I", delta: 2 }] },
      { text: "Desarrollo web y apps", emoji: "🌐", impacts: [{ dimension: "tags.desarrollo_web", delta: 4 },{ dimension: "riasec.A", delta: 1 }] },
      { text: "Videojuegos y realidad virtual", emoji: "🎮", impacts: [{ dimension: "tags.videojuegos", delta: 4 },{ dimension: "riasec.A", delta: 2 },{ dimension: "aptitudes.espacial_visual", delta: 2 }] },
    ],
  },
  {
    id: "q2_t05", stage: 2, text: "¿Te atrae más analizar datos o construir sistemas?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.I", operator: "gt", value: 4 }],
    options: [
      { text: "Analizar datos y encontrar patrones", emoji: "📊", impacts: [{ dimension: "tags.datos", delta: 4 },{ dimension: "riasec.I", delta: 2 },{ dimension: "riasec.C", delta: 2 }] },
      { text: "Construir sistemas que funcionen", emoji: "⚙️", impacts: [{ dimension: "tags.ingenieria_sistemas", delta: 4 },{ dimension: "riasec.R", delta: 2 }] },
      { text: "Las dos cosas me interesan", emoji: "🔄", impacts: [{ dimension: "riasec.I", delta: 1 },{ dimension: "riasec.R", delta: 1 }] },
    ],
  },
  {
    id: "q2_e03", stage: 2, text: "¿Desde dónde te gustaría ayudar a cambiar las cosas?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    conditions: [{ dimension: "valores.impacto_social", operator: "gt", value: 4 }],
    options: [
      { text: "Desde una ONG o asociación, en el terreno", emoji: "🤝", impacts: [{ dimension: "tags.ong", delta: 4 },{ dimension: "valores.impacto_social", delta: 2 }] },
      { text: "Desde la administración pública, con políticas", emoji: "🏛️", impacts: [{ dimension: "tags.politica", delta: 3 },{ dimension: "riasec.E", delta: 2 }] },
      { text: "Desde una empresa con propósito social", emoji: "🏢", impacts: [{ dimension: "tags.empresa", delta: 2 },{ dimension: "riasec.E", delta: 2 },{ dimension: "valores.autonomia", delta: 2 }] },
      { text: "Desde la comunicación, concienciando a la gente", emoji: "📢", impacts: [{ dimension: "tags.periodismo", delta: 3 },{ dimension: "aptitudes.verbal_linguistica", delta: 2 }] },
    ],
  },
  {
    id: "q2_a02", stage: 2, text: "¿Prefieres actuar/interpretar o crear desde detrás?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.A", operator: "gt", value: 4 }],
    options: [
      { text: "Actuar: teatro, danza, interpretación", emoji: "🎭", impacts: [{ dimension: "tags.artes_escenicas", delta: 4 },{ dimension: "aptitudes.corporal_kinestesica", delta: 2 }] },
      { text: "Crear desde detrás: dirigir, producir, diseñar", emoji: "🎬", impacts: [{ dimension: "tags.produccion", delta: 4 },{ dimension: "riasec.E", delta: 2 }] },
      { text: "Escribir: guiones, novelas, poesía", emoji: "✍️", impacts: [{ dimension: "tags.narrativa", delta: 3 },{ dimension: "aptitudes.verbal_linguistica", delta: 3 }] },
    ],
  },
  {
    id: "q2_b02", stage: 2, text: "¿Qué parte de un negocio te atrae más?",
    type: "choice", weight: 2, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.E", operator: "gt", value: 3 }],
    options: [
      { text: "Marketing y ventas: convencer y posicionar", emoji: "📣", impacts: [{ dimension: "tags.marketing", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 2 }] },
      { text: "Finanzas: controlar el dinero y la inversión", emoji: "💹", impacts: [{ dimension: "tags.finanzas", delta: 4 },{ dimension: "aptitudes.logico_matematica", delta: 2 }] },
      { text: "Recursos humanos: gestionar talento", emoji: "👥", impacts: [{ dimension: "tags.rrhh", delta: 4 },{ dimension: "aptitudes.interpersonal", delta: 3 }] },
      { text: "Estrategia y dirección general", emoji: "🏆", impacts: [{ dimension: "tags.direccion", delta: 4 },{ dimension: "ambicion.economica", delta: 2 }] },
    ],
  },

  // ══════════════════════════════════════════════════════
  // STAGE 3 — DIFFERENTIATION (tradeoff pairs)
  // ══════════════════════════════════════════════════════
  {
    id: "q3_01", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Medicina vs Enfermería", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 5 }],
    options: [
      { text: "Medicina: diagnóstico, prevención y tratamiento. Grado de 6 años.", emoji: "🩺", impacts: [{ dimension: "tags.medicina", delta: 4 },{ dimension: "ambicion.academica", delta: 3 }] },
      { text: "Enfermería: cuidados, prevención y seguimiento. Grado de 4 años.", emoji: "💉", impacts: [{ dimension: "tags.enfermeria", delta: 4 },{ dimension: "valores.conciliacion", delta: 2 }] },
    ],
  },
  {
    id: "q3_02", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Derecho vs Criminología", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.E", operator: "gt", value: 3 }],
    options: [
      { text: "Argumentar en un juicio, redactar leyes", emoji: "📜", impacts: [{ dimension: "tags.derecho", delta: 4 }] },
      { text: "Investigar por qué la gente comete crímenes", emoji: "🔎", impacts: [{ dimension: "tags.criminologia", delta: 4 }] },
    ],
  },
  {
    id: "q3_03", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "ADE vs Economía", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.E", operator: "gt", value: 3 }],
    options: [
      { text: "Gestionar una empresa: marketing, RRHH, operaciones", emoji: "🏢", impacts: [{ dimension: "tags.ade", delta: 4 }] },
      { text: "Entender cómo funciona la economía global", emoji: "📈", impacts: [{ dimension: "tags.economia", delta: 4 }] },
    ],
  },
  {
    id: "q3_04", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Informática vs Telecomunicaciones", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "aptitudes.logico_matematica", operator: "gt", value: 4 }],
    options: [
      { text: "Programar software, crear apps", emoji: "💻", impacts: [{ dimension: "tags.informatica", delta: 4 }] },
      { text: "Diseñar redes, antenas, comunicaciones", emoji: "📡", impacts: [{ dimension: "tags.telecomunicaciones", delta: 4 }] },
    ],
  },
  {
    id: "q3_05", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Psicología vs Educación", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 5 }],
    options: [
      { text: "Entender por qué la gente piensa y siente como siente", emoji: "🧠", impacts: [{ dimension: "tags.psicologia", delta: 4 }] },
      { text: "Enseñar a niños o jóvenes", emoji: "📚", impacts: [{ dimension: "tags.educacion", delta: 4 }] },
    ],
  },
  {
    id: "q3_06", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Periodismo vs Audiovisual", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.A", operator: "gt", value: 3 }],
    options: [
      { text: "Investigar y contar la verdad", emoji: "📰", impacts: [{ dimension: "tags.periodismo", delta: 4 }] },
      { text: "Crear contenido visual: dirigir, editar vídeo", emoji: "🎥", impacts: [{ dimension: "tags.audiovisual", delta: 4 }] },
    ],
  },
  {
    id: "q3_07", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Arquitectura vs Ingeniería Civil", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "aptitudes.espacial_visual", operator: "gt", value: 4 }],
    options: [
      { text: "¡Qué diseño! Quiero diseñar así", emoji: "✏️", impacts: [{ dimension: "tags.arquitectura", delta: 4 },{ dimension: "riasec.A", delta: 2 }] },
      { text: "¿Cómo aguanta eso de pie? La estructura...", emoji: "🔩", impacts: [{ dimension: "tags.civil", delta: 4 },{ dimension: "riasec.R", delta: 2 }] },
    ],
  },
  {
    id: "q3_08", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Biología vs Biotecnología", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.I", operator: "gt", value: 4 }],
    options: [
      { text: "Entender ecosistemas, evolución, biodiversidad", emoji: "🌿", impacts: [{ dimension: "tags.biologia_pura", delta: 4 }] },
      { text: "Usar biología para crear cosas: medicamentos, alimentos", emoji: "🧬", impacts: [{ dimension: "tags.biotecnologia", delta: 4 },{ dimension: "riasec.R", delta: 2 }] },
    ],
  },
  {
    id: "q3_09", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Farmacia vs Medicina", type: "tradeoff", weight: 3, info_gain_estimate: 7,
    conditions: [{ dimension: "aptitudes.cientifico_tecnica", operator: "gt", value: 4 }],
    options: [
      { text: "Ver pacientes, diagnosticar cada día", emoji: "🩺", impacts: [{ dimension: "tags.medicina", delta: 4 }] },
      { text: "Trabajar con fármacos, investigar tratamientos", emoji: "💊", impacts: [{ dimension: "tags.farmacia", delta: 4 }] },
    ],
  },
  {
    id: "q3_10", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Trabajo Social vs Educación Social", type: "tradeoff", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "tags.comunidad", operator: "gt", value: 2 }],
    options: [
      { text: "Gestionando recursos y servicios", emoji: "📋", impacts: [{ dimension: "tags.trabajo_social", delta: 4 }] },
      { text: "Acompañándoles con actividades y educación", emoji: "🤝", impacts: [{ dimension: "tags.educacion_social", delta: 4 }] },
    ],
  },
  {
    id: "q3_11", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Fisioterapia vs Ciencias del Deporte", type: "tradeoff", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "aptitudes.corporal_kinestesica", operator: "gt", value: 3 }],
    options: [
      { text: "Rehabilitar lesiones", emoji: "🦵", impacts: [{ dimension: "tags.fisioterapia", delta: 4 }] },
      { text: "Entrenar, planificar, dirigir deportistas", emoji: "⚽", impacts: [{ dimension: "tags.deporte", delta: 4 }] },
    ],
  },
  {
    id: "q3_12", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Historia vs Filosofía", type: "tradeoff", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "aptitudes.verbal_linguistica", operator: "gt", value: 4 }],
    options: [
      { text: "¿Qué pasó exactamente? Investigar el pasado", emoji: "🏺", impacts: [{ dimension: "tags.historia", delta: 4 }] },
      { text: "¿Qué sentido tiene? Pensar sobre ética, existencia", emoji: "🤔", impacts: [{ dimension: "tags.filosofia", delta: 4 }] },
    ],
  },

  // ── Stage 3 Extended ──
  {
    id: "q3_13", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Enfermería vs Fisioterapia", type: "tradeoff", weight: 2, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.S", operator: "gt", value: 4 }],
    options: [
      { text: "Cuidar pacientes en planta, urgencias, quirófano", emoji: "💉", impacts: [{ dimension: "tags.enfermeria", delta: 4 }] },
      { text: "Rehabilitar lesiones, trabajar el movimiento", emoji: "🦵", impacts: [{ dimension: "tags.fisioterapia", delta: 4 }] },
    ],
  },
  {
    id: "q3_14", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Marketing vs Finanzas", type: "tradeoff", weight: 2, info_gain_estimate: 7,
    conditions: [{ dimension: "riasec.E", operator: "gt", value: 3 }],
    options: [
      { text: "Crear campañas, posicionar marcas, redes sociales", emoji: "📣", impacts: [{ dimension: "tags.marketing", delta: 4 }] },
      { text: "Analizar números, inversiones, mercados financieros", emoji: "📊", impacts: [{ dimension: "tags.finanzas", delta: 4 }] },
    ],
  },
  {
    id: "q3_15", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Ciencias Ambientales vs Química", type: "tradeoff", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "riasec.I", operator: "gt", value: 4 }],
    options: [
      { text: "Estudiar ecosistemas, proteger el medio ambiente", emoji: "🌍", impacts: [{ dimension: "tags.medio_ambiente", delta: 4 }] },
      { text: "Crear nuevas sustancias, reacciones, materiales", emoji: "🧪", impacts: [{ dimension: "tags.quimica", delta: 4 }] },
    ],
  },
  {
    id: "q3_16", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Turismo vs Relaciones Internacionales", type: "tradeoff", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "estilo_vida.movilidad", operator: "gt", value: 3 }],
    options: [
      { text: "Gestionar hoteles, eventos, experiencias turísticas", emoji: "🏨", impacts: [{ dimension: "tags.turismo", delta: 4 }] },
      { text: "Diplomacia, política internacional, ONGs globales", emoji: "🌐", impacts: [{ dimension: "tags.relaciones_internacionales", delta: 4 }] },
    ],
  },
  {
    id: "q3_17", stage: 3, text: "¿Cuál de estas dos opciones te atrae más?",
    subtext: "Diseño Gráfico vs Bellas Artes", type: "tradeoff", weight: 2, info_gain_estimate: 6,
    conditions: [{ dimension: "riasec.A", operator: "gt", value: 4 }],
    options: [
      { text: "Diseño al servicio de marcas, UX, comunicación visual", emoji: "🖥️", impacts: [{ dimension: "tags.diseño_funcional", delta: 4 }] },
      { text: "Arte puro: pintar, esculpir, exponer en galerías", emoji: "🎨", impacts: [{ dimension: "tags.arte_visual", delta: 4 }] },
    ],
  },

  // ── NEW Stage 2 cluster: I+E (TECH + BUSINESS, doble grado type) ──
  {
    id: "q2_te01", stage: 2, text: "¿Te ves más programando o gestionando un equipo de programadores?",
    type: "choice", weight: 3, info_gain_estimate: 9,
    conditions: [
      { dimension: "riasec.I", operator: "gt", value: 3 },
      { dimension: "riasec.E", operator: "gt", value: 2 },
    ],
    options: [
      { text: "Programando: el código y el algoritmo son lo mío", emoji: "💻", impacts: [{ dimension: "tags.programacion", delta: 4 },{ dimension: "tags.informatica", delta: 3 },{ dimension: "riasec.I", delta: 2 }] },
      { text: "Gestionando: prefiero coordinar y tomar decisiones", emoji: "🎯", impacts: [{ dimension: "tags.empresa", delta: 4 },{ dimension: "tags.ade", delta: 3 },{ dimension: "riasec.E", delta: 2 }] },
      { text: "Ambas a la vez: técnico que sabe de negocio", emoji: "🚀", impacts: [{ dimension: "tags.informatica", delta: 3 },{ dimension: "tags.ade", delta: 3 },{ dimension: "tags.doble_grado", delta: 2 },{ dimension: "tags.doble_informatica_ade", delta: 4 }] },
    ],
  },
  {
    id: "q2_te02", stage: 2, text: "Si montaras una startup tech, ¿qué papel cogerías?",
    type: "choice", weight: 3, info_gain_estimate: 9,
    conditions: [
      { dimension: "riasec.I", operator: "gt", value: 3 },
      { dimension: "riasec.E", operator: "gt", value: 2 },
    ],
    options: [
      { text: "CTO: yo construyo el producto", emoji: "🛠️", impacts: [{ dimension: "tags.programacion", delta: 4 },{ dimension: "tags.informatica", delta: 4 },{ dimension: "riasec.I", delta: 2 }] },
      { text: "CEO: yo lidero la visión, el equipo y el negocio", emoji: "👑", impacts: [{ dimension: "tags.ade", delta: 4 },{ dimension: "tags.empresa", delta: 4 },{ dimension: "riasec.E", delta: 3 },{ dimension: "valores.autonomia", delta: 2 }] },
      { text: "Ambos: cofundador técnico-comercial", emoji: "🤝", impacts: [{ dimension: "tags.doble_grado", delta: 3 },{ dimension: "tags.doble_informatica_ade", delta: 4 },{ dimension: "tags.informatica", delta: 2 },{ dimension: "tags.ade", delta: 2 }] },
      { text: "CFO/COO: las operaciones, los datos, los números", emoji: "📊", impacts: [{ dimension: "tags.finanzas", delta: 3 },{ dimension: "tags.ade", delta: 3 },{ dimension: "riasec.C", delta: 2 }] },
    ],
  },
  {
    id: "q2_te03", stage: 2, text: "¿Qué te flipa más de la tecnología?",
    type: "choice", weight: 2, info_gain_estimate: 8,
    conditions: [
      { dimension: "riasec.I", operator: "gt", value: 3 },
      { dimension: "riasec.E", operator: "gt", value: 2 },
    ],
    options: [
      { text: "Crear cosas que no existen: algoritmos, sistemas, IA", emoji: "🧠", impacts: [{ dimension: "tags.informatica", delta: 4 },{ dimension: "tags.programacion", delta: 3 }] },
      { text: "Modelos de negocio escalables: SaaS, marketplaces", emoji: "📈", impacts: [{ dimension: "tags.ade", delta: 4 },{ dimension: "tags.empresa", delta: 3 },{ dimension: "ambicion.economica", delta: 2 }] },
      { text: "Datos masivos: encontrar patrones, predecir", emoji: "📊", impacts: [{ dimension: "tags.datos", delta: 4 },{ dimension: "tags.estadistica", delta: 3 }] },
      { text: "Hardware, robótica, dispositivos físicos", emoji: "🤖", impacts: [{ dimension: "tags.robotica", delta: 4 },{ dimension: "tags.electronica", delta: 3 }] },
    ],
  },
  {
    id: "q2_te04", stage: 2, text: "¿Cuál de estos perfiles tipo te define mejor?",
    type: "tradeoff", weight: 3, info_gain_estimate: 10,
    conditions: [
      { dimension: "riasec.I", operator: "gt", value: 3 },
      { dimension: "riasec.E", operator: "gt", value: 2 },
    ],
    options: [
      { text: "Doble Grado Informática + ADE: emprendedor técnico", emoji: "🚀", impacts: [{ dimension: "tags.doble_informatica_ade", delta: 5 },{ dimension: "tags.informatica", delta: 3 },{ dimension: "tags.ade", delta: 3 },{ dimension: "tags.doble_grado", delta: 3 }] },
      { text: "Solo Informática: profundizar al máximo en tech", emoji: "💻", impacts: [{ dimension: "tags.informatica", delta: 5 },{ dimension: "tags.programacion", delta: 4 },{ dimension: "tags.grado_simple", delta: 2 }] },
      { text: "Solo ADE: empresa pura, sin tantos números técnicos", emoji: "📊", impacts: [{ dimension: "tags.ade", delta: 5 },{ dimension: "tags.empresa", delta: 4 },{ dimension: "tags.grado_simple", delta: 2 }] },
    ],
  },

  // ── NEW Stage 3 tradeoffs: doble grado vs simple ──
  {
    id: "q3_dg01", stage: 3, text: "Si tuvieras que elegir HOY:",
    subtext: "Doble Grado Informática+ADE vs Informática pura",
    type: "tradeoff", weight: 3, info_gain_estimate: 9,
    conditions: [
      { dimension: "tags.informatica", operator: "gt", value: 1 },
    ],
    options: [
      { text: "Doble Grado Informática+ADE: combinar tecnología y gestión", emoji: "🚀", impacts: [{ dimension: "tags.doble_informatica_ade", delta: 5 },{ dimension: "tags.doble_grado", delta: 3 },{ dimension: "tags.ade", delta: 2 }] },
      { text: "Informática pura: quiero ser excelente en lo técnico", emoji: "💻", impacts: [{ dimension: "tags.informatica", delta: 4 },{ dimension: "tags.grado_simple", delta: 2 }] },
    ],
  },
  {
    id: "q3_dg02", stage: 3, text: "Si tuvieras que elegir HOY:",
    subtext: "Doble Grado Derecho+ADE vs Derecho puro",
    type: "tradeoff", weight: 3, info_gain_estimate: 9,
    conditions: [
      { dimension: "tags.derecho", operator: "gt", value: 1 },
    ],
    options: [
      { text: "Doble Grado Derecho+ADE: combinar derecho y gestión", emoji: "🚀", impacts: [{ dimension: "tags.doble_derecho_ade", delta: 5 },{ dimension: "tags.doble_grado", delta: 3 },{ dimension: "tags.ade", delta: 2 }] },
      { text: "Derecho puro: quiero centrarme en la abogacía", emoji: "⚖️", impacts: [{ dimension: "tags.derecho", delta: 4 },{ dimension: "tags.grado_simple", delta: 2 }] },
    ],
  },
  {
    id: "q3_dg03", stage: 3, text: "Si tuvieras que elegir HOY:",
    subtext: "Doble Grado Mates+Física vs Física pura",
    type: "tradeoff", weight: 3, info_gain_estimate: 8,
    conditions: [
      { dimension: "tags.fisica", operator: "gt", value: 1 },
    ],
    options: [
      { text: "Doble Grado Matemáticas+Física: profundizar en ambas disciplinas", emoji: "🚀", impacts: [{ dimension: "tags.doble_mates_fisica", delta: 5 },{ dimension: "tags.doble_grado", delta: 3 },{ dimension: "tags.matematicas", delta: 2 }] },
      { text: "Física pura: me apasiona la física más que las mates", emoji: "🌌", impacts: [{ dimension: "tags.fisica", delta: 4 },{ dimension: "tags.grado_simple", delta: 2 }] },
    ],
  },
  {
    id: "q3_dg04", stage: 3, text: "¿Y entre estas dos opciones?",
    subtext: "Doble Grado Periodismo+ComAudiovisual vs Periodismo puro",
    type: "tradeoff", weight: 2, info_gain_estimate: 7,
    conditions: [
      { dimension: "tags.periodismo", operator: "gt", value: 1 },
    ],
    options: [
      { text: "Doble Grado Periodismo+Comunicación Audiovisual", emoji: "🎬", impacts: [{ dimension: "tags.doble_grado", delta: 3 },{ dimension: "tags.periodismo", delta: 2 },{ dimension: "tags.audiovisual", delta: 3 }] },
      { text: "Periodismo puro", emoji: "📰", impacts: [{ dimension: "tags.periodismo", delta: 4 },{ dimension: "tags.grado_simple", delta: 2 }] },
    ],
  },

  // ── NEW Stage 4: preguntas universidad/ciudad ──
  {
    id: "q4_uni_campus", stage: 4, text: "¿Qué entorno prefieres para estudiar?",
    type: "choice", weight: 1, info_gain_estimate: 5,
    options: [
      { text: "Campus integrado en la ciudad", emoji: "🏙️", impacts: [{ dimension: "tags.uni_urbana", delta: 3 },{ dimension: "estilo_vida.urbano", delta: 1 }] },
      { text: "Campus con espacios propios fuera del centro", emoji: "🏫", impacts: [{ dimension: "tags.uni_campus", delta: 3 },{ dimension: "tags.ciudad_universitaria", delta: 2 }] },
      { text: "Me da igual mientras la carrera sea buena", emoji: "📚", impacts: [{ dimension: "ambicion.academica", delta: 1 }] },
    ],
  },
  {
    id: "q4_uni_erasmus", stage: 4, text: "¿Te interesa que la universidad tenga un programa Erasmus fuerte?",
    type: "choice", weight: 1, info_gain_estimate: 5,
    options: [
      { text: "Sí, fundamental. Quiero hacer Erasmus seguro.", emoji: "✈️", impacts: [{ dimension: "estilo_vida.movilidad", delta: 2 },{ dimension: "tags.ciudad_internacional", delta: 2 }] },
      { text: "Estaría bien tener la opción", emoji: "🤔", impacts: [{ dimension: "estilo_vida.movilidad", delta: 1 }] },
      { text: "No me importa, no haría Erasmus", emoji: "🇪🇸", impacts: [{ dimension: "estilo_vida.movilidad", delta: -1 }] },
    ],
  },
  {
    id: "q4_uni_prestige", stage: 4, text: "¿Qué priorizas al comparar universidades?",
    type: "choice", weight: 1, info_gain_estimate: 5,
    options: [
      { text: "Prestigio internacional: quiero el ranking más alto posible", emoji: "🏆", impacts: [{ dimension: "valores.prestigio", delta: 3 },{ dimension: "ambicion.academica", delta: 2 }] },
      { text: "Buena universidad pública sin obsesionarme con el ranking", emoji: "🎓", impacts: [{ dimension: "valores.seguridad_economica", delta: 2 }] },
      { text: "La cercanía y el ambiente me importan más que el ranking", emoji: "🏘️", impacts: [{ dimension: "valores.conciliacion", delta: 2 }] },
    ],
  },

  // ══════════════════════════════════════════════════════
  // STAGE 4 — PRAGMATIC + LIFESTYLE (12 questions)
  // ══════════════════════════════════════════════════════
  {
    id: "q4_01", stage: 4, text: "¿Cuál es tu nota de admisión estimada?",
    subtext: "Incluye las ponderaciones que correspondan. Puedes escribir la nota, elegir un intervalo o seguir si aún no la sabes. En los intervalos usamos su punto medio.", type: "slider", weight: 3, info_gain_estimate: 5,
    options: [
      { text: "5 a 7", emoji: "📝", impacts: [{ dimension: "pragmatico.nota_estimada", delta: 6 }] },
      { text: "7 a 9", emoji: "📝", impacts: [{ dimension: "pragmatico.nota_estimada", delta: 8 }] },
      { text: "9 a 11", emoji: "📝", impacts: [{ dimension: "pragmatico.nota_estimada", delta: 10 }] },
      { text: "11 a 12", emoji: "📝", impacts: [{ dimension: "pragmatico.nota_estimada", delta: 11.5 }] },
      { text: "12 a 13", emoji: "📝", impacts: [{ dimension: "pragmatico.nota_estimada", delta: 12.5 }] },
      { text: "13 a 14", emoji: "📝", impacts: [{ dimension: "pragmatico.nota_estimada", delta: 13.5 }] },
      { text: "Aún no lo sé o mi vía de acceso no usa esta escala", emoji: "🤔", impacts: [] },
    ],
  },
  {
    id: "q4_02", stage: 4, text: "¿Tipo de universidad?",
    type: "choice", weight: 3, info_gain_estimate: 5,
    options: [
      { text: "Solo pública, el dinero es importante", emoji: "🏫", impacts: [{ dimension: "pragmatico.presupuesto", delta: 1 }] },
      { text: "Prefiero pública pero privada no se descarta", emoji: "⚖️", impacts: [{ dimension: "pragmatico.presupuesto", delta: 2 }] },
      { text: "No me importa, puedo pagar privada", emoji: "💳", impacts: [{ dimension: "pragmatico.presupuesto", delta: 3 }] },
    ],
  },
  {
    id: "q4_03", stage: 4, text: "¿Te planteas mudarte para estudiar?",
    subtext: "Para quedarte en tu zona usaremos tu comunidad o ciudad autónoma. Si vives fuera de España y no quieres mudarte, buscaremos opciones a distancia del catálogo español.",
    type: "choice", weight: 3, info_gain_estimate: 5,
    options: [
      { text: "Quiero quedarme en mi zona", emoji: "🏠", impacts: [{ dimension: "geografico.movilidad", delta: 1 },{ dimension: "estilo_vida.movilidad", delta: 1 }] },
      { text: "Me mudaría si la opción encaja conmigo", emoji: "🚂", impacts: [{ dimension: "geografico.movilidad", delta: 2 },{ dimension: "estilo_vida.movilidad", delta: 2 }] },
      { text: "Me da igual dónde sea, quiero la mejor opción", emoji: "✈️", impacts: [{ dimension: "geografico.movilidad", delta: 3 },{ dimension: "estilo_vida.movilidad", delta: 3 }] },
    ],
  },
  {
    id: "q4_04", stage: 4, text: "¿Dónde vives actualmente?",
    subtext: "Elige tu comunidad o ciudad autónoma. También puedes indicar que vives fuera de España.",
    type: "choice", weight: 2, info_gain_estimate: 3,
    options: [
      { text: "Andalucía", emoji: "🌞", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Aragón", emoji: "🏔️", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Asturias", emoji: "🌿", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Baleares", emoji: "🏝️", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Canarias", emoji: "🌴", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Cantabria", emoji: "⛰️", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Castilla y León", emoji: "🏰", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Castilla-La Mancha", emoji: "🌾", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Cataluña", emoji: "🎭", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Comunidad Valenciana", emoji: "🍊", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Extremadura", emoji: "🦅", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Galicia", emoji: "🐙", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Madrid", emoji: "🏙️", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Murcia", emoji: "🌶️", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Navarra", emoji: "🐂", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "País Vasco", emoji: "⚓", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "La Rioja", emoji: "🍇", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Ceuta", emoji: "📍", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Melilla", emoji: "📍", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
      { text: "Vivo fuera de España", emoji: "🌍", impacts: [{ dimension: "geografico.comunidad_actual", delta: 0 }] },
    ],
  },
  {
    id: "q4_05", stage: 4, text: "¿Cuántos años estás dispuesto/a a estudiar?",
    type: "choice", weight: 2, info_gain_estimate: 5,
    options: [
      { text: "4 años como mucho", emoji: "⏱️", impacts: [{ dimension: "pragmatico.duracion_max", delta: 4 }] },
      { text: "5 años si la carrera lo vale", emoji: "📅", impacts: [{ dimension: "pragmatico.duracion_max", delta: 5 }] },
      { text: "6 años o más, si es lo que necesito", emoji: "🎯", impacts: [{ dimension: "pragmatico.duracion_max", delta: 6 }] },
    ],
  },

  // ── Stage 4: City & Lifestyle Preferences ──
  {
    id: "q4_06", stage: 4, text: "¿Qué tamaño de ciudad prefieres para estudiar?",
    type: "choice", weight: 3, info_gain_estimate: 7,
    options: [
      { text: "Gran ciudad: Madrid, Barcelona...", emoji: "🏙️", impacts: [{ dimension: "estilo_vida.urbano", delta: 4 }] },
      { text: "Ciudad grande: Valencia, Sevilla, Bilbao...", emoji: "🌆", impacts: [{ dimension: "estilo_vida.urbano", delta: 2 }] },
      { text: "Ciudad media: Granada, Salamanca...", emoji: "🏘️", impacts: [{ dimension: "estilo_vida.urbano", delta: -1 }] },
      { text: "Ciudad pequeña y tranquila", emoji: "🏡", impacts: [{ dimension: "estilo_vida.urbano", delta: -3 }] },
      { text: "Me da igual el tamaño", emoji: "🤷", impacts: [] },
    ],
  },
  {
    id: "q4_07", stage: 4, text: "¿Qué clima prefieres?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Calor y sol: Mediterráneo o sur de España", emoji: "☀️", impacts: [{ dimension: "tags.clima_calido", delta: 4 }] },
      { text: "Templado: ni mucho frío ni mucho calor", emoji: "🌤️", impacts: [{ dimension: "tags.clima_calido", delta: 1 },{ dimension: "tags.clima_frio", delta: 1 }] },
      { text: "Fresco: verde, lluvia, otoño", emoji: "🌧️", impacts: [{ dimension: "tags.clima_frio", delta: 4 }] },
      { text: "Me da igual el clima", emoji: "🤷", impacts: [] },
    ],
  },
  {
    id: "q4_08", stage: 4, text: "¿Es importante para ti vivir cerca del mar?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Sí, fundamental. Necesito playa", emoji: "🏖️", impacts: [{ dimension: "tags.playa_importante", delta: 4 }] },
      { text: "Estaría bien pero no es imprescindible", emoji: "🌊", impacts: [{ dimension: "tags.playa_importante", delta: 2 }] },
      { text: "Me da igual", emoji: "🤷", impacts: [] },
      { text: "Prefiero interior, montaña o campo", emoji: "⛰️", impacts: [] },
    ],
  },
  {
    id: "q4_09", stage: 4, text: "¿Cómo de importante es la vida social y nocturna de la ciudad?",
    type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Muy importante, quiero fiesta y vida social", emoji: "🎉", impacts: [{ dimension: "estilo_vida.social", delta: 4 }] },
      { text: "Algo de ambiente está bien pero no es lo principal", emoji: "🍷", impacts: [{ dimension: "estilo_vida.social", delta: 1 }] },
      { text: "Lo mínimo, prefiero tranquilidad", emoji: "📚", impacts: [{ dimension: "estilo_vida.social", delta: -2 }] },
    ],
  },
  {
    id: "q4_10", stage: 4, text: "¿Prefieres una «ciudad universitaria» o una gran metrópoli?",
    subtext: "Ciudad universitaria = donde la uni es el centro de todo", type: "choice", weight: 2, info_gain_estimate: 6,
    options: [
      { text: "Ciudad universitaria: Salamanca, Granada, Santiago...", emoji: "🎓", impacts: [{ dimension: "tags.ciudad_universitaria", delta: 4 },{ dimension: "estilo_vida.urbano", delta: -1 }] },
      { text: "Gran metrópoli: más oportunidades y oferta", emoji: "🏙️", impacts: [{ dimension: "estilo_vida.urbano", delta: 3 },{ dimension: "tags.ciudad_internacional", delta: 2 }] },
      { text: "Me da igual, lo que importe es la carrera", emoji: "📋", impacts: [] },
    ],
  },
  {
    id: "q4_11", stage: 4, text: "¿Te gustaría estudiar en una ciudad con ambiente internacional?",
    type: "choice", weight: 2, info_gain_estimate: 5,
    options: [
      { text: "Sí, quiero ambiente multicultural", emoji: "🌍", impacts: [{ dimension: "tags.ciudad_internacional", delta: 4 }] },
      { text: "No me importa especialmente", emoji: "🤷", impacts: [] },
      { text: "Prefiero algo más local y cercano", emoji: "🇪🇸", impacts: [{ dimension: "tags.ciudad_internacional", delta: -2 }] },
    ],
  },
  {
    id: "q4_12", stage: 4, text: "¿Qué tipo de entorno universitario te imaginas?",
    type: "choice", weight: 1, info_gain_estimate: 5,
    options: [
      { text: "Campus integrado en la ciudad, vida urbana total", emoji: "🏙️", impacts: [{ dimension: "estilo_vida.urbano", delta: 2 },{ dimension: "estilo_vida.social", delta: 1 }] },
      { text: "Campus propio con buen ambiente estudiantil", emoji: "🏫", impacts: [{ dimension: "tags.ciudad_universitaria", delta: 3 }] },
      { text: "Lo que sea, mientras la carrera sea buena", emoji: "📋", impacts: [{ dimension: "ambicion.academica", delta: 1 }] },
    ],
  },
];

// A specialised comparison must not force an interest the student does not
// have. Append only: stored option indices from previous versions stay valid.
export const QUESTION_BANK: AdaptiveQuestion[] = BASE_QUESTIONS.map(question =>
  (question.stage === 2 || question.stage === 3) && !question.options.some(option => option.impacts.length === 0)
    ? { ...question, options: [...question.options, { text: 'Ninguna de estas opciones me representa', emoji: '↪️', impacts: [] }] }
    : question,
);

// Mapping for Q4.04 (comunidad) — text → value for profile
export const COMUNIDAD_MAPPING: Record<string, string> = {
  "Andalucía": "andalucia",
  "Aragón": "aragon",
  "Asturias": "asturias",
  "Baleares": "baleares",
  "Canarias": "canarias",
  "Cantabria": "cantabria",
  "Castilla y León": "castilla_leon",
  "Castilla-La Mancha": "castilla_la_mancha",
  "Cataluña": "cataluna",
  "Comunidad Valenciana": "comunidad_valenciana",
  "Extremadura": "extremadura",
  "Galicia": "galicia",
  "Madrid": "madrid",
  "Murcia": "murcia",
  "Navarra": "navarra",
  "País Vasco": "pais_vasco",
  "La Rioja": "la_rioja",
  "Ceuta": "ceuta",
  "Melilla": "melilla",
  "Vivo fuera de España": "extranjero",
};
