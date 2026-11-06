const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

// Capturas de componentes nativos con adaptador web local, sin guardar datos.
const root = path.resolve(__dirname, "../..");
const webRequire = createRequire(path.join(root, "web/package.json"));
const { chromium } = webRequire("playwright");
const output = path.join(root, "tmp/pro-native-preview");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 844 : 1000 },
      });
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const capture = async (name) => {
        await page.waitForTimeout(300);
        await page.screenshot({
          path: path.join(output, `${name}-${width}.png`),
        });
      };
      await page.goto("http://127.0.0.1:3111", { waitUntil: "networkidle" });
      await page.getByText("Tu día, de un vistazo", { exact: true }).waitFor();
      await capture("agenda");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      await page.getByRole("button", { name: /^Lucía Soler,/ }).click();
      await page.getByText("Detalle de la cita", { exact: true }).waitFor();
      await capture("booking");
      await page
        .getByRole("button", { name: "Registrar cobro externo", exact: true })
        .click();
      await page
        .getByText("Cobro recibido fuera de Franky", { exact: true })
        .waitFor();
      await capture("payment");
      await page.reload({ waitUntil: "networkidle" });
      await page
        .getByRole("button", { name: "Día siguiente", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Nueva cita", exact: true })
        .click();
      await page.getByText("Nombre del cliente", { exact: true }).waitFor();
      await capture("new");
      await page
        .getByText("Nota para el equipo", { exact: true })
        .scrollIntoViewIfNeeded();
      await capture("new-fields");
      results.push({ width, overflow, errors });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const report = {
    source:
      "Componentes reales de React Native, renderizados con React Native Web y lectura de SQL local. Guardado desactivado. No es una prueba física.",
    capturedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  if (results.some((result) => result.overflow || result.errors.length))
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
