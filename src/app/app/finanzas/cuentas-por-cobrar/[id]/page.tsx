import React from 'react';
import { CuentaPorCobrarDetailPage } from '@/components/finanzas/cuentas-por-cobrar/id/CuentaPorCobrarDetailPage';

export default function CuentaPorCobrarDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <CuentaPorCobrarDetailPage accountId={id} />;
}
