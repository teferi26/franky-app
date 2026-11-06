"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  getServerTheme,
  getTheme,
  setTheme,
  subscribeTheme,
  syncThemeFromStorage,
  type ThemePref,
} from "@/lib/theme-switch";

/**
 * Selector de tema: claro, oscuro o automático.
 *
 * La preferencia NO vive aquí, vive en lib/theme-switch: la página monta este
 * selector hasta tres veces (barra superior, menú de móvil y pie) y con estado
 * local cada copia marcaba una opción distinta en cuanto se tocaba una. Con el
 * store compartido, cambiar el tema en cualquiera de ellos repinta todos.
 *
 * El caso "automático" (el de casi todo el mundo) no depende de este
 * componente: lo resuelve el `@media (prefers-color-scheme: dark)` de
 * globals.css, sin JavaScript y sin fogonazo al cargar.
 */
const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "auto", label: "Automático", Icon: Monitor },
];

export default function ThemeToggle({ className = "" }: { className?: string }) {
  // getServerTheme devuelve null: el HTML del servidor no sabe la preferencia,
  // así que el primer render coincide y la hidratación no se rompe. React
  // cambia a la preferencia real justo después de montar.
  const pref = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  useEffect(() => {
    // theme-boot.js ya aplicó el tema antes de pintar, pero la hidratación de
    // React puede reconciliar los atributos de <html> y dejarlo sin
    // `data-theme`. Esto lo restituye sin que se vea el cambio.
    syncThemeFromStorage();
    // Un cambio hecho en otra pestaña llega por `storage`.
    const onStorage = () => syncThemeFromStorage();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // En "automático" se sigue al sistema en vivo. El CSS ya lo hace solo; esto
  // cubre el `colorScheme` de los controles nativos.
  useEffect(() => {
    if (pref !== "auto") return;
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("auto");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  if (pref === null) {
    // Hueco del mismo tamaño para que no salte el layout al hidratar.
    return <div className={cn("h-9 w-[104px]", className)} aria-hidden="true" />;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-bg-secondary p-0.5",
        className
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-95",
            pref === value
              ? "bg-bg-primary text-text-primary shadow-[0_1px_2px_rgba(18,16,25,0.10)]"
              : "text-text-muted hover:text-text-primary"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
