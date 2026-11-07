import { TransferenciaDetalle } from '@/components/finanzas/tesoreria/transferencias/TransferenciaDetalle';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransferenciaDetalle id={id} />;
}
