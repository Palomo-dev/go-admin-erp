import { LiquidacionAlConsignante } from '@/components/inventario/consignaciones/LiquidacionAlConsignante';

/** Liquidación al consignante (Figma R5). La cuenta por pagar o el saldo del dueño se gestionan en Finanzas. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiquidacionAlConsignante notaId={id} />;
}
