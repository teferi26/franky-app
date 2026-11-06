import type { Metadata } from 'next';
import CityContentFeed from '@/components/CityContentFeed';

// "Novedades" ya es el nombre de /noticias: esta página se llama distinto para
// que no choquen en la navegación ni en el título de la pestaña.
export const metadata: Metadata = {
  title: 'Qué pasa en tu ciudad',
  description: 'Propuestas, planes y noticias de comunidades y negocios de tu ciudad universitaria.',
  robots: { index: false, follow: true },
};

export default function Page(){return <CityContentFeed/>;}
