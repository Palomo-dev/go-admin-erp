import { Metadata } from 'next';
import { ActividadesPage } from '@/components/crm/actividades';

export const metadata: Metadata = {
  title: 'Actividades | CRM',
  description: 'Registro y agenda de actividades del equipo comercial',
};

export default function ActividadesRoute() {
  return <ActividadesPage />;
}
