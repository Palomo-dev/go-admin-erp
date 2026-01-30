'use client';

import { useParams } from 'next/navigation';
import { VentaDetalle } from '@/components/pos/ventas/VentaDetalle';

export default function VentaDetalleRoute() {
  const params = useParams();
  const saleId = params.id as string;

  return <VentaDetalle saleId={saleId} />;
}
