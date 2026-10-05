'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Users, RefreshCw } from 'lucide-react';
import { useMigasAreaCrm } from '../../campanas/migasCrm';
import { PageHeader } from '@/components/kit/PageHeader';
import { EmptyState } from '@/components/kit/EmptyState';
import { Pagination } from '@/components/kit/Pagination';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import type { LecturaSegmento, SegmentoRegistro } from '@/lib/services/crm/segmentosAudiencia';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useSegmentosData } from '../useSegmentosData';
import { SegmentoCifras } from '../SegmentoCifras';
import { SegmentoMiembros } from '../SegmentoMiembros';
import { SegmentoEditor } from '../SegmentoEditor';
export function SegmentoDetallePage({ segmentId }: { segmentId: string }) {
  const migas = useMigasAreaCrm('/app/crm/segmentos');
  const t = useTranslations('crm.segmentosNuevo');
  const { formatDateTime } = useFormatDate(null);
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [editing, setEditing] = useState(useSearchParams()?.get('edit') === '1');
  const record = useSegmentosData<SegmentoRegistro>(`/api/crm/segments/${segmentId}`, revision);
  const audience = useSegmentosData<LecturaSegmento>(!record.data || editing ? null : `/api/crm/segments/${segmentId}/members?page=${page}`, revision);
  const refresh = () => setRevision(n => n + 1);
  if (editing && record.data && record.canManage) return <SegmentoEditor initial={record.data} onCancel={() => { setEditing(false); refresh(); }} />;
  const segment = record.data;
  const actions = <><button className={clasesBoton({ variante: 'secundario' })} onClick={refresh} aria-label={t('retry')}><RefreshCw className="size-4" /></button>
    {record.canManage && <button onClick={() => setEditing(true)} className={clasesBoton({ variante: 'secundario' })}>{t('edit')}</button>}
    {segment && !audience.error && !audience.loading && <><Link href={`/app/crm/secuencias?segment_id=${segmentId}`} className={clasesBoton({ variante: 'secundario' })}>{t('useSequence')}</Link>
      <Link href={`/app/crm/campanas/nuevo?segment_id=${segmentId}`} className={clasesBoton()}>{t('useCampaign')}</Link></>}</>;
  return <div className="space-y-4 bg-canvas p-4 sm:p-6">
    <PageHeader migas={migas} titulo={segment?.name ?? t('members')} icono={Users} variante="detail" volverA="/app/crm/segmentos" acciones={actions} cargando={record.loading}
      subtitulo={segment ? `${t(segment.is_dynamic === false ? 'static' : 'dynamic')} · ${t('updated')} ${formatDateTime(segment.updated_at)}` : undefined} />
    {record.loading ? <Skeleton className="h-64 w-full" /> : record.error ? <EmptyState variante={[401, 403].includes(record.error.status) ? 'forbidden' : 'error'} onReintentar={refresh} accion={{ etiqueta: t('back'), href: '/app/crm/segmentos' }} />
      : <><SegmentoCifras counts={audience.data?.counts ?? null} loading={audience.loading} />
        {audience.loading ? <Skeleton className="h-64 w-full" /> : audience.error ? <EmptyState variante={[401, 403].includes(audience.error.status) ? 'forbidden' : 'error'}
          descripcion={audience.error.codigo === 'snapshot_requerido' ? t('snapshotRequired') : undefined} onReintentar={refresh} />
          : !audience.data?.members.length ? <EmptyState variante="search" titulo={t('noResults')} onLimpiarFiltros={() => setPage(1)} />
          : <><SegmentoMiembros rows={audience.data.members} snapshot={segment?.is_dynamic === false ? segment.members_snapshotted_at : null} />
            <Pagination pagina={page} tamano={25} total={audience.data.counts.total} onPaginaChange={setPage} layout="compact" densidad="compacta" /></>}
      </>}
    <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
  </div>;
}
