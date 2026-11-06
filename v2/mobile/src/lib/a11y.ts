// ─── Accesibilidad compartida ────────────────────────────────────────────
// Helpers usados por el kit de UI (src/components/ui.tsx, Screen.tsx) para
// respetar las preferencias de accesibilidad del sistema.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Hook que refleja si el usuario tiene activado "reducir movimiento" en el
 * sistema (iOS: Ajustes > Accesibilidad > Movimiento; Android: opción
 * equivalente). Las animaciones del kit deben omitirse (quedarse ya en el
 * estado final, sin animar) cuando esto es true. Los haptics NO se ven
 * afectados por esta preferencia: solo aplica a movimiento/transiciones.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduce(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value: boolean) => {
      setReduce(value);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduce;
}

/**
 * Tope de escalado de fuente para los textos del kit: permite que crezcan con
 * los ajustes del sistema (Dynamic Type / tamaño de letra) sin romper el
 * layout de botones, chips, etc. en tamaños extremos.
 */
export const MAX_FONT_SCALE = 1.6;
