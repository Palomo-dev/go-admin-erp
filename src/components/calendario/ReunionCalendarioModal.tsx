'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Check, Loader2, Pencil, X } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { clasesBoton } from '@/components/kit/botonClases';
import { useKitT } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { claveError, emitirCambioCrm } from '@/components/crm/acciones/apiCrm';
import { EditarReunionDialog } from '@/components/crm/timeline/entries/EditarReunionDialog';
import { cambiarReunionCalendario, leerReunionCalendario, type ReunionCalendario } from './reunionesCalendario';
import type { CalendarEvent } from './types';

/** La ficha del calendario utiliza el mismo editor y el mismo escritor que el CRM. */
export function ReunionCalendarioModal({ id, mode, initialEvent, onClose, onChanged }: {
  id: string; mode: 'view' | 'edit'; initialEvent?: CalendarEvent; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const t = useTranslations('crm.historial.reunion');
  const errores = useTranslations('crm.accionesRapidas.errores');
  const kit = useKitT();
  const { timezone, formatDateTime } = useFormatDate(null);
  const [data, setData] = useState<ReunionCalendario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(mode === 'edit');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError(null);
    leerReunionCalendario(id, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result.data);
    }).catch(e => {
      if (!controller.signal.aborted) setError(errores(claveError(e)));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, retry, errores]);

  const cambiarEstado = async (status: 'done' | 'canceled') => {
    if (busy || !data?.can_edit) return;
    setBusy(true); setError(null);
    try {
      const event = await cambiarReunionCalendario(id, { status });
      setData({ ...data, event, outcome: status });
      await onChanged();
    } catch (e) { setError(errores(claveError(e))); }
    finally { setBusy(false); }
  };

  if (editing && data?.can_edit) return <EditarReunionDialog evento={data.event} timezone={timezone}
    onCerrar={() => { setEditing(false); if (mode === 'edit') onClose(); }}
    onGuardada={event => {
      setData({ ...data, event: { ...data.event, ...event, end_at: event.end_at ?? data.event.end_at } }); setEditing(false);
      emitirCambioCrm({ entidad: 'activity', id: String(data.event.metadata?.activity_id ?? ''), accion: 'reunion' });
      void onChanged();
      if (mode === 'edit') onClose();
    }} />;
  const event = data?.event;
  const done = data?.outcome === 'done';
  const canceled = data?.outcome === 'canceled';
  const upcoming = !!event && Date.parse(event.start_at) > Date.now();
  return <PanelAdaptable abierto onAbiertoChange={open => { if (!open && !busy) onClose(); }} titulo={event?.title ?? initialEvent?.title ?? t('titulo')} icono={Calendar} ancho={520} ocupado={busy} pie={<>
    <button className={clasesBoton({ variante: 'secundario' })} type="button" onClick={onClose} disabled={busy}>{kit('comun.cerrar')}</button>
    {data?.can_edit && <button className={clasesBoton()} type="button" onClick={() => setEditing(true)} disabled={busy}><Pencil aria-hidden className="size-4" />{t('editar')}</button>}
  </>}>
    {loading && <p role="status" className="flex items-center gap-2 text-fg-secondary"><Loader2 aria-hidden className="size-4 animate-spin" />{kit('comun.cargandoDe', { etiqueta: t('titulo') })}</p>}
    {error && <div role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-danger-text"><p>{error}</p>{!data && <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>{t('reintentar')}</button>}</div>}
    {!loading && !data && initialEvent && <p className="text-[13px] text-fg-secondary">{formatDateTime(initialEvent.start_at)}{initialEvent.end_at && ` – ${formatDateTime(initialEvent.end_at)}`}</p>}
    {mode === 'edit' && data && !data.can_edit && <p role="alert" className="text-[13px] text-danger-text">{errores('sinPermiso')}</p>}
    {event && <div className="space-y-4 text-[13px] text-fg-secondary">
      <p className="font-medium text-fg">{t(canceled ? 'cancelada' : done ? 'realizada' : 'programada')}</p>
      <p>{formatDateTime(event.start_at)} – {formatDateTime(event.end_at)}</p>
      {event.location && <p className="break-words">{event.location}</p>}
      {event.description && <p className="whitespace-pre-wrap break-words">{event.description}</p>}
      {data?.can_edit && !done && !canceled && <div className="flex flex-wrap gap-2">
        <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={busy || upcoming} title={upcoming ? t('futura') : undefined} onClick={() => void cambiarEstado('done')}><Check aria-hidden className="size-4" />{t('realizada')}</button>
        <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={busy} onClick={() => void cambiarEstado('canceled')}><X aria-hidden className="size-4" />{t('cancelar')}</button>
      </div>}
    </div>}
  </PanelAdaptable>;
}
