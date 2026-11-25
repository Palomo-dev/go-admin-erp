import type { Metadata } from 'next';
import { SegmentoNuevoPage } from '@/components/crm/segmentos/nuevo';

export const metadata: Metadata = {
  title: 'Editar segmento | CRM',
  description: 'Reglas del segmento con conteo en vivo',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarSegmentoRoute({ params }: PageProps) {
  const { id } = await params;
  return <SegmentoNuevoPage segmentId={id} />;
}
