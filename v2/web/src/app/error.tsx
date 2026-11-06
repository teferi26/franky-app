'use client';

import { AlertTriangle } from 'lucide-react';
import { RouteError } from '@/components/ui/route-state';

// Boundary raíz. La pantalla vive en components/ui/route-state.tsx y es la
// misma que usan los error.tsx de cada sección; aquí solo se le da el texto.
// El emoji de aviso que había se sustituye por un icono de lucide: los emojis
// se pintan distinto en cada sistema y no se tintan con la marca.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      icon={AlertTriangle}
      title="Algo ha fallado"
      description="Ha ocurrido un error inesperado. Puedes reintentar o volver al inicio; si sigue pasando, escríbenos desde Ayuda."
      boundary="root"
    />
  );
}
