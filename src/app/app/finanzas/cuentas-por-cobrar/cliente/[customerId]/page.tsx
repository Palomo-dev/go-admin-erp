'use client';

import React from 'react';
import { CarteraCliente } from '@/components/finanzas/cuentas-por-cobrar/cliente/CarteraCliente';

/** Cartera de un cliente: sus cuentas abiertas, antigüedad y pago con reparto. */
export default function CarteraClientePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = React.use(params);
  return <CarteraCliente customerId={customerId} origen="finanzas" />;
}
