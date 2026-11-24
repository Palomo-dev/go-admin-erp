import { Suspense } from 'react';
import type { Metadata } from 'next';
import { RuleBuilderPage } from '@/components/crm/automatizaciones/RuleBuilderPage';

export const metadata: Metadata = {
  title: 'Regla | Automatizaciones | CRM',
};

export default async function ReglaRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <RuleBuilderPage key={id} ruleId={id} />
    </Suspense>
  );
}
