'use client';

import React, { use } from 'react';
import { AsientoDetailPage } from '@/components/finanzas/contabilidad/asientos';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function Page({ params }: PageProps) {
  const { id } = use(params);
  return <AsientoDetailPage entryId={parseInt(id)} />;
}
