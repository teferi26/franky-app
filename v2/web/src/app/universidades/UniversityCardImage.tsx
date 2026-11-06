"use client";

import Image from "next/image";
import { Building2 } from "lucide-react";
import { useState } from "react";

/** Una foto externa que falle no debe dejar una imagen rota sobre la tarjeta. */
export default function UniversityCardImage({ src, name }: { src: string | null; name: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <>
    {/* Relleno neutro mientras carga o si no hay foto: sin velos violeta. */}
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-bg-secondary">
      <Building2 className="h-10 w-10 text-text-muted/40" />
    </div>
    {src && failedSource !== src && <Image
      src={src} alt={name} fill
      className="object-cover"
      sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) calc((100vw - 72px) / 2), (max-width: 1600px) calc((100vw - 112px) / 3), 496px"
      onError={() => setFailedSource(src)}
    />}
  </>;
}
