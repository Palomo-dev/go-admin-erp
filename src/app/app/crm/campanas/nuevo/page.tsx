import { Metadata } from 'next';
import { CampanaNuevaPage } from '@/components/crm/campanas/nuevo';

export const metadata: Metadata = {
  title: 'Nueva Campaña | CRM',
  description: 'Crear nueva campaña de marketing',
};

export default function CampanaNuevaRoute() {
  return <CampanaNuevaPage />;
}
