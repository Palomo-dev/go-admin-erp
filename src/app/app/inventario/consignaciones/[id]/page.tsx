import { LiquidacionConsignacion } from '@/components/finanzas/consignaciones/LiquidacionConsignacion';

/** Nota entregada y su liquidación «Facturar y cerrar» (la de R4-B, ahora bajo Inventario). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiquidacionConsignacion notaId={id} />;
}
