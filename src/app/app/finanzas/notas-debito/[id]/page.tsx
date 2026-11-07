'use client';

/**
 * Detalle de una nota débito de venta con su cuenta por cobrar
 * (`GET /api/notas-debito/[id]`, kit).
 */
import React from 'react';
import { DetalleNota } from '@/components/finanzas/notas/DetalleNota';

export default function NotaDebitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <DetalleNota id={id} tipo="debito" />;
}
