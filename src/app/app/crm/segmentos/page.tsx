import { Metadata } from 'next';
import { SegmentosPage } from '@/components/crm/segmentos';

export const metadata: Metadata = {
  title: 'Segmentos | CRM',
  description: 'Gestión de segmentos de clientes',
};

export default function SegmentosRoute() {
  return <SegmentosPage />;
}
