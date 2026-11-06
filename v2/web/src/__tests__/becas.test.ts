import { describe, it, expect } from "vitest";
import { nivelMatchInfo, nivelMatches, tipoAyudaMatches, categoriasAyuda } from "@/lib/becas";

// Estos tests fijan el contrato del filtro de becas después del arreglo del
// 31-jul-2026. El fallo original: a un estudiante de la ESO le aparecían
// contratos postdoctorales (Ramón y Cajal, Margarita Salas, Marie
// Skłodowska-Curie…) porque sus tokens `postdoc` e `investigacion` no estaban
// en los alias de doctorado y la beca se tomaba por "sin nivel".

describe("nivelMatchInfo", () => {
  it("no cuela becas postdoctorales a estudiantes de ESO", () => {
    expect(nivelMatchInfo(["postdoc", "investigacion"], "eso")).toBe("no_match");
    expect(nivelMatchInfo(["postdoc"], "eso")).toBe("no_match");
    expect(nivelMatchInfo(["investigacion"], "fp_superior")).toBe("no_match");
    expect(nivelMatchInfo(["contrato_predoctoral"], "bachillerato")).toBe("no_match");
  });

  it("distingue un doctorado en curso de los contratos que ya exigen ser doctor", () => {
    expect(nivelMatchInfo(["postdoc", "investigacion"], "doctorado")).toBe("no_match");
    expect(nivelMatchInfo(["postdoc", "investigacion"], "postdoctorado")).toBe("match");
    expect(nivelMatchInfo(["contrato_predoctoral"], "doctorado")).toBe("match");
    expect(nivelMatchInfo(["contrato_predoctoral"], "postdoctorado")).toBe("no_match");
    expect(nivelMatchInfo(["investigacion"], "doctorado")).toBe("sin_datos");
  });

  it("una beca sin público objetivo no es 'compatible', es 'sin datos'", () => {
    expect(nivelMatchInfo([], "eso")).toBe("sin_datos");
    expect(nivelMatchInfo(null, "grado")).toBe("sin_datos");
    expect(nivelMatchInfo(undefined, "master")).toBe("sin_datos");
  });

  it("FP genérica vale para los dos grados; la específica no se mezcla", () => {
    expect(nivelMatchInfo(["fp"], "fp_medio")).toBe("match");
    expect(nivelMatchInfo(["fp"], "fp_superior")).toBe("match");
    expect(nivelMatchInfo(["formacion_profesional"], "fp_medio")).toBe("match");
    expect(nivelMatchInfo(["fp_grado_superior"], "fp_medio")).toBe("no_match");
    expect(nivelMatchInfo(["fp_grado_medio"], "fp_superior")).toBe("no_match");
  });

  it("las becas no ligadas a una etapa siguen saliendo a todos (Becas ADO)", () => {
    expect(nivelMatchInfo(["deportistas_alto_nivel"], "eso")).toBe("match");
    expect(nivelMatchInfo(["deportistas_alto_nivel"], "doctorado")).toBe("match");
  });

  it("los tokens universales valen para cualquier nivel", () => {
    expect(nivelMatchInfo(["todos"], "eso")).toBe("match");
    expect(nivelMatchInfo(["estudiantes"], "master")).toBe("match");
  });

  it("nivelMatches sigue siendo booleano y solo excluye no_match", () => {
    expect(nivelMatches(["postdoc"], "eso")).toBe(false);
    expect(nivelMatches([], "eso")).toBe(true);
    expect(nivelMatches(["grado"], "grado")).toBe(true);
  });
});

describe("tipoAyudaMatches", () => {
  it("'solo dinero' descarta contratos puros pero conserva las mixtas", () => {
    expect(tipoAyudaMatches(["contrato_predoctoral"], ["doctorado"], "dinero")).toBe(false);
    expect(tipoAyudaMatches(["contrato_predoctoral", "matricula"], ["doctorado"], "dinero")).toBe(true);
    expect(tipoAyudaMatches(["matricula", "manutencion"], ["grado"], "dinero")).toBe(true);
  });

  it("'solo dinero' no esconde becas sin coverage (filtra por exclusión)", () => {
    expect(tipoAyudaMatches([], [], "dinero")).toBe(true);
    expect(tipoAyudaMatches(null, null, "dinero")).toBe(true);
  });

  it("'prácticas' filtra en positivo", () => {
    expect(tipoAyudaMatches(["practicas_remuneradas"], ["grado"], "practicas")).toBe(true);
    expect(tipoAyudaMatches(["fp_dual"], ["fp"], "practicas")).toBe(true);
    expect(tipoAyudaMatches(["matricula"], ["grado"], "practicas")).toBe(false);
    expect(tipoAyudaMatches([], [], "practicas")).toBe(false);
  });

  it("'movilidad' la detecta por coverage y también por target_audience", () => {
    expect(tipoAyudaMatches(["movilidad_internacional"], [], "movilidad")).toBe(true);
    expect(tipoAyudaMatches([], ["grado", "erasmus"], "movilidad")).toBe(true);
    expect(tipoAyudaMatches(["viaje"], ["grado"], "movilidad")).toBe(true);
    expect(tipoAyudaMatches(["matricula"], ["grado"], "movilidad")).toBe(false);
  });

  it("'cualquiera' no filtra nada", () => {
    expect(tipoAyudaMatches(["contrato_predoctoral"], [], "cualquiera")).toBe(true);
    expect(tipoAyudaMatches(null, null, "cualquiera")).toBe(true);
  });
});

describe("categoriasAyuda", () => {
  it("un token puede pertenecer a varias categorías", () => {
    const c = categoriasAyuda(["viaje"], null);
    expect(c.has("movilidad")).toBe(true);
    expect(c.has("dinero")).toBe(true);
  });

  it("tokens desconocidos no inventan categoría", () => {
    expect(categoriasAyuda(["chorizo_token"], null).size).toBe(0);
  });
});
