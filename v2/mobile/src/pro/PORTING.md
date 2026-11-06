# Franky Pro nativo: cómo se porta una sección de la web

La app de negocios (Franky Pro) ya existe en la web (`web/src/components/pro/sections/<motor>/*.tsx`).
Aquí se rehace en React Native con **el mismo diseño, los mismos textos y las mismas funciones**.
Teferi rechazó la interfaz anterior por genérica: esto tiene que verse y sentirse igual de cuidado que la web.

## Qué hay hecho y no se toca

- `src/pro/store.tsx`: `usePro()` con el mismo contrato que la web
  (`spaceId, vertical, data, demo, now, update(label, fn, intent?) => Promise<boolean>, pending, can, canView, error, refresh, loadDate, resetDemo`)
  y `localId(prefix)`. No hay `spaces`.
- `src/pro/kit.tsx`: piezas visuales. **Léelo entero antes de empezar.** Equivalencias con la web:
  - `PageHeader`, `Kpi`, `KpiRow` (rejilla de 2), `Panel`, `ListRow`, `Empty`, `Tip`, `Detail`, `Meter`, `Bars`, `StatusPill`, `Pill`, `LiveDot`
  - `Button` de la web → `PButton` (`variant`: dark, outline, secondary, ghost, danger; `small`, `icon`, `full`)
  - `Avatar` → `PAvatar`; tonos → `tone(toneKey)` y `TONE_HEX`
  - `Drawer` → `Sheet` (hoja inferior con `title`, `description`, `footer`)
  - `FormField` → `Field`; `<input>` → `Input`; `ChoiceChips` → `ChoiceGrid`; filtros en pastilla → `Chips`; varias a la vez → `MultiChips`; pestañas → `Segmented`; buscador → `SearchInput`; navegación de días → `StepNav`
  - `type="date"` → `DayChips`; `type="time"` → `TimeStepper`; números y rangos → `Stepper`; casillas → `Toggle`
  - Bloque oscuro de resultados → `DarkBlock` + `DarkText`
  - Texto → `PText v="h1|h2|h3|body|small|tiny|label"` (usa siempre `PText` o `Text` con `maxFontSizeMultiplier`)
- `src/pro/shell.tsx`: `ProPage` (cuerpo desplazable de cada sección, **toda pantalla va dentro de `<ProPage>`**), `useGoSection()` para ir a otra sección, `sectionHref`, `navBadge`.
- `src/pro/sections.ts`: `SECTION_META`, `sectionLabel(vertical.id, id)`.
- `src/pro/sections/common/checklist.tsx` (`SetupChecklist`) y `offer-composer.tsx` (`OfferComposer`, `OfferPreset`): ya portados, úsalos.
- Toda la lógica pura está en `../shared/pro/*` (format, agenda, tables, night, classes, courts, housing, checklist, results, slots, contact, csv, customer-contact, remote-*, demo/*). Impórtala por ruta relativa (`../../../../../shared/pro/format` desde `src/pro/sections/<motor>/`). **No dupliques lógica: si la web la importa de `@/lib/pro/x`, en nativo es `shared/pro/x`.**

## Reglas

1. Escribe **solo** dentro de tu carpeta `src/pro/sections/<motor>/`. Si necesitas una pieza que no está en el kit, créala en tu carpeta (p. ej. `ui.tsx`). No edites kit, shell, store ni otras carpetas.
2. Un archivo nativo por archivo web, mismo nombre. Exporta cada pantalla como `default` y regístrala en `src/pro/sections/<motor>/index.ts`:
   ```ts
   import Hoy from "./hoy";
   export const SECTIONS: Partial<Record<ProSectionId, ComponentType>> = { hoy: Hoy, agenda: Agenda };
   ```
   Las claves son las mismas que en `web/src/components/pro/registry.tsx` para tu motor.
3. Mismos textos que la web, en español de España. **Nunca guiones largos (— ni –)**: usa comas, dos puntos o paréntesis. Nada de textos legales en pantalla. Sin emojis.
4. Diseño v3 editorial (`docs/DESIGN_SYSTEM_V3.md`): fondo blanco o neutro, violeta (`C.blue`) solo como acento, tipografía Outfit para titulares, sin degradados ni cristal. Colores **siempre** desde `C` dentro del render (cambian con el tema oscuro); nunca en constantes de módulo, salvo los hex de `TONE_HEX` y el bloque oscuro `#121019`.
5. Adapta al móvil, no encojas la web: rejillas de escritorio → columna; tablas → filas `ListRow`; calendarios por horas o por recurso → `ScrollView horizontal` con columnas de ancho fijo y la hora pegada a la izquierda; planos (sala) → posiciones escaladas al ancho de pantalla (`useWindowDimensions`).
6. Listas: dentro de `ProPage` se pinta con `.map`. Si una lista puede pasar de ~60 filas, muestra 40 y un botón "Ver más".
7. Toques: objetivo mínimo 44 px, `accessibilityRole` y `accessibilityLabel` en todo lo tocable. `Tap` de `@/components/ui` para botones propios.
8. Avisos al usuario: `toast("Texto", { kind: "success" | "error" | "info" })` de `@/lib/toast`. Confirmaciones destructivas: `Alert.alert` con botón "Cancelar" y el destructivo con `style: "destructive"`.
9. Enlaces externos (`/n/<slug>`, WhatsApp, teléfono, mapas): `Linking.openURL("https://franky.es/n/...")`. QR: `react-native-qrcode-svg`. Cámara para escanear: `CameraView` de `expo-camera` con `onBarcodeScanned` (pide permiso con `useCameraPermissions`). Compartir texto: `Share.share`. Copiar: `expo-clipboard` si está en `package.json`, si no `Share.share`.
10. Modo real: en negocios reales `update(label, fn, intent)` llama al servidor. Respeta exactamente los `intent` y comprobaciones `can("...")` y `demo` que hace la web. Si la web pinta algo distinto en real (archivos `real-*.tsx`), pórtalo también.
11. Nada de `any` salvo que la web lo tenga. El código tiene que quedar formateado y legible, con comentarios breves en español donde la web los tenga.
12. Verificación obligatoria antes de terminar, desde `C:\temp\franky-deploy\v2\mobile`:
    `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "src/pro/sections/<motor>"` debe salir vacío. (Otros agentes trabajan a la vez en otras carpetas: ignora errores que no sean de la tuya.)
    Además: `grep -rn "[—–]" src/pro/sections/<motor>` vacío.
13. No arranques servidores, no hagas commit ni push, no toques la base de datos.

## Entrega

Al terminar, responde con: archivos creados, secciones registradas, qué partes de la web no se han podido portar tal cual y cómo se han resuelto, y el resultado del typecheck.
