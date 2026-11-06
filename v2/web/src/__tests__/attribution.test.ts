import { beforeEach, describe, expect, it } from "vitest";
import { appendAttributionToUrl, captureFromUrlIfFirstTouch } from "@/lib/attribution";

const STORAGE_KEY = "franky_attribution";

function storeAttribution(data: Record<string, string>) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ capturedAt: Date.now(), data })
  );
}

describe("appendAttributionToUrl", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reinyecta los UTMs guardados en una URL sin campaña", () => {
    storeAttribution({
      utm_source: "pau",
      utm_medium: "ambassador",
      utm_campaign: "leads",
      utm_content: "new",
    });
    const out = new URL(appendAttributionToUrl("https://franky.es/registro"));
    expect(out.searchParams.get("utm_source")).toBe("pau");
    expect(out.searchParams.get("utm_medium")).toBe("ambassador");
    expect(out.searchParams.get("utm_campaign")).toBe("leads");
    expect(out.searchParams.get("utm_content")).toBe("new");
    expect(out.pathname).toBe("/registro");
  });

  it("no toca una URL que ya trae utm_source (first-touch de la URL manda)", () => {
    storeAttribution({ utm_source: "pau", utm_medium: "ambassador" });
    const url = "https://franky.es/?utm_source=tafa&utm_medium=ambassador";
    expect(appendAttributionToUrl(url)).toBe(url);
  });

  it("devuelve la URL tal cual si no hay atribución guardada", () => {
    const url = "https://franky.es/login";
    expect(appendAttributionToUrl(url)).toBe(url);
  });

  it("devuelve la URL tal cual si lo guardado no tiene UTMs (solo referrer)", () => {
    storeAttribution({ signup_referrer: "https://google.com/" });
    const url = "https://franky.es/login";
    expect(appendAttributionToUrl(url)).toBe(url);
  });

  it("ignora atribución caducada (más de 30 días)", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        capturedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
        data: { utm_source: "pau" },
      })
    );
    const url = "https://franky.es/login";
    expect(appendAttributionToUrl(url)).toBe(url);
  });
});

describe("captureFromUrlIfFirstTouch con cookie de link corto (franky_landing_utm)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "franky_landing_utm=; Path=/; Max-Age=0";
    window.history.replaceState(null, "", "/");
  });

  it("consume la cookie del middleware como first-touch y la borra", () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        utm_source: "tafa",
        utm_medium: "ambassador",
        utm_campaign: "leads",
        utm_content: "tafa",
        signup_landing_path: "/tafa",
      })
    );
    document.cookie = `franky_landing_utm=${payload}; Path=/`;

    captureFromUrlIfFirstTouch();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.data.utm_source).toBe("tafa");
    expect(stored.data.utm_medium).toBe("ambassador");
    expect(stored.data.utm_content).toBe("tafa");
    expect(stored.data.signup_landing_path).toBe("/tafa");
    expect(document.cookie.includes("franky_landing_utm=e")).toBe(false);
  });

  it("captura el tag de vídeo (utm_term) que viaja en la cookie", () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        utm_source: "tafa",
        utm_medium: "ambassador",
        utm_term: "reel-biblioteca",
        signup_landing_path: "/tafa",
      })
    );
    document.cookie = `franky_landing_utm=${payload}; Path=/`;

    captureFromUrlIfFirstTouch();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.data.utm_term).toBe("reel-biblioteca");
  });

  it("los utm_* de la URL mandan sobre la cookie", () => {
    const payload = encodeURIComponent(
      JSON.stringify({ utm_source: "pau", utm_medium: "ambassador" })
    );
    document.cookie = `franky_landing_utm=${payload}; Path=/`;
    window.history.replaceState(null, "", "/?utm_source=qr-campus&utm_medium=qr");

    captureFromUrlIfFirstTouch();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.data.utm_source).toBe("qr-campus");
  });

  it("no sobrescribe un first-touch previo con campaña", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ capturedAt: Date.now(), data: { utm_source: "tafa", utm_medium: "ambassador" } })
    );
    const payload = encodeURIComponent(
      JSON.stringify({ utm_source: "pau", utm_medium: "ambassador" })
    );
    document.cookie = `franky_landing_utm=${payload}; Path=/`;

    captureFromUrlIfFirstTouch();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.data.utm_source).toBe("tafa");
  });

  it("ignora una cookie corrupta sin romper", () => {
    document.cookie = "franky_landing_utm=%7Bmalformed; Path=/";
    expect(() => captureFromUrlIfFirstTouch()).not.toThrow();
  });
});

describe("captureFromUrlIfFirstTouch + appendAttributionToUrl (round-trip webview)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lo capturado en el webview se arrastra al enlace del navegador real", () => {
    // Aterrizaje típico desde el link corto /new (redirect con UTMs de Pau).
    window.history.replaceState(
      null,
      "",
      "/?utm_source=pau&utm_medium=ambassador&utm_campaign=leads&utm_content=new"
    );
    captureFromUrlIfFirstTouch();

    // El usuario acaba en /registro (sin UTMs en la URL) y salta al navegador.
    const out = new URL(
      appendAttributionToUrl("http://localhost:3000/registro")
    );
    expect(out.searchParams.get("utm_source")).toBe("pau");
    expect(out.searchParams.get("utm_content")).toBe("new");
  });
});
