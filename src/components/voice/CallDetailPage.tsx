'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download, Phone } from 'lucide-react';
import { PageHeader, EmptyState } from '@/components/kit';
import { KbdButton } from '@/components/kit/KbdButton';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { rutaActiva } from '@/lib/navigation/filtrar';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { CallButton } from './CallButton';
import { CallRowDetail } from './CallRowDetail';
import { useHistoricalCall } from './useHistoricalCall';
import { downloadCallRecording } from './recordingDownload';

export function CallDetailPage({ id, startMs = null }: { id: string; startMs?: number | null }) {
  const t = useTranslations('crm.llamadas'), locale = useLocale();
  const nav = useTranslations('nav'), nombres = useNombresNav();
  const route = rutaActiva(`/app/crm/llamadas/${id}`);
  const breadcrumbs = route ? [{ etiqueta: nav(route.modulo.etiqueta), href: route.modulo.rutas[0] }, ...(route.pagina ? [{ etiqueta: nombres.pagina(route.pagina), href: route.pagina.href }] : [])] : undefined;
  const { data, error, reload } = useHistoricalCall(id);
  const { formatDateTime } = useFormatDate();
  const [downloading, setDownloading] = useState(false);
  const number = data ? data.direction === 'inbound' ? data.from_number : data.to_number : '';
  const name = data?.customer?.full_name || [data?.customer?.first_name, data?.customer?.last_name].filter(Boolean).join(' ') || number;
  const recording = data?.recordings.find((entry) => entry.status === 'ready');
  const subtitle = data ? [t(`direcciones.${data.direction}`), t.has(`modos.${data.mode}`) ? t(`modos.${data.mode}`) : data.mode, formatDateTime(data.started_at ?? data.created_at), typeof data.duration_seconds === 'number' ? `${Math.floor(data.duration_seconds / 60)}:${String(data.duration_seconds % 60).padStart(2, '0')}` : null].filter(Boolean).join(' · ') : t('ficha.cargandoDetalle');
  const callback = data ? <CallButton phoneNumber={number} customerId={data.customer_id} opportunityId={data.opportunity_id} displayName={name} diseno="kit" variant="default" size="default" label={t('ficha.volverLlamada')}  /> : null;
  const mobileCallback = data ? <CallButton phoneNumber={number} customerId={data.customer_id} opportunityId={data.opportunity_id} displayName={name} diseno="kit" variant="default" size="default" label={t('ficha.devolver')} /> : null;
  const download = async () => {
    if (!recording || downloading) return;
    setDownloading(true);
    try { await downloadCallRecording(recording.id); }
    catch { toast({ title: t('ficha.errorDescargar'), variant: 'destructive' }); }
    finally { setDownloading(false); }
  };
  return <div className="bg-canvas p-4 lg:p-6" data-call-detail-page>
    <PageHeader migas={breadcrumbs} variante="detail" icono={Phone} titulo={data ? t('fila', { nombre: name }) : t('titulo')} subtitulo={subtitle} volverA="/app/crm/llamadas" cargando={!data && !error}
      acciones={<><KbdButton patron="button" tamano="md" variante="secundario" icono={Download} disabled={!recording} cargando={downloading} onClick={() => void download()}>{t('ficha.descargarAudio')}</KbdButton>{callback}</>}
      movil={{ titulo: name || t('titulo'), subtitulo: subtitle, ocultarBarra: false }} />
    <div className="lg:mt-4">{error ? <EmptyState variante={error instanceof ErrorApiCrm && error.status === 403 ? 'forbidden' : 'error'} onReintentar={reload} /> : data ? <>
      <CallRowDetail key={id} call={data} initialSeekMs={startMs} onLinked={reload} locale={locale} mobileCallback={mobileCallback} />
    </> : <Skeleton className="h-64 rounded-xl" />}</div>
  </div>;
}
