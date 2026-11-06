/*
 * Kill-switch service worker.
 *
 * Context: the OLD (Vite + vite-plugin-pwa / Workbox) version of franky.es
 * registered a precaching service worker at this exact path (`/sw.js`,
 * scope `/`) with `registerType: 'autoUpdate'`. That worker is still installed
 * in the browsers of returning users and keeps serving its ~6-month-old
 * precached snapshot on every navigation — which is why those users see the
 * dead, pre-rewrite site and only a hard refresh shows the new one.
 *
 * Because the current Next.js app no longer ships a real worker here, the old
 * worker's periodic update check used to receive HTML (text/html) instead of
 * JavaScript, which the spec treats as a failed update — so the stale worker
 * never got replaced and kept living forever.
 *
 * This file fixes that: it is valid JavaScript served with a JS content-type,
 * so the next time a stuck browser checks `/sw.js` for an update it installs
 * THIS worker (the bytes differ from the old one), which then:
 *   1. deletes every Cache Storage bucket the old Workbox precache created,
 *   2. unregisters itself, and
 *   3. reloads every open tab so the user immediately lands on the live,
 *      network-served version.
 *
 * Net effect: returning users self-heal on their next visit (within ~24h, the
 * SW update-check throttle window) with no action required. New users were
 * never affected because they have no worker registered.
 *
 * Keep this file deployed indefinitely. Removing it would let the old worker's
 * update check fail again for any browser that hasn't yet been healed.
 */

self.addEventListener("install", () => {
  // Don't wait for old clients to close — take over as soon as possible.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1. Nuke every Cache Storage entry (old Workbox precache + runtime caches).
      try {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      } catch {
        // ignore — best effort
      }

      // 2. Unregister this worker so the site goes back to plain network.
      try {
        await self.registration.unregister();
      } catch {
        // ignore
      }

      // 3. Reload every open tab so users see the live version right now.
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          // navigate() re-requests the same URL from the network (no worker
          // controls it anymore), giving the user the new build immediately.
          client.navigate(client.url);
        }
      } catch {
        // ignore
      }
    })()
  );
});

// Intentionally NO fetch handler: while this worker is briefly alive it must
// not intercept anything — all requests go straight to the network.
