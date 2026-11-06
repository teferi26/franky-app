import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Base ficticia antes de importar la aplicación. La asignación directa permite
// que vi.unstubAllEnvs() restaure estos valores tras cada prueba que los cambie.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-not-for-production';

/**
 * Testing Library espera 1 segundo por defecto en `findBy*` y `waitFor`, y ese
 * plazo NO lo cambia el `testTimeout` de vitest. Con la suite entera en marcha
 * (97 ficheros compitiendo por la CPU de esta máquina) montar una pantalla
 * grande puede tardar más de ese segundo, y el test fallaba con "Unable to find
 * role..." aunque el componente estuviera bien: en aislamiento pasaba siempre.
 *
 * Quince segundos no ocultan un fallo real (una consulta que nunca resuelve
 * agota igual el `testTimeout`), solo dejan de castigar a la máquina lenta.
 */
configure({ asyncUtilTimeout: 15000 });
