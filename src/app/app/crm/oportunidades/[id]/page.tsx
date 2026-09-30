'use client';

import { use } from 'react';
import { OportunidadDetalle } from '@/components/crm/oportunidad/OportunidadDetalle';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Detalle de oportunidad (CRM ola 3B, plan §4.6; Figma 775:473076). */
export default function OpportunityDetailPage({ params }: PageProps) {
  const { id } = use(params);
  return <OportunidadDetalle id={id} />;
}
