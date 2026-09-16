'use client';

import { use } from 'react';
import { ProposalPrintView } from '@/components/crm/propuestas/ProposalPrintView';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** F10 — vista imprimible de la propuesta (sesión requerida; la organización sale del servidor). */
export default function ProposalPrintPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    <div className="min-h-screen bg-white">
      <ProposalPrintView proposalId={id} />
    </div>
  );
}
