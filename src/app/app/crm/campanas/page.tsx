import { Metadata } from 'next';
import { CampanasPage } from '@/components/crm/campanas';

export const metadata: Metadata = {
  title: 'Campañas | CRM',
  description: 'Gestión de campañas de marketing',
};

export default function CampanasRoute() {
  return <CampanasPage />;
}
