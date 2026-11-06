import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ThemeToggle from "@/components/ThemeToggle";
import { syncThemeFromStorage, THEME_KEY } from "@/lib/theme-switch";

/**
 * La página monta el selector de tema hasta tres veces (barra superior, menú
 * de móvil y pie). Con estado local, cambiar el tema en uno dejaba a los otros
 * marcando la opción antigua: el sitio se ponía oscuro y el pie seguía
 * diciendo "Automático". Aquí se comprueba que los tres van a una.
 */
function marcados() {
  return screen
    .getAllByRole("radio")
    .filter((r) => r.getAttribute("aria-checked") === "true")
    .map((r) => r.getAttribute("aria-label"));
}

describe("selector de tema", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    // El store vive en el módulo y sobrevive entre tests: se relee lo guardado.
    act(() => syncThemeFromStorage());
  });

  it("mantiene a la vez todos los selectores de la página", () => {
    render(
      <>
        <ThemeToggle />
        <ThemeToggle />
        <ThemeToggle />
      </>
    );

    // Sin preferencia guardada, los tres arrancan en automático.
    expect(marcados()).toEqual(["Automático", "Automático", "Automático"]);

    // Se cambia en el PRIMERO (la barra superior).
    fireEvent.click(screen.getAllByRole("radio", { name: "Oscuro" })[0]);
    expect(marcados()).toEqual(["Oscuro", "Oscuro", "Oscuro"]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // Y ahora en el ÚLTIMO (el pie): los de arriba tienen que seguirlo.
    fireEvent.click(screen.getAllByRole("radio", { name: "Claro" })[2]);
    expect(marcados()).toEqual(["Claro", "Claro", "Claro"]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("guarda la preferencia y quita el atributo al volver a automático", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    // En automático manda el media query del CSS, así que el atributo se quita.
    fireEvent.click(screen.getByRole("radio", { name: "Automático" }));
    expect(localStorage.getItem(THEME_KEY)).toBe("auto");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("arranca con la preferencia ya guardada", () => {
    localStorage.setItem(THEME_KEY, "dark");
    act(() => syncThemeFromStorage());

    render(<ThemeToggle />);
    expect(marcados()).toEqual(["Oscuro"]);
  });

  it("no revienta si el almacenamiento está bloqueado", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("acceso denegado");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("acceso denegado");
      });

    act(() => syncThemeFromStorage());
    render(<ThemeToggle />);
    expect(marcados()).toEqual(["Automático"]);

    // El cambio se aplica igual, aunque no se pueda recordar.
    fireEvent.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(marcados()).toEqual(["Oscuro"]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
