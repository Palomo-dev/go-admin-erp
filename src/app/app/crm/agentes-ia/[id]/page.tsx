import type { Metadata } from 'next';
import { AgenteDetalle } from '@/components/crm/agentes/detalle/AgenteDetalle';

export const metadata: Metadata = {
  title: 'Agente IA | CRM',
  description: 'Métricas del agente de voz: llamadas, desenlaces y herramientas',
};

export default async function AgenteIaDetalleRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgenteDetalle agentId={id} />;
}
