"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: string;
  termsLink?: boolean;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * useConfirm — drop-in async replacement for window.confirm().
 *
 *   const confirm = useConfirm();
 *   if (!await confirm({ title: "¿Eliminar?", description: "No se puede deshacer", variant: "danger" })) return;
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within <ConfirmProvider>");
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOpts(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const ctxValue = useMemo(() => confirm, [confirm]);

  const isDanger = opts?.variant === "danger";

  return (
    <ConfirmContext.Provider value={ctxValue}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) settle(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            {/* v3: el icono de peligro va suelto, en el color de error, sin
                cuadrado tintado detrás. Botones del sistema. */}
            <div className="flex items-start gap-3">
              {isDanger && (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle>{opts?.title ?? ""}</DialogTitle>
                {opts?.description && (
                  <DialogDescription className="mt-1.5">
                    {opts.description}
                    {opts.termsLink && <> <a href="/terminos#uso-aceptable" target="_blank" rel="noopener noreferrer" className="underline">Normas y términos de uso</a> · <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline">Política de privacidad</a>.</>}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => settle(false)}>
              {opts?.cancelText ?? "Cancelar"}
            </Button>
            <Button
              type="button"
              variant={isDanger ? "destructive" : "dark"}
              onClick={() => settle(true)}
            >
              {opts?.confirmText ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
