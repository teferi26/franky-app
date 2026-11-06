"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  open: boolean;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * useToast — small wrapper around Radix Toast.
 *
 *   const toast = useToast();
 *   toast.error("No se pudo eliminar");
 *   toast.success("Cambios guardados", "Se han actualizado tus preferencias");
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, kind, title, description, open: true }]);
    },
    []
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      info: (t, d) => push("info", t, d),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider duration={5000} swipeDirection="right">
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            open={item.open}
            // Los errores permanecen mas tiempo (10 s) para dar margen a lectores
            // lentos o usuarios de lupa (WCAG 2.2.1). Radix pausa el temporizador
            // automaticamente con hover y foco.
            duration={item.kind === "error" ? 10000 : 5000}
            onOpenChange={(o) => {
              if (!o) {
                // Remove from state once the close animation finishes.
                setItems((prev) =>
                  prev.map((it) => (it.id === item.id ? { ...it, open: false } : it))
                );
                setTimeout(() => {
                  setItems((prev) => prev.filter((it) => it.id !== item.id));
                }, 200);
              }
            }}
            // Diseño v3: superficie blanca con borde hairline y la sombra
            // flotante; el tipo lo dice el icono suelto (sin cuadrado tintado).
            // Entra deslizando desde abajo (keyframe del sistema) y se apaga
            // con una transición de opacidad al cerrarse: las clases
            // `animate-in` de antes no existían en este proyecto.
            className={cn(
              "group pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-float",
              "transition-[opacity,transform] duration-200 ease-[var(--ease-out-quart)]",
              "data-[state=open]:animate-sheet-in data-[state=closed]:translate-y-2 data-[state=closed]:opacity-0",
              "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-full data-[swipe=end]:opacity-0"
            )}
          >
            {item.kind === "success" && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />}
            {item.kind === "error" && <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" aria-hidden="true" />}
            {item.kind === "info" && <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-text-primary">
                {item.title}
              </ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-0.5 text-[13px] leading-relaxed text-text-muted">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              className="-m-1.5 shrink-0 rounded-lg p-1.5 text-text-muted transition-colors duration-200 hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/50"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport
          // El offset de la barra de cookies (publicado en <html> por CookieConsent)
          // levanta los toasts para que no choquen con la barra ni con los widgets
          // flotantes en movil. Mismo patron que AuthGatePopup.
          style={{ bottom: "calc(var(--cookie-bar-offset, 0px) + var(--tabbar-offset, 0px) + 1rem)" }}
          className="fixed right-4 z-[9999] flex max-h-screen w-full max-w-sm flex-col gap-2 p-0 outline-none"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
