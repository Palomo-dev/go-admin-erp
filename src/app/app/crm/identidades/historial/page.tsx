import { Metadata } from 'next';
import { HistorialFusiones } from '@/components/crm/identidades/HistorialFusiones';

export const metadata: Metadata = {
  title: 'Historial de fusiones | CRM',
};

export default function HistorialFusionesRoute() {
  return <HistorialFusiones />;
}
