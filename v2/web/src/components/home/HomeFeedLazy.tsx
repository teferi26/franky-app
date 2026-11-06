"use client";

// Envoltorio perezoso del feed social de la home. HomeSocial (server) lo
// importaba estático, y eso metía el subárbol entero del FOMO (composer,
// stories, tarjetas) en el First Load JS de `/`, la puerta de entrada del
// tráfico QR, aunque el visitante anónimo nunca lo renderice. Con ssr:false el
// chunk solo se descarga cuando el servidor decide pintar la rama con sesión.

import dynamic from "next/dynamic";
import { useState } from "react";
import CampusSwitch, { type CampusMode } from "@/components/social/CampusSwitch";
import { Skeleton, SkeletonPage } from "@/components/ui/skeleton";
import { trackFire } from "@/lib/analytics";

// Silueta del feed mientras baja el chunk: dos tarjetas con brillo, en vez de
// un spinner en medio de la nada (v3: "brillo, no parpadeo").
function FeedCargando({ label }: { label: string }) {
  return (
    <SkeletonPage label={label} className="space-y-4">
      <Skeleton className="h-14 w-full rounded-2xl" />
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3 rounded-md" />
              <Skeleton className="h-2.5 w-1/5 rounded-md" />
            </div>
          </div>
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-3 w-full rounded-md" />
            <Skeleton className="h-3 w-11/12 rounded-md" />
            <Skeleton className="h-3 w-2/3 rounded-md" />
          </div>
        </div>
      ))}
    </SkeletonPage>
  );
}

const FomoFeedClient = dynamic(() => import("@/app/fomo/[slug]/client"), {
  ssr: false,
  loading: () => <FeedCargando label="Cargando el FOMO" />,
});

const CrushBoard = dynamic(() => import("@/app/crush/client"), {
  ssr: false,
  loading: () => <FeedCargando label="Cargando Crush" />,
});

export default function HomeFeedLazy(props: {
  universityId: string;
  universityName: string;
  universitySlug: string;
}) {
  const [mode, setMode] = useState<CampusMode>("fomo");
  return <>
    <div className="mb-4 flex justify-end">
      <CampusSwitch mode={mode} onChange={next => { setMode(next); trackFire("campus_mode_changed", { mode: next }); trackFire("screen_view", { screen: next, surface: "home" }); }} />
    </div>
    {mode === "fomo" ? <FomoFeedClient {...props} embedded /> : <CrushBoard embedded />}
  </>;
}
