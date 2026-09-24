'use client';

import React from 'react';
import { DetalleCuentaCartera } from '@/components/finanzas/cuentas-por-cobrar/detalle/DetalleCuentaCartera';

/** Detalle de una cuenta por cobrar dentro del POS (cobro con la caja del cajero). */
export default function POSCuentaPorCobrarDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <DetalleCuentaCartera id={id} origen="pos" />;
}
