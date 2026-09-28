'use client';

import React from 'react';
import { CarteraCliente } from '@/components/finanzas/cuentas-por-cobrar/cliente/CarteraCliente';

/** Cartera de un cliente dentro del POS. */
export default function POSCarteraClientePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = React.use(params);
  return <CarteraCliente customerId={customerId} origen="pos" />;
}
