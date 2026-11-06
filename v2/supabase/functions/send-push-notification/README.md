# `send-push-notification` — Edge Function

Envía push notifications a un usuario en todos sus devices (iOS APNs + Android FCM).

## Deploy

```bash
# Desde la raíz del repo, requiere supabase CLI logged in al project
supabase functions deploy send-push-notification --project-ref <project-ref>
```

## Secrets requeridos

Configurar antes del primer deploy (una sola vez):

```bash
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat path/to/fcm-service-account.json)"
supabase secrets set APNS_KEY_ID="ABC123XYZ"
supabase secrets set APNS_TEAM_ID="TEAM12345"
supabase secrets set APNS_BUNDLE_ID="es.franky.app"
supabase secrets set APNS_PRIVATE_KEY="$(cat path/to/AuthKey_ABC123XYZ.p8)"
supabase secrets set APNS_HOST="api.push.apple.com"          # production
# Para dev/TestFlight usar: api.sandbox.push.apple.com
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` se inyectan automáticamente por Supabase.

## Cómo se invoca

### A) Desde un cliente autenticado (poco común)

```ts
const { data, error } = await supabase.functions.invoke("send-push-notification", {
  body: {
    user_id: "uuid",
    title: "Has hecho match",
    body: "A Marta también le encajas",
    data: { type: "match", deeplink: "franky://chat/abc" },
    channel: "matches",
  },
});
```

### B) Desde un DB trigger (recomendado)

Crear un trigger SQL que invoque la función via `pg_net.http_post` cuando:
- `messages` recibe un INSERT → notificar al otro participant.
- `swipe_actions` con `is_match = true` → notificar a ambos.

Ejemplo de trigger (NO aplicar en F0 — se hace en F6 con la tabla de matches definitiva):

```sql
-- Pendiente F6: trigger que invoque la edge function en INSERT de messages.
-- Usa pg_net extension y secret SUPABASE_FUNCTION_URL.
```

## Comportamiento

- Si `device_tokens` está vacío para `user_id`, devuelve `{ sent: 0 }`.
- Tokens APNs que devuelven 410 (Unregistered) o FCM 404/410 → se purgan automáticamente de la tabla.
- Errores parciales: devuelve `{ sent: N, total: M, results: [...] }` con el detalle.

## Testing local

Requiere Supabase CLI + Docker:

```bash
supabase functions serve send-push-notification --env-file .env.local
curl -X POST http://localhost:54321/functions/v1/send-push-notification \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"...","title":"Test","body":"Hello"}'
```
