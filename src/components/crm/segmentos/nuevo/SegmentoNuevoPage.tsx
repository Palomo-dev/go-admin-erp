'use client';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentoEditor } from '../SegmentoEditor';
import { useSegmentosData } from '../useSegmentosData';
export function SegmentoNuevoPage() {
  const t = useTranslations('crm.segmentosNuevo');
  const { loading, error, canManage } = useSegmentosData('/api/crm/segments');
  if (loading) return <Skeleton className="h-80 w-full" />;
  if (error || !canManage) return <EmptyState variante={error && ![401, 403].includes(error.status) ? 'error' : 'forbidden'} titulo={t(error && ![401, 403].includes(error.status) ? 'error' : 'forbidden')}
    accion={{ etiqueta: t('back'), href: '/app/crm/segmentos' }} />;
  return <SegmentoEditor />;
}
