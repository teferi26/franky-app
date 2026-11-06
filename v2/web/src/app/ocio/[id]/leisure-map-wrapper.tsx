"use client";

import dynamic from "next/dynamic";

const LeisureDetailMap = dynamic(() => import("./leisure-detail-map"), {
  ssr: false,
  // Silueta neutra mientras baja Leaflet: nada de velos violeta de fondo.
  loading: () => (
    <div className="skeleton-shimmer h-[250px] w-full rounded-2xl border border-border" aria-hidden="true" />
  ),
});

export default function LeisureMapWrapper({
  latitude,
  longitude,
  name,
}: {
  latitude: number;
  longitude: number;
  name: string;
}) {
  return <LeisureDetailMap latitude={latitude} longitude={longitude} name={name} />;
}
