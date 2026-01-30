'use client';

import React, { use } from 'react';
import { CuentaDetailPage } from '@/components/finanzas/bancos/cuentas/CuentaDetailPage';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function CuentaBancariaDetailPage({ params }: PageProps) {
  const { id } = use(params);
  return <CuentaDetailPage accountId={id} />;
}
