import { Metadata } from 'next';
import { CampanaDetallePage } from '@/components/crm/campanas/id';

export const metadata: Metadata = {
  title: 'Detalle de Campaña | CRM',
  description: 'Detalle de la campaña de marketing',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampanaDetalleRoute({ params }: PageProps) {
  const { id } = await params;
  return <CampanaDetallePage campaignId={id} />;
}
