'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialogo, EmptyState } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { CallRowDetail, type HistoricalCallDetail } from './CallRowDetail';
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
  const [data, setData] = useState<HistoricalCallDetail | null>(null),
    [error, setError] = useState<unknown>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError(null);
    void pedirCrm<HistoricalCallDetail>(`/api/crm/calls/${id}`, { signal: abort.signal })
      .then((result) => {
        if (!Array.isArray(result.data?.recordings) || result.data.id !== id)
          throw new Error('call_detail_invalid');
        if (!abort.signal.aborted) setData(result.data);
      })
      .catch((error) => {
        if (!abort.signal.aborted) setError(error);
      });
    return () => abort.abort();
  }, [id, revision]);
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
          onReintentar={() => setRevision((value) => value + 1)}
        />
      ) : data ? (
        <CallRowDetail key={id} call={data} initialSeekMs={startMs} />
      ) : (
        <Skeleton className="h-64" />
      )}
    </Dialogo>
  );
}
