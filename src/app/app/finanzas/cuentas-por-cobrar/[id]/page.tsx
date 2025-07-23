import { CuentaPorCobrarDetailPage } from '@/components/finanzas/cuentas-por-cobrar/id/CuentaPorCobrarDetailPage';

export default function CuentaPorCobrarDetail({ params }: { params: { id: string } }) {
  return <CuentaPorCobrarDetailPage accountId={params.id} />;
}
