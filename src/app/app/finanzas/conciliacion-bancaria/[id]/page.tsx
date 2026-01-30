'use client';

import React, { use } from 'react';
import { ConciliacionDetailPage } from '@/components/finanzas/conciliacion-bancaria/ConciliacionDetailPage';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ConciliacionDetailAppPage({ params }: PageProps) {
  const { id } = use(params);
  return <ConciliacionDetailPage reconciliationId={id} />;
}
