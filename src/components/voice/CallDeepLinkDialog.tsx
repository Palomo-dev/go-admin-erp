'use client';
import { useTranslations } from 'next-intl';
import { Dialogo, EmptyState } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { CallRowDetail } from './CallRowDetail';
import { useHistoricalCall } from './useHistoricalCall';
export function CallDeepLinkDialog({
  id,
  startMs,
  onClose,
}: {
  id: string;
  startMs: number | null;
  onClose: () => void;
}) {
  const t = useTranslations('crm.objecionesNuevo');
  const { data, error, reload } = useHistoricalCall(id);
  return (
    <Dialogo
      abierto
      onAbiertoChange={(open) => !open && onClose()}
      titulo={t('callDetail')}
      ancho={1024}
      primario={{ etiqueta: t('close'), onClick: onClose }}
    >
      {error ? (
        <EmptyState
          variante={error instanceof ErrorApiCrm && error.status === 403 ? 'forbidden' : 'error'}
          onReintentar={reload}
        />
      ) : data ? (
        <CallRowDetail key={id} call={data} initialSeekMs={startMs} onLinked={reload} />
      ) : (
        <Skeleton className="h-64" />
      )}
    </Dialogo>
  );
}
