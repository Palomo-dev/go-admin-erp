import { Metadata } from 'next';
import { CampanaDetallePage } from '@/components/crm/campanas/id';
import { CampanaVozDetallePage } from '@/components/crm/campanas/voz/CampanaVozDetallePage';

export const metadata: Metadata = {
  title: 'Detalle de Campaña | CRM',
  description: 'Detalle de la campaña de marketing',
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}

export default async function CampanaDetalleRoute({ params, searchParams }: PageProps) {
  const { id } = await params;
  if ((await searchParams).tipo === 'voz') return <CampanaVozDetallePage campaignId={id} />;
  return <CampanaDetallePage campaignId={id} />;
}
