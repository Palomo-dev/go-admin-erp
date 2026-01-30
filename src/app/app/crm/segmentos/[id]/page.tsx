import { Metadata } from 'next';
import { SegmentoDetallePage } from '@/components/crm/segmentos/id';

export const metadata: Metadata = {
  title: 'Detalle de Segmento | CRM',
  description: 'Detalle del segmento de clientes',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SegmentoDetalleRoute({ params }: PageProps) {
  const { id } = await params;
  return <SegmentoDetallePage segmentId={id} />;
}
