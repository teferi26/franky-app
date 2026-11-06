# Migraciones de Supabase

## Convención de nombres (obligatoria desde septiembre de 2026)

```
AAAAMMDDHHMMSS_descripcion_en_snake_case.sql
```

- Marca de tiempo UTC de 14 cifras (la que genera `supabase migration new`).
- Descripción corta, en minúsculas y con guiones bajos.
- Una migración = un cambio coherente. Idempotente siempre que se pueda
  (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, guardas
  `to_regclass(...)`), porque prod y el repo ya han divergido otras veces.
- Nunca se edita una migración que ya esté aplicada en prod: se crea otra nueva.

## Prefijos numéricos antiguos (001 a 169)

Las migraciones anteriores a septiembre de 2026 usan un prefijo de 3 cifras.
Ese esquema ya NO se usa: no crees ficheros nuevos con prefijo numérico y
**no reutilices ningún número**, aunque parezca libre.

Prefijos duplicados o conflictivos conocidos (no deben volver a usarse):

| Prefijo | Ficheros | Estado |
|---|---|---|
| 041 | `041_pii_encryption_pgcrypto.sql` | La versión pgsodium (`041_pii_encryption.sql`) se retiró a `../migrations_superseded/`. Solo queda la de pgcrypto. |
| 044 / 044b | `044_admin_analytics.sql`, `044b_analytics_schema_fixes.sql` | Dos ficheros con el mismo número; 044b corrige a 044. Se aplican en ese orden. |
| 092 | `092_connect_v2_status.sql`, `092_ligar_wall.sql` | Dos migraciones distintas con el mismo número. |
| 094 | `094_contracts.sql`, `094_fomo_ligar_search_sort.sql` | Dos migraciones distintas con el mismo número. |
| 163 | `163_cupo_pisos_y_archivado.sql` | La auditoría lo marca como número en conflicto. Trátalo como reservado. |

Con prefijos repetidos, el orden de aplicación depende del orden alfabético
del nombre completo. Por eso cualquier migración nueva lleva marca de tiempo.

## Migraciones retiradas

`../migrations_superseded/` guarda ficheros que se sacaron de esta carpeta
para que ningún runner (`supabase db push`, scripts `run-migration*.cjs`) los
aplique. Cada uno explica en su cabecera por qué se retiró. No se aplican.
