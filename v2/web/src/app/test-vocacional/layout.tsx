import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Test Vocacional Universitario Gratis (RIASEC)',
  description: 'Descubre qué carrera encaja contigo con nuestro test vocacional gratuito basado en el modelo RIASEC. Responde unas preguntas y obtén recomendaciones de grados universitarios al instante.',
}

export default function TestVocacionalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
