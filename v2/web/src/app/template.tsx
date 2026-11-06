/**
 * Transición de página. `template.tsx` se vuelve a montar en CADA navegación
 * (a diferencia de layout.tsx), así que basta una animación CSS de entrada
 * para que cada ruta aparezca con un fundido y una subida de 8 px. Sin
 * framer-motion ni `mode="wait"`: es lo que se congelaba en el onboarding.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
