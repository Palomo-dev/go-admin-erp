'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUp, Check, ChevronsDownUp, ChevronsUpDown, History, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { TimelineEntry } from '@/components/crm/kit/TimelineEntry';
import { CargarMas } from '@/components/crm/kit/CargarMas';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { claveError, emitirCambioCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { useTimeline } from '@/components/crm/timeline/hooks/useTimeline';
import { CuerpoEntradaTimeline } from '@/components/crm/timeline/TimelineEntryCard';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { TimelineEntry as EntradaServidor } from '@/lib/services/crm/timelineService';
import { agruparPorDia, CHIPS_ACTIVIDAD, entradaDeTimeline, kindsDeChip, tieneDetalle, type ChipActividad } from './pestanasLogica';

/**
 * Pestaña «Actividad» de la oportunidad (Figma 820:66213 drawer, 775:473076
 * detalle, vacío 823:245355, móvil 824:171262): chips por tipo, «En vivo» y
 * actualizar, aviso «N entradas nuevas · Ver», días «Hoy / Ayer» y las filas
 * del kit (`TimelineEntry`). Datos de `GET /api/crm/timeline/opportunity/[id]`
 * (llamadas, correos, WhatsApp, tareas, notas, reuniones y cambios de etapa)
 * con tiempo real o sondeo. «Ver detalle» abre la grabación, la transcripción,
 * el correo o el chat. En el detalle va además el compositor de notas.
 */
export interface PestanaActividadProps {
  oportunidadId: string;
  oportunidadNombre?: string | null;
  clienteId?: string | null;
  cliente?: { id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null; do_not_call?: boolean | null } | null;
  variante?: 'drawer' | 'detalle';
  refreshToken?: number;
}

const PUNTO_VIVO: Record<'live' | 'polling' | 'connecting', string> = { live: 'bg-success', polling: 'bg-warning', connecting: 'bg-fg-muted' };

export function PestanaActividad({ oportunidadId, oportunidadNombre, clienteId, cliente, variante = 'drawer', refreshToken }: PestanaActividadProps) {
  const t = useTranslations('crm.oportunidad.pestanas.actividad');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const [chip, setChip] = useState<ChipActividad>('todo');
  const [arriba, setArriba] = useState(true);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const filtros = useMemo(() => ({ kinds: kindsDeChip(chip), limit: 20 }), [chip]);
  const tl = useTimeline('opportunity', oportunidadId, filtros, { pauseNew: !arriba });
  const { refresh } = tl;

  useEffect(() => {
    const el = topRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setArriba(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (refreshToken !== undefined) void refresh();
  }, [refreshToken, refresh]);

  const ahora = new Date();
  const grupos = agruparPorDia(tl.entries, (e) => e.occurred_at, timezone, ahora, idioma);
  const alternar = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const guardarNota = async () => {
    const texto = nota.trim();
    if (!texto) return;
    setGuardando(true);
    try {
      const html = `<p>${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
      await pedirCrm('/api/crm/notes', { method: 'POST', cuerpo: { related_type: 'opportunity', related_id: oportunidadId, body: html } });
      setNota('');
      emitirCambioCrm({ entidad: 'note', id: oportunidadId, accion: 'crear' });
      toast({ title: t('notaGuardada') });
      void refresh();
    } catch (e) {
      toast({ title: t('errorNota'), description: claveError(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const fila = (e: EntradaServidor) => {
    const clave = `${e.kind}:${e.id}`;
    const abierta = abiertas.has(clave);
    return (
      <li key={clave} className="flex flex-col gap-2">
        <TimelineEntry
          entrada={entradaDeTimeline(e, t)}
          ahora={ahora}
          onAbrir={tieneDetalle(e) ? () => alternar(clave) : undefined}
          accionesExtra={tieneDetalle(e) ? [{ id: 'detalle', etiqueta: t(abierta ? 'ocultarDetalle' : 'verDetalle'), icono: abierta ? ChevronsDownUp : ChevronsUpDown, onSelect: () => alternar(clave) }] : []}
        />
        {abierta && (
          <div className="ml-11 rounded-xl border border-line bg-surface p-3 text-sm text-fg">
            <CuerpoEntradaTimeline entry={e} compact={variante === 'drawer'} context={{ opportunityId: oportunidadId, customerId: clienteId ?? undefined, customer: cliente ? { ...cliente, id: cliente.id ?? undefined } : null }} onAction={() => void refresh()} />
          </div>
        )}
      </li>
    );
  };

  const vacio = !tl.loading && !tl.error && tl.entries.length === 0;

  return (
    <section aria-label={t('aria')} className="flex flex-col gap-3">
      <div ref={topRef} />
      {variante === 'detalle' && (
        <form className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2" onSubmit={(ev) => { ev.preventDefault(); void guardarNota(); }}>
          <input value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder={t('compositor')} aria-label={t('compositor')} maxLength={5000} className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none" />
          <button type="submit" disabled={guardando || !nota.trim()} className={clasesBoton({ tamano: 'sm' })}>{t('guardarNota')}</button>
        </form>
      )}
      <div className="flex items-center gap-2">
        <div role="group" aria-label={t('chipsAria')} className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible">
          {CHIPS_ACTIVIDAD.map((c) => {
            const activo = chip === c;
            return (
              <button key={c} type="button" aria-pressed={activo} onClick={() => setChip(c)} className={cn('inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', activo ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover')}>
                {activo && <Check aria-hidden="true" className="size-3.5" />}
                {t(`chips.${c}`)}
              </button>
            );
          })}
        </div>
        {variante === 'drawer' && (
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <span className="inline-flex items-center gap-1.5 text-xs text-fg-secondary" title={t(`vivo.${tl.realtime}Detalle`)}>
              <span aria-hidden="true" className={cn('size-2 rounded-full', PUNTO_VIVO[tl.realtime])} />
              {t(`vivo.${tl.realtime}`)}
            </span>
            <button type="button" onClick={() => void refresh()} aria-label={t('actualizar')} className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <RefreshCw aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
      </div>

      {tl.newCount > 0 && (
        <button type="button" onClick={() => { tl.showNew(); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-brand-tint text-[13px] font-medium text-brand-deep hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <ArrowUp aria-hidden="true" className="size-3.5" />
          {t('nuevas', { n: tl.newCount })}
        </button>
      )}

      {tl.loading && tl.entries.length === 0 ? (
        <ul aria-busy="true" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <li key={i} className="h-[76px] animate-pulse rounded-xl bg-subtle" />)}
        </ul>
      ) : tl.error && tl.entries.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" compacto titulo={t('errorTitulo')} descripcion={t('errorDetalle')} onReintentar={() => void refresh()} />
        </div>
      ) : vacio && chip === 'todo' ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-4 py-8 text-center">
          <History aria-hidden="true" className="size-6 text-fg-secondary" strokeWidth={1.5} />
          <p className="text-base font-semibold text-fg">{t('vacioTitulo')}</p>
          <p className="max-w-md text-[13px] text-fg-secondary">{t('vacioDetalle')}</p>
          <AccionesRapidasCrm variante="drawer" oportunidadId={oportunidadId} oportunidadNombre={oportunidadNombre} clienteId={clienteId} cliente={cliente} onAccionCompletada={() => void refresh()} className="justify-center" />
        </div>
      ) : vacio ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="search" compacto titulo={t('sinResultados')} descripcion={t('sinResultadosDetalle')} accion={{ etiqueta: t('verTodo'), onClick: () => setChip('todo') }} />
        </div>
      ) : (
        <>
          {variante === 'drawer' ? (
            grupos.map((g) => (
              <div key={g.dia || 'sin-fecha'} className="flex flex-col gap-2">
                <h4 className="text-[13px] font-medium text-fg-secondary">{g.clave === 'fecha' ? g.fecha : t(g.clave)}</h4>
                <ul className="flex flex-col gap-2">{g.entradas.map(fila)}</ul>
              </div>
            ))
          ) : (
            <ul className="flex flex-col gap-3">{tl.entries.map(fila)}</ul>
          )}
          {(tl.hasMore || tl.entries.length > 0) && <CargarMas mostrados={tl.entries.length} total={null} hayMas={tl.hasMore} cargando={tl.loadingMore} error={tl.error} onCargar={tl.loadMore} entidad="actividades" />}
        </>
      )}
    </section>
  );
}
