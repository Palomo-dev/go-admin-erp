import { CuentaPorCobrarDetailPage } from '@/components/finanzas/cuentas-por-cobrar/id/CuentaPorCobrarDetailPage';

export default async function CuentaPorCobrarDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CuentaPorCobrarDetailPage accountId={id} />;
}
