'use client';

/**
 * Detalle de una nota crédito de venta (`GET /api/notas-credito/[id]`, kit).
 */
import React from 'react';
import { DetalleNota } from '@/components/finanzas/notas/DetalleNota';

export default function NotaCreditoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <DetalleNota id={id} tipo="credito" />;
}
