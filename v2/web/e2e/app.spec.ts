import { test, expect } from "@playwright/test";

const go = { waitUntil: "commit" as const };

// ── All pages load ──────────────────────────────────────────────
test.describe("Páginas públicas cargan", () => {
  const pages = [
    "/",
    "/universidades",
    "/carreras",
    "/becas",
    "/alojamiento",
    "/ocio",
    "/noticias",
    "/notas-corte",
    "/buscar",
    "/test-vocacional",
    "/pricing",
    "/contacto",
    "/privacidad",
    "/terminos",
    "/cookies",
    "/login",
    "/registro",
  ];

  for (const path of pages) {
    test(`${path} → status < 400`, async ({ page }) => {
      const res = await page.goto(path, go);
      expect(res?.status()).toBeLessThan(400);
    });
  }
});

// ── Homepage & navigation ────────────────────────────────────
test("homepage: navbar, h1, footer, logo link", async ({ page }) => {
  await page.goto("/", go);
  await expect(page.getByText("Franky").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('nav a[href="/universidades"]').first()).toBeVisible();
  await expect(page.locator('nav a[href="/notas-corte"]').first()).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.locator("h1").first()).toBeVisible();
});

test("footer links legales funcionan", async ({ page }) => {
  await page.goto("/", go);
  const footer = page.locator("footer");
  await expect(footer.locator('a[href="/privacidad"]')).toBeVisible();
  await expect(footer.locator('a[href="/terminos"]')).toBeVisible();
  await expect(footer.locator('a[href="/cookies"]')).toBeVisible();
  // click one to verify navigation
  await page.locator('footer a[href="/privacidad"]').click();
  await page.waitForURL(/\/privacidad/);
  await expect(page.locator("h1")).toContainText(/Privacidad/i);
});

// ── Content pages ────────────────────────────────────────────
// El listado /carreras se fusionó en /notas-corte (agosto 2026); /carreras
// redirige ahí con un 308 y este test cubre las dos cosas: el redirect y el
// listado en su nueva casa.
test("notas de corte: listado de carreras (y redirect desde /carreras)", async ({ page }) => {
  await page.goto("/carreras", go);
  await expect(page).toHaveURL(/\/notas-corte/);
  await expect(page.locator("h1")).toContainText(/Notas de Corte/i);
  await expect(page.getByText(/con nota publicada/)).toBeVisible({ timeout: 20000 });
});

test("universidades: lista", async ({ page }) => {
  await page.goto("/universidades", go);
  await expect(page.locator("h1")).toContainText(/Universidades/);
  await expect(page.getByText("universidades encontradas")).toBeVisible({ timeout: 20000 });
});

test("becas: carga", async ({ page }) => {
  await page.goto("/becas", go);
  await expect(page.locator("h1")).toContainText(/Becas/);
});

test("alojamiento: carga", async ({ page }) => {
  await page.goto("/alojamiento", go);
  await expect(page.locator("h1")).toContainText(/Alojamiento/);
});

test("pricing: 3 planes + FAQ", async ({ page }) => {
  await page.goto("/pricing", go);
  await expect(page.getByText("Gratis").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Pro").first()).toBeVisible();
  await expect(page.getByText("Premium").first()).toBeVisible();
  await expect(page.getByText("Preguntas frecuentes").first()).toBeVisible();
});

test("notas-corte: tabla o buscador", async ({ page }) => {
  await page.goto("/notas-corte", go);
  await expect(
    page.locator("table, input[placeholder*='Buscar carrera']").first()
  ).toBeVisible({ timeout: 20000 });
});

// ── Test vocacional ──────────────────────────────────────────
test("test-vocacional: intro + botón empezar", async ({ page }) => {
  await page.goto("/test-vocacional", go);
  // Page fetches questions from Supabase → wait for content
  await expect(page.getByText("RIASEC")).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: /empezar test/i })
  ).toBeVisible();
});

// ── Búsqueda ──────────────────────────────────────────────────
// /buscar se retiró (búsqueda pobre y sin enlaces entrantes): cada catálogo
// tiene el suyo. Aquí se comprueba el buscador del catálogo de carreras.
test("buscar: el catálogo de carreras tiene buscador", async ({ page }) => {
  await page.goto("/notas-corte", go);
  await expect(
    page.locator('input[placeholder*="Buscar"]').first()
  ).toBeVisible({ timeout: 15000 });
});

// ── Contacto ──────────────────────────────────────────────────
test("contacto: formulario completo", async ({ page }) => {
  await page.goto("/contacto", go);
  await expect(page.locator("h1")).toContainText(/Contacto/);
  await expect(page.locator('input[name="nombre"]')).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('textarea[name="mensaje"]')).toBeVisible();
});

// ── Auth pages ───────────────────────────────────────────────
test("login: formulario + enlace registro", async ({ page }) => {
  await page.goto("/login", go);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  // navigate to registro
  await page.getByRole("link", { name: /regístrate/i }).click();
  await page.waitForURL(/\/registro/);
});

test("registro: campos requeridos + enlace login", async ({ page }) => {
  await page.goto("/registro", go);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await page.getByRole("link", { name: /iniciar sesión/i }).click();
  await page.waitForURL(/\/login/);
});

// ── Protected pages ──────────────────────────────────────────
test("favoritos requiere login", async ({ page }) => {
  await page.goto("/favoritos", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  const body = await page.textContent("body");
  expect(
    body?.includes("sesión") || body?.includes("Iniciar") || page.url().includes("login")
  ).toBeTruthy();
});

test("chats requiere login", async ({ page }) => {
  await page.goto("/chats", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  const body = await page.textContent("body");
  expect(
    body?.includes("sesión") ||
      body?.includes("Mensajería") ||
      body?.includes("Iniciar") ||
      page.url().includes("login")
  ).toBeTruthy();
});

// ── Responsive ───────────────────────────────────────────────
test("responsive: navbar colapsa en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/", go);
  const menuButton = page
    .locator("button")
    .filter({ has: page.locator("svg") })
    .first();
  await expect(menuButton).toBeVisible();
});

test("responsive: sin scroll horizontal en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body");
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
});

// ── Accesibilidad ────────────────────────────────────────────
test("accesibilidad: imágenes tienen alt", async ({ page }) => {
  await page.goto("/", go);
  const images = page.locator("img");
  const count = await images.count();
  for (let i = 0; i < Math.min(count, 10); i++) {
    const alt = await images.nth(i).getAttribute("alt");
    expect(alt).not.toBeNull();
  }
});

test("accesibilidad: inputs tienen labels", async ({ page }) => {
  await page.goto("/login", go);
  const inputs = page.locator("input:not([type='hidden'])");
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    const ariaLabel = await input.getAttribute("aria-label");
    const placeholder = await input.getAttribute("placeholder");
    const id = await input.getAttribute("id");
    const hasLabel =
      ariaLabel ||
      placeholder ||
      (id && (await page.locator(`label[for="${id}"]`).count()) > 0);
    expect(hasLabel).toBeTruthy();
  }
});

// ── SEO ──────────────────────────────────────────────────────
test("SEO: homepage tiene title", async ({ page }) => {
  await page.goto("/", go);
  await expect(page).toHaveTitle(/Franky/);
});

// ── Static files ─────────────────────────────────────────────
test("robots.txt accesible", async ({ page }) => {
  const res = await page.goto("/robots.txt", go);
  expect(res?.status()).toBe(200);
});

test("sitemap.xml accesible", async ({ page }) => {
  const res = await page.goto("/sitemap.xml", go);
  expect(res?.status()).toBe(200);
});
