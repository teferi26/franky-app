// ─── Tipos de Franky Tap ────────────────────────────────────────────────────
// Nearby Interaction mide distancia entre iPhone compatibles en primer plano.
// La capacidad se consulta al sistema: no se presupone por el nombre del modelo.
// Bluetooth/Multipeer sin medición precisa solo informan de presencia. La UI
// utiliza QR y confirmación mutua en ese caso; no inventa centímetros ni likes.

/** Qué puede hacer este teléfono. `precise` distingue banda ultraancha de Bluetooth. */
export type TapCapability = {
  /** Puede iniciar descubrimiento. Los permisos de iOS pueden pedirse después. */
  available: boolean;
  /** El dispositivo admite medición precisa; aún requiere permisos y otro par. */
  precise: boolean;
  /** Por qué no está disponible, para poder explicarlo en pantalla. */
  reason: TapUnavailableReason;
};

export type TapUnavailableReason =
  /** Disponible, sin problema. */
  | 'ok'
  /** La versión del sistema es anterior a la que hace falta. */
  | 'unsupported_os'
  /** El teléfono no tiene el chip o la radio necesarios. */
  | 'no_hardware'
  /** Falta un permiso que la persona tiene que conceder. */
  | 'no_permission'
  /** El Bluetooth está apagado o el sistema no deja usarlo en este momento. */
  | 'radio_off'
  /** Cualquier otro motivo (el módulo nativo no está en esta compilación). */
  | 'unavailable';

/** Un teléfono ajeno visto cerca. Se emite muchas veces por segundo mientras dura. */
export type TapSighting = {
  /** Testigo caduco de la otra persona. El servidor lo traduce a una identidad. */
  token: string;
  /** Distancia estimada en centímetros. Null cuando solo hay Bluetooth y no se puede estimar. */
  distanceCm: number | null;
  /** True si la medida viene de banda ultraancha. */
  precise: boolean;
  /** Potencia de señal Bluetooth (dBm) cuando la detección viene por esa vía. */
  rssi?: number | null;
};

/** Acercamiento confirmado: los dos teléfonos están lo bastante juntos. */
export type TapDetected = {
  token: string;
  distanceCm: number | null;
  precise: boolean;
  rssi?: number | null;
};

export type TapError = {
  code: string;
  message: string;
};

export type FrankyTapEvents = {
  /** Se ve a alguien cerca, aún sin confirmar el gesto. Sirve para la pista de "acércalo un poco más". */
  onSighting: (sighting: TapSighting) => void;
  /** El acercamiento cuenta: hay que registrarlo en el servidor. */
  onTap: (tap: TapDetected) => void;
  /** Fallo de radio o de permisos mientras la búsqueda estaba activa. */
  onError: (error: TapError) => void;
};
