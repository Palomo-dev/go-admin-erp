import { Metadata } from 'next';
import { ActividadesPantalla } from '@/components/crm/actividades/pantalla/ActividadesPantalla';

export const metadata: Metadata = {
  title: 'Actividades | CRM',
  description: 'Línea de tiempo de la actividad comercial de la organización',
};

/** /app/crm/actividades — CRM ola 3A (plan §4.9, Figma 769:12376). */
export default function ActividadesRoute() {
  return <ActividadesPantalla />;
}
