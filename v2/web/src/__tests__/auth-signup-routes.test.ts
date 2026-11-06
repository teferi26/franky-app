// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

type PasswordStrengthModule = typeof import("@/lib/password-strength");

const f = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  createUser: vi.fn(),
  profileUpdate: vi.fn(),
  sendVerification: vi.fn(),
  pwned: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: f.rateLimit }));
vi.mock("@/lib/email-verification", () => ({ sendVerificationEmail: f.sendVerification }));
vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabase: () => ({
    auth: { admin: { createUser: f.createUser } },
    from: () => ({ update: (values: unknown) => ({ eq: (_c: string, id: string) => f.profileUpdate(values, id) }) }),
  }),
}));
vi.mock("@/lib/password-strength", async (importOriginal) => {
  const original = await importOriginal<PasswordStrengthModule>();
  return { ...original, isPwnedPassword: f.pwned };
});

import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as signupOwner } from "@/app/api/auth/signup-propietario/route";

const GOOD_PASSWORD = "gato-azul-7"; // 11 caracteres, variados
const TEN = "abcdefghij"; // exactamente 10

function req(url: string, body: unknown) {
  return new Request(`https://franky.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  f.rateLimit.mockReset().mockResolvedValue({ ok: true });
  f.createUser.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  f.profileUpdate.mockReset().mockResolvedValue({ error: null });
  f.sendVerification.mockReset().mockResolvedValue(undefined);
  f.pwned.mockReset().mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const routes = [
  { name: "signup", post: signup, url: "/api/auth/signup", base: { name: "Ana", email: "ana@example.com" } },
  {
    name: "signup-propietario",
    post: signupOwner,
    url: "/api/auth/signup-propietario",
    base: { name: "Pisos Ana", email: "ana@example.com", phone: "600000000", city: "Alicante" },
  },
] as const;

describe.each(routes)("POST /api/auth/$name", ({ post, url, base }) => {
  it("acepta una contraseña de exactamente 10 caracteres", async () => {
    const res = await post(req(url, { ...base, password: TEN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(f.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ana@example.com", password: TEN, email_confirm: true })
    );
  });

  it("rechaza 9 caracteres con un mensaje en español que nombra el campo", async () => {
    const res = await post(req(url, { ...base, password: "abcdefghi" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_failed");
    expect(json.message).toMatch(/^Contraseña: Mínimo 10 caracteres/);
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas repetitivas y emails mal formados", async () => {
    expect((await post(req(url, { ...base, password: "aaaaaaaaaaaa" }))).status).toBe(400);
    expect((await post(req(url, { ...base, email: "no-es-email", password: GOOD_PASSWORD }))).status).toBe(400);
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it("rechaza en servidor una contraseña que aparece en filtraciones", async () => {
    f.pwned.mockResolvedValue(true);
    const res = await post(req(url, { ...base, password: GOOD_PASSWORD }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "pwned_password" });
    expect(f.pwned).toHaveBeenCalledWith(GOOD_PASSWORD, expect.objectContaining({ timeoutMs: expect.any(Number) }));
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it("devuelve la respuesta del rate limit sin crear la cuenta", async () => {
    f.rateLimit.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "rate_limited" }, { status: 429 }) });
    const res = await post(req(url, { ...base, password: GOOD_PASSWORD }));
    expect(res.status).toBe(429);
    expect(f.pwned).not.toHaveBeenCalled();
    expect(f.createUser).not.toHaveBeenCalled();
  });

  it("traduce un email ya registrado a 409 accionable", async () => {
    f.createUser.mockResolvedValue({ data: null, error: { code: "email_exists", message: "User already registered" } });
    const res = await post(req(url, { ...base, password: GOOD_PASSWORD }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "email_exists" });
  });

  it("no filtra el error interno de Supabase", async () => {
    f.createUser.mockResolvedValue({ data: null, error: { code: "unexpected_failure", message: "db exploded: secret detail" } });
    const res = await post(req(url, { ...base, password: GOOD_PASSWORD }));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("signup_failed");
    expect(text).not.toContain("secret detail");
  });

  it("da el alta aunque falle el correo de verificación (best-effort)", async () => {
    f.sendVerification.mockRejectedValue(new Error("resend down"));
    const res = await post(req(url, { ...base, password: GOOD_PASSWORD }));
    expect(res.status).toBe(200);
  });

  it("rechaza JSON inválido", async () => {
    const res = await post(
      new Request(`https://franky.test${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/signup: metadatos", () => {
  it("solo guarda claves de atribución permitidas", async () => {
    await signup(
      req("/api/auth/signup", {
        name: "Ana",
        email: "ana@example.com",
        password: GOOD_PASSWORD,
        attribution: { utm_source: "ig", role: "admin", is_admin: "true" },
      })
    );
    const meta = f.createUser.mock.calls[0][0].user_metadata as Record<string, string>;
    expect(meta).toMatchObject({ full_name: "Ana", utm_source: "ig" });
    expect(meta).not.toHaveProperty("role");
    expect(meta).not.toHaveProperty("is_admin");
  });
});

describe("POST /api/auth/signup-propietario: perfil", () => {
  it("marca el rol propietario y guarda teléfono y ciudad", async () => {
    await signupOwner(
      req("/api/auth/signup-propietario", {
        name: "Pisos Ana",
        email: "ana@example.com",
        password: GOOD_PASSWORD,
        phone: "600000000",
        city: "Alicante",
      })
    );
    expect(f.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ role: "propietario", onboarding_completed: true, phone: "600000000", city: "Alicante" }),
      "user-1"
    );
  });

  it("avisa si la cuenta se creó pero el perfil no se pudo especializar", async () => {
    f.profileUpdate.mockResolvedValue({ error: { message: "rls" } });
    const res = await signupOwner(
      req("/api/auth/signup-propietario", { name: "Pisos Ana", email: "ana@example.com", password: GOOD_PASSWORD })
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "profile_failed" });
  });
});
