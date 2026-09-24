'use client';

import React from 'react';
import { DetalleCuentaCartera } from '@/components/finanzas/cuentas-por-cobrar/detalle/DetalleCuentaCartera';

/** Detalle de una cuenta por cobrar (la URL no cambia: hay enlaces desde otras pantallas). */
export default function CuentaPorCobrarDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <DetalleCuentaCartera id={id} origen="finanzas" />;
}
