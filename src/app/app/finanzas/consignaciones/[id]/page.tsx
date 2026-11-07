import { LiquidacionConsignacion } from '@/components/finanzas/consignaciones/LiquidacionConsignacion';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiquidacionConsignacion notaId={id} />;
}
