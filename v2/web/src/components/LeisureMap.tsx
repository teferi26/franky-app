"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { leisureMapPopup } from "@/lib/leisure-map-popup";
import "leaflet/dist/leaflet.css";

interface Spot {
  id: string;
  name: string;
  city: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  image_url: string | null;
}


// Nombre legible de la categoría para el globo. Antes iba un emoji por
// categoría: se pintan distinto en cada sistema y no son parte del sistema v3.
const categoryLabels: Record<string, string> = {
  bar: "Bar",
  restaurante: "Restaurante",
  cafeteria: "Cafetería",
  discoteca: "Discoteca",
  parque: "Parque",
  cultural: "Cultura",
  deportivo: "Deporte",
  coworking: "Coworking",
  pub: "Pub",
};

// Chincheta del sistema: gota violeta con un punto blanco dentro. Un solo
// color de marca en vez de nueve, y sin emoji.
function createMarkerIcon() {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background: #6D3BEB;
      width: 28px; height: 28px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid #ffffff;
      box-shadow: 0 2px 8px rgba(18,16,25,0.28);
      display: flex; align-items: center; justify-content: center;
    ">
      <span style="width:8px; height:8px; border-radius:50%; background:#ffffff; display:block;"></span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
}

export default function LeisureMap({
  spots,
  onSpotClick,
}: {
  spots: Spot[];
  onSpotClick?: (id: string) => void;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const validSpots = spots.filter(
      (s) => s.latitude != null && s.longitude != null
    );

    const center: [number, number] =
      validSpots.length > 0
        ? [validSpots[0].latitude!, validSpots[0].longitude!]
        : [40.4168, -3.7038]; // Madrid default

    const map = L.map(containerRef.current, {
      center,
      zoom: validSpots.length === 1 ? 14 : 6,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const markers: L.Marker[] = [];

    for (const spot of validSpots) {
      const marker = L.marker([spot.latitude!, spot.longitude!], {
        icon: createMarkerIcon(),
      }).addTo(map);

      const label = Object.hasOwn(categoryLabels, spot.category) ? categoryLabels[spot.category] : spot.category;
      const popupContent = leisureMapPopup(spot, label);

      marker.bindPopup(popupContent, { maxWidth: 250 });

      if (onSpotClick) {
        marker.on("click", () => onSpotClick(spot.id));
      }

      markers.push(marker);
    }

    if (markers.length > 1) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [spots, onSpotClick]);

  return (
    <div
      ref={containerRef}
      className="z-0 h-[400px] w-full overflow-hidden rounded-2xl border border-border shadow-card lg:h-[500px]"
    />
  );
}
