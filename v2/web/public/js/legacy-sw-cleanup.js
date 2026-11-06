/*
 * Limpieza del service worker antiguo (Workbox).
 *
 * Vivia como <Script inline> dentro de app/layout.tsx. Al ser inline, la CSP
 * estricta exigia el nonce, el layout tenia que leer `headers()` para
 * obtenerlo, y eso forzaba render dinamico en TODO el arbol: solo 4 de 60
 * rutas se prerenderizaban y los `export const revalidate` de los catalogos no
 * servian de nada.
 *
 * Como fichero externo del propio origen lo cubre `script-src 'self'` sin
 * nonce, ademas se cachea y deja de viajar en cada HTML.
 *
 * Que hace: la app nueva no registra ningun service worker, asi que cualquiera
 * que siga registrado es un resto del Workbox viejo. Se desregistra y se
 * borran sus caches en cuanto el usuario llega a HTML de la app nueva. El
 * kill-switch de /sw.js se encarga de quien aun esta atrapado detras del
 * worker antiguo; esto cubre a todos los que ya han pasado.
 */
(function () {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .getRegistrations()
    .then(function (regs) {
      if (!regs.length) return;
      regs.forEach(function (r) {
        r.unregister();
      });
      if (window.caches && caches.keys) {
        caches
          .keys()
          .then(function (keys) {
            keys.forEach(function (k) {
              caches.delete(k);
            });
          })
          .catch(function () {});
      }
    })
    .catch(function () {});
})();
