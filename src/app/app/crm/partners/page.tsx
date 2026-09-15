import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PartnersPage } from '@/components/crm/partners/PartnersPage';

export const metadata: Metadata = {
  title: 'Partners | CRM',
  description: 'Partners y tiers: deals registrados y comisiones como registro, sin mover dinero (FASE-12)',
};

export default function PartnersRoute() {
  return (
    <Suspense fallback={null}>
      <PartnersPage />
    </Suspense>
  );
}
