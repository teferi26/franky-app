import * as ReactNative from 'react-native';

/**
 * Ejecuta `task` cuando termina la animación en curso (cambio de pestaña,
 * push de pantalla). Así lo secundario no compite con el primer pintado.
 * Devuelve una función para cancelarlo.
 */
export function afterInteractions(task: () => void): () => void {
  const manager = (ReactNative as { InteractionManager?: typeof ReactNative.InteractionManager }).InteractionManager;
  if (manager?.runAfterInteractions) {
    const handle = manager.runAfterInteractions(task);
    return () => { handle?.cancel?.(); };
  }
  const timer = setTimeout(task, 0);
  return () => clearTimeout(timer);
}
