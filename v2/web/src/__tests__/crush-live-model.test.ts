import { describe, expect, it } from "vitest";
import {
  CRUSH_LIVE_STATE_REASONS,
  EMPTY_ANSWERS,
  actionLabel,
  candidatePhotos,
  classifySwipeError,
  isUuid,
  profileToDraft,
  rpcErrorCopy,
  statePresentation,
  validateProfileDraft,
  type CrushLiveCandidate,
  type CrushLiveProfileDraft,
} from "@/app/crush/live/model";
import { toWebNotificationPath } from "@/lib/notification-links";

const validDraft: CrushLiveProfileDraft = {
  goal: "conocer",
  preferredGenders: ["mujer"],
  ageMin: 20,
  ageMax: 30,
  answers: { ...EMPTY_ANSWERS },
};

describe("contrato de estados de Crush Live", () => {
  it("mantiene exactamente las razones que devuelve el backend", () => {
    expect(CRUSH_LIVE_STATE_REASONS).toEqual([
      "event_not_found",
      "not_official",
      "disabled",
      "event_closed",
      "not_participant",
      "student_verification_required",
      "age_required",
      "missing_gender",
      "profile_unavailable",
      "photo_required",
    ]);
  });

  it.each(CRUSH_LIVE_STATE_REASONS)(
    "ofrece una explicación útil para %s",
    (reason) => {
      const presentation = statePresentation(reason, "evento-1");
      expect(presentation.title.length).toBeGreaterThan(0);
      expect(presentation.description.length).toBeGreaterThan(0);
    }
  );

  it("lleva al evento cuando la persona todavía no participa", () => {
    expect(statePresentation("not_participant", "evento-1")).toMatchObject({
      ctaLabel: "Ver evento",
      ctaHref: "/eventos/evento-1",
    });
  });
});

describe("perfil de Crush Live", () => {
  it("crea un borrador seguro cuando todavía no existe perfil", () => {
    expect(profileToDraft(null)).toEqual({
      goal: null,
      preferredGenders: [],
      ageMin: 18,
      ageMax: 35,
      answers: EMPTY_ANSWERS,
    });
  });

  it("acepta un cuestionario completo con consentimiento", () => {
    expect(validateProfileDraft(validDraft, true)).toBeNull();
  });

  it("exige objetivo, preferencias, rango válido y consentimiento", () => {
    expect(
      validateProfileDraft({ ...validDraft, goal: null }, true)
    ).toContain("qué buscas");
    expect(
      validateProfileDraft({ ...validDraft, preferredGenders: [] }, true)
    ).toContain("a quién");
    expect(
      validateProfileDraft({ ...validDraft, ageMin: 17 }, true)
    ).toContain("entre 18 y 99");
    expect(validateProfileDraft(validDraft, false)).toContain("Confirma");
  });

  it("rechaza respuestas fuera de la escala de afinidad", () => {
    expect(
      validateProfileDraft(
        {
          ...validDraft,
          answers: { ...validDraft.answers, spontaneity: 6 },
        },
        true
      )
    ).toContain("cinco preguntas");
  });
});

describe("fotos de candidato", () => {
  const candidate: CrushLiveCandidate = {
    id: "persona-1",
    full_name: "Alex",
    avatar_url: "https://example.com/avatar.jpg",
    photos: null,
    age: 23,
    career: null,
    bio: null,
    interests: null,
    compatibility: 84,
    compatibility_reasons: [],
  };

  it("usa las fotos del perfil antes que el avatar", () => {
    expect(
      candidatePhotos({
        ...candidate,
        photos: ["https://example.com/one.jpg"],
      })
    ).toEqual(["https://example.com/one.jpg"]);
  });

  it("usa el avatar como respaldo", () => {
    expect(candidatePhotos(candidate)).toEqual([
      "https://example.com/avatar.jpg",
    ]);
  });

  it("descarta fotos vacías y cae al avatar", () => {
    expect(candidatePhotos({ ...candidate, photos: ["", ""] })).toEqual([
      "https://example.com/avatar.jpg",
    ]);
  });
});

describe("estados que enlazan a donde se arreglan", () => {
  it("lleva a verificar el correo de estudiante", () => {
    expect(statePresentation("student_verification_required", null).ctaHref).toBe(
      "/perfil/verificar-estudiante"
    );
  });

  it.each(["age_required", "missing_gender", "photo_required", "profile_unavailable"] as const)(
    "lleva al perfil cuando falta %s",
    (reason) => {
      expect(statePresentation(reason, null).ctaHref).toBe("/perfil");
    }
  );

  it("no ofrece enlace cuando el evento ya cerró (el historial sigue)", () => {
    expect(statePresentation("event_closed", "evento-1").ctaHref).toBeUndefined();
  });

  it("no usa guiones largos en ningún texto", () => {
    for (const reason of [...CRUSH_LIVE_STATE_REASONS, null]) {
      const { title, description, ctaLabel } = statePresentation(reason, "e");
      expect(`${title}${description}${ctaLabel ?? ""}`).not.toMatch(/[–—]/);
    }
  });
});

describe("validación de UUID del eventId de la URL", () => {
  it("acepta un UUID v4 válido", () => {
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
  });

  it("rechaza basura, vacío y nulos", () => {
    expect(isUuid("evento-1")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c33011")).toBe(false);
  });
});

describe("clasificación de errores del swipe", () => {
  it("distingue las familias que el backend puede lanzar", () => {
    expect(classifySwipeError("idempotency_stale")).toBe("stale");
    expect(classifySwipeError("idempotency_conflict")).toBe("conflict");
    expect(classifySwipeError("target_not_available")).toBe("target_gone");
    expect(classifySwipeError("swipe_already_decided")).toBe("target_gone");
    expect(classifySwipeError("event_closed")).toBe("access_changed");
    expect(classifySwipeError("crush_live_unavailable")).toBe("access_changed");
    expect(classifySwipeError("not_participant")).toBe("access_changed");
    expect(classifySwipeError("profile_not_eligible")).toBe("access_changed");
    expect(classifySwipeError("crush_live_opt_in_required")).toBe("access_changed");
    expect(classifySwipeError("rate_limit_exceeded")).toBe("rate_limited");
    expect(classifySwipeError("auth_required")).toBe("auth");
  });

  it("trata un fallo de red como recuperable y lo demás como desconocido", () => {
    expect(classifySwipeError("TypeError: Failed to fetch")).toBe("network");
    expect(classifySwipeError("NetworkError when attempting to fetch")).toBe("network");
    expect(classifySwipeError("Load failed")).toBe("network");
    expect(classifySwipeError("something odd")).toBe("unknown");
    expect(classifySwipeError(undefined)).toBe("unknown");
  });

  it("ignora mayúsculas y prefijos de Postgres", () => {
    expect(classifySwipeError("ERROR: Rate_Limit_Exceeded")).toBe("rate_limited");
  });
});

describe("textos de error para la persona", () => {
  it("nunca enseña el token crudo", () => {
    for (const token of [
      "rate_limit_exceeded",
      "event_closed",
      "crush_live_unavailable",
      "not_participant",
      "profile_not_eligible",
      "crush_live_opt_in_required",
      "target_not_available",
      "swipe_already_decided",
      "auth_required",
      "invalid_age_range",
      "event_not_found",
    ]) {
      const copy = rpcErrorCopy(token, "Algo falló.");
      expect(copy).not.toContain(token);
      expect(copy).not.toMatch(/[–—]/);
    }
  });

  it("añade la pista de conexión al fallback si huele a red", () => {
    expect(rpcErrorCopy("Failed to fetch", "No pudimos confirmar.")).toBe(
      "No pudimos confirmar. Revisa también tu conexión."
    );
    expect(rpcErrorCopy("kaboom", "No pudimos confirmar.")).toBe("No pudimos confirmar.");
  });

  it("nombra las acciones como en los botones", () => {
    expect(actionLabel("like")).toBe("Me gusta");
    expect(actionLabel("pass")).toBe("Paso");
  });
});

describe("rutas de notificación (vocabulario móvil -> web)", () => {
  it("traduce /crush-live conservando el eventId", () => {
    expect(toWebNotificationPath("/crush-live?eventId=abc")).toBe(
      "/crush/live?eventId=abc"
    );
    expect(toWebNotificationPath("/crush-live")).toBe("/crush/live");
  });

  it("mantiene la traducción antigua de /ligar", () => {
    expect(toWebNotificationPath("/ligar")).toBe("/crush");
    expect(toWebNotificationPath("/ligar/matches")).toBe("/crush/matches");
  });

  it("no confunde prefijos parecidos", () => {
    expect(toWebNotificationPath("/crush-liveX")).toBe("/crush-liveX");
    expect(toWebNotificationPath("/ligarme")).toBe("/ligarme");
  });

  it("deja pasar rutas internas normales y bloquea externas", () => {
    expect(toWebNotificationPath("/chats?chat=1")).toBe("/chats?chat=1");
    expect(toWebNotificationPath("https://evil.example")).toBeNull();
    expect(toWebNotificationPath("//evil.example")).toBeNull();
    expect(toWebNotificationPath("")).toBeNull();
    expect(toWebNotificationPath(undefined)).toBeNull();
  });
});
