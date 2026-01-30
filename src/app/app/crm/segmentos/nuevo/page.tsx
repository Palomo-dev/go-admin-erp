import { Metadata } from 'next';
import { SegmentoNuevoPage } from '@/components/crm/segmentos/nuevo';

export const metadata: Metadata = {
  title: 'Nuevo Segmento | CRM',
  description: 'Crear nuevo segmento de clientes',
};

export default function SegmentoNuevoRoute() {
  return <SegmentoNuevoPage />;
}
