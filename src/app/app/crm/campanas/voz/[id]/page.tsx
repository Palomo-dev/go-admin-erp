import type { Metadata } from 'next';
import { CampanaVozDetalle } from '@/components/crm/agentes/campanas/detalle/CampanaVozDetalle';

export const metadata: Metadata = {
  title: 'Campaña de voz | CRM',
  description: 'Campaña del agente de voz en marcha: llamadas en vivo, cifras y cupos de hoy',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/** /app/crm/campanas/voz/[id] — detalle de una campaña de voz (Figma 1809:144962). */
export default async function CampanaVozRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-canvas p-4 lg:p-6">
      <CampanaVozDetalle id={id} />
    </div>
  );
}
