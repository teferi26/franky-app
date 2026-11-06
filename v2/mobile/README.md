# Franky Mobile

App nativa (iOS/Android/Web) con el sistema de diseño propio de Franky y datos 100% reales del Supabase de producción.

## Arrancar

```powershell
cd mobile
npm install
npm run tunnel     # ← usa SIEMPRE este para probar en el móvil
```

Escanea el QR con la cámara del iPhone (necesita Expo Go instalado).

> **¿Por qué `npm run tunnel` y no la IP 192.168.x?** El firewall de Windows y el aislamiento de APs suelen bloquear el puerto 8081 en red local. El túnel crea una URL pública segura y funciona en cualquier red, incluso con el móvil en 4G.

Para navegador: `npm start` y pulsa `w`.

## Diseño

Sistema de diseño propio (mismos tokens que la web, `web/src/app/globals.css`):
- Paleta Franky por defecto: fondo `#FBF9FF` con velo violeta, tinta `#241B33`, violeta de acción `#7C3AED`, magenta `#C026D3` y naranja `#DE8927` como acentos; modo oscuro azul noche `#0B0E19`.
- Tipografía Outfit (títulos, botones, cifras) y la del sistema para el cuerpo.
- Radios 8/12/16/24, sombras suaves con tinte violeta, degradado de marca en botones primarios, botón central y anillos.
- Iconos vectoriales de línea (lucide), nada de emojis como iconos; confirmaciones con toast en vez de cuadros del sistema.
- Tab bar: Inicio (Fomo/Crush) · Estudio · botón central según la intención de uso · Chats · Perfil. La Lupa se abre desde el icono de buscar de las cabeceras.

## Datos

Sin datos de prueba: todo sale de Supabase (<project-ref>).
Verificado contra producción: 96 universidades, 5.132 carreras, 477 becas, 1.012 sitios de ocio, 10 eventos, 5 alojamientos, 5 noticias.
`fomo_threads` y `ligar_posts` están vacíos en la BD → la app muestra empty states que invitan a publicar (con invitación a publicar).

Fix importante: los joins a `profiles` necesitan FK explícita (`profiles!fomo_threads_author_id_fkey`) porque hay dos relaciones; sin esto PostgREST devuelve error 300 (PGRST201).

## Estructura

- `src/theme.ts` — tokens Franky (paleta, tipografía Outfit, radios, sombras, degradados)
- `src/components/ui.tsx` — kit: Btn con degradado, Chip, Pill, Avatar con anillo de marca, IconCircle, NavRow, EmptyState, Skeleton, OptionsSheet
- `src/components/Screen.tsx` — header plano con hairline, back con chevron
- `src/lib/api.ts` — queries reales tipadas (sin fallbacks ficticios)
- `app/` — expo-router: 5 tabs + listas + detalles + modal publicar

## Verificado

- `tsc --noEmit` sin errores (TypeScript 6)
- Export web + render en Chromium: 9 rutas, 0 errores de consola, datos reales cargando
