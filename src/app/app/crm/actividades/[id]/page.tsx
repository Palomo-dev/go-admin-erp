import { Metadata } from 'next';
import { ActividadDetalle } from '@/components/crm/actividades/id';

export const metadata: Metadata = {
  title: 'Detalle de Actividad | CRM',
  description: 'Detalle de actividad del CRM',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ActividadDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  return (
    <div className="container mx-auto px-4 py-6">
      <ActividadDetalle activityId={id} />
    </div>
  );
}
