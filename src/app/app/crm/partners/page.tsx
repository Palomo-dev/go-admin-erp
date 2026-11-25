import { Suspense } from 'react';
import type { Metadata } from 'next';
import { PartnersPantalla } from '@/components/crm/partners/PartnersPantalla';

export const metadata: Metadata = {
  title: 'Partners | CRM',
  description: 'Aliados que traen o cierran negocios y su comisión: directorio, deals, comisiones y niveles',
};

export default function PartnersRoute() {
  return (
    <Suspense fallback={null}>
      <PartnersPantalla />
    </Suspense>
  );
}
