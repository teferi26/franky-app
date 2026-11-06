// ─── Toasts: avisos breves que no interrumpen ───────────────────────────────
// Sustituyen a Alert.alert para confirmaciones ("Guardado", "Publicado") y
// errores leves: un Alert modal para decir "hecho" obliga a un toque extra y
// hace que la app se sienta torpe. El host vive en app/_layout.tsx
// (src/components/Toast.tsx) y aquí solo está el bus de mensajes.
export type ToastKind = 'success' | 'error' | 'info';
export type ToastMsg = { id: number; kind: ToastKind; title: string; body?: string };

const listeners = new Set<(m: ToastMsg) => void>();
let seq = 0;

/** toast('Guardado') · toast('Guardado', 'Se ve en tu perfil') · toast('Ups', { kind: 'error' }) */
export function toast(title: string, opts: string | { kind?: ToastKind; body?: string } = {}) {
  const o = typeof opts === 'string' ? { body: opts } : opts;
  const m: ToastMsg = { id: ++seq, kind: o.kind ?? 'success', title, body: o.body };
  for (const l of listeners) l(m);
}

export const toastError = (title: string, body?: string) => toast(title, { kind: 'error', body });
export const toastInfo = (title: string, body?: string) => toast(title, { kind: 'info', body });

export function onToast(listener: (m: ToastMsg) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
