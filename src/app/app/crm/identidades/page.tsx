import { Metadata } from 'next';
import { IdentidadesPage } from '@/components/crm/identidades';

export const metadata: Metadata = {
  title: 'Identidades | CRM',
  description: 'Gestión de identidades omnicanal y resolución de duplicados',
};

export default function IdentidadesRoute() {
  return <IdentidadesPage />;
}
