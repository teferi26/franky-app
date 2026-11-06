# Núcleo común de Franky Pro

Web y Expo importan la misma fuente TypeScript. Este directorio contiene contratos,
validación de respuestas, adaptación de datos, disponibilidad y comandos de negocio.
No crea clientes de Supabase, no lee variables de entorno y no contiene componentes
React ni almacenamiento de sesión.

Cada aplicación proporciona un `ProRpcClient` ligado a la cuenta y al espacio
actuales. Debe invalidarlo al cambiar de cuenta o al revocarse la membresía. Las
comprobaciones de permisos del cliente mejoran la experiencia; el servidor autoriza
cada operación.

Los módulos de `web/src/lib/pro` que corresponden a este directorio solo reexportan
la implementación común. Las nuevas pantallas de Expo deben importar directamente
desde `shared/pro`. Los componentes, proveedores y los datos de demostración siguen
en su aplicación.

## Dependencias y resolución

Zod es la única dependencia de ejecución externa. Está declarado y bloqueado en los
dos consumidores. TypeScript, Next, Vitest y Metro lo resuelven desde el
`node_modules` de la aplicación que compila. No se instala un tercer árbol de
dependencias en `shared` ni se copia la fuente a un paquete generado. Al actualizar
Zod, se actualizan ambos consumidores y se verifican sus contratos.

`mobile/metro.config.js` observa `shared` y añade el directorio de dependencias de
la app a sus rutas de resolución. Los alias de TypeScript y del compilador web
resuelven Zod de la misma manera. Cambiar un contrato modifica ambas aplicaciones
sin reinstalar un paquete local.

## Entorno de ejecución

`ProCommandRunner` acepta un generador de identificadores como segundo argumento.
El valor predeterminado usa Web Crypto. Expo debe proporcionar un generador UUID
nativo; no debe depender de que Hermes incluya `crypto.randomUUID`. El mismo comando
conserva su identificador durante los reintentos de una respuesta incierta.

Las fechas se interpretan en Europe/Madrid. El cliente solo habilita motores que
sean compatibles con el huso horario de la organización. Los importes se expresan
en céntimos y los valores desconocidos permanecen como `null`.
