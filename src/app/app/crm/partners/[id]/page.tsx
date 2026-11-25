import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PartnerFicha } from '@/components/crm/partners/PartnerFicha';

export const metadata: Metadata = {
  title: 'Partner | CRM',
  description: 'Ficha del partner: nivel, camino al siguiente, deals y comisiones',
};

export default async function PartnerFichaRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PartnerFicha partnerId={id} />
    </Suspense>
  );
}
