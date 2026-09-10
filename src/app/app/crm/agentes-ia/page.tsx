import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AgentesIaPage } from '@/components/crm/agentes/AgentesIaPage';

export const metadata: Metadata = {
  title: 'Agentes IA | CRM',
  description: 'Agentes de voz con IA: propósito, voz, herramientas y campañas',
};

export default function AgentesIaRoute() {
  return (
    <Suspense fallback={null}>
      <AgentesIaPage />
    </Suspense>
  );
}
