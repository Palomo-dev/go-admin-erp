import { ConciliacionDetailPage } from '@/components/finanzas/conciliacion-bancaria/ConciliacionDetailPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConciliacionDetailPage reconciliationId={id} />;
}
