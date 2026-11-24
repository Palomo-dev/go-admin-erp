import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RuleBuilderPage } from '@/components/crm/automatizaciones/RuleBuilderPage';

export const metadata: Metadata = {
  title: 'Nueva regla | Automatizaciones | CRM',
};

export default function NuevaReglaRoute() {
  return (
    <Suspense fallback={null}>
      <RuleBuilderPage ruleId={null} />
    </Suspense>
  );
}
