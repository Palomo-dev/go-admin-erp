'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { EmptyState } from '@/components/kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import type { TimelineEntityType, TimelineEntry, TimelineQuery } from '@/lib/services/crm/timelineService';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { useTimeline } from './hooks/useTimeline';
import { TimelineFilters } from './TimelineFilters';
import { TimelineEntryCard, type EntryAction, type EntryActionContext } from './TimelineEntryCard';

/**
 * OpportunityTimeline — único timeline del CRM (FASE-09 §5.2): consumidor de
 * /api/crm/timeline con filtros, agrupación por día, "cargar más" (botón +
 * IntersectionObserver), realtime (banner "N nuevas") y composer opcional
 * (QuickActionsBar). Sirve para oportunidad y para cliente.
 */
export interface OpportunityTimelineProps {
  entityType: TimelineEntityType;
  entityId: string;
  initialFilters?: TimelineQuery;
  pageSize?: number;
  compact?: boolean;
  showFilters?: boolean;
  showComposer?: boolean;
  /** Contexto para acciones (llamar, responder, etc.). */
  context?: EntryActionContext;
  onEntryAction?: (action: EntryAction, entry: TimelineEntry) => void;
  /**
   * F9-04/F9-29: cambia este número para forzar una recarga desde fuera (el
   * drawer lo incrementa tras crear nota/tarea/reunión o cambiar de etapa).
   * Hace falta porque `notes` no está en la publicación `supabase_realtime`.
   */
  refreshToken?: number;
  className?: string;
}

const suscribirOrganizacion = (cambiar: () => void) => {
  window.addEventListener(ORGANIZATION_CHANGED_EVENT, cambiar);
  return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, cambiar);
};
export function OpportunityTimeline(props: OpportunityTimelineProps) {
  const organizationId = useSyncExternalStore(suscribirOrganizacion, getOrganizationId, () => 0);
  return <TimelineContenido key={`${organizationId}:${props.entityType}:${props.entityId}`} {...props} />;
}

function TimelineContenido({
  entityType, entityId, initialFilters, pageSize = 30, compact, showFilters = true, showComposer = false, context, onEntryAction, refreshToken, className,
}: OpportunityTimelineProps) {
  const te = useTranslations('crm.accionesRapidas.errores');
  const t = useTranslations('crm.historial');
  const [filters, setFilters] = useState<TimelineQuery>(() => ({ ...initialFilters }));
  const [atTop, setAtTop] = useState(true);
  const [abrirNota, setAbrirNota] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { groups, entries, loading, loadingMore, error, hasMore, loadMore, refresh, realtime, newCount, showNew } = useTimeline(
    entityType, entityId, { ...filters, limit: pageSize }, { pauseNew: !atTop }
  );

  const updateFilters = useCallback((v: TimelineQuery) => {
    setFilters(v);
  }, []);

  // ¿El usuario está arriba? (para no mover el scroll con entradas nuevas)
  useEffect(() => {
    const el = topRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setAtTop(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Cargar más al llegar al final
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) loadMore(); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  // Recarga forzada desde el contenedor (F9-04)
  useEffect(() => {
    if (refreshToken === undefined) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const handleActionCompleted = useCallback(() => { void refresh(); }, [refresh]);
  const handleEntryAction = useCallback((a: EntryAction, e: TimelineEntry) => {
    onEntryAction?.(a, e);
    if (a === 'changed' || a === 'reply_whatsapp' || a === 'apply_analysis') void refresh();
  }, [onEntryAction, refresh]);

  const emptyCtx = context ?? {};
  const filtrado = !!(filters.kinds?.length || filters.channels?.length || filters.userId || filters.from || filters.to);

  return (
    <section className={cn('space-y-3 rounded-xl border border-line bg-surface px-3.5 py-3', className)} aria-label={t('actividad')}>
      <div ref={topRef} />
      {(showComposer || showFilters) && (
        <div className="flex flex-col gap-2">
          {showComposer && (
            <AccionesRapidasCrm variante="drawer" oportunidadId={entityType === 'opportunity' ? entityId : emptyCtx.opportunityId} clienteId={entityType === 'customer' ? entityId : emptyCtx.customerId} cliente={emptyCtx.customer} onAccionCompletada={handleActionCompleted} />
          )}
          {showFilters && (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0"><TimelineFilters value={filters} onChange={updateFilters} compact={compact} /></div>
              <div className="flex items-center gap-1 shrink-0" title={t(realtime === 'live' ? 'live' : realtime === 'polling' ? 'polling' : 'conectando')}>
                {realtime === 'live' ? <Wifi className="h-3.5 w-3.5 text-success-text" aria-label={t('live')} /> : realtime === 'polling' ? <WifiOff className="h-3.5 w-3.5 text-warning-text" aria-label={t('polling')} /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-muted" />}
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void refresh()} aria-label={t('actualizar')}><RefreshCw className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </div>
      )}

      {newCount > 0 && (
        <button type="button" onClick={() => { showNew(); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="w-full rounded-md bg-brand-tint text-brand-deep text-xs py-1.5 inline-flex items-center justify-center gap-1 hover:bg-hover">
          <ArrowUp className="h-3 w-3" />{t('nuevas', { n: newCount })}
        </button>
      )}

      {error && (
        <EmptyState compacto variante={error === 'sinPermiso' ? 'forbidden' : 'error'} descripcion={te(error)} onReintentar={() => void refresh()} />
      )}

      <div role="feed" aria-busy={loading} className="relative">
        {loading && entries.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="space-y-2 rounded-lg border border-line p-3"><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>)}
          </div>
        ) : entries.length === 0 && !error ? (
          <div>
            {filtrado ? <EmptyState compacto variante="search" onLimpiarFiltros={() => updateFilters({})} />
              : <EmptyState compacto variante="empty" titulo={t('actividad')} descripcion={t('vacio')}
                accion={{ etiqueta: t('agregarNota'), onClick: () => setAbrirNota(n => n + 1) }} />}
            <AccionesRapidasCrm sinBarra variante="drawer" abrirAccion={abrirNota ? { accion: 'nota', clave: abrirNota } : null}
              oportunidadId={entityType === 'opportunity' ? entityId : emptyCtx.opportunityId}
              clienteId={entityType === 'customer' ? entityId : emptyCtx.customerId} cliente={emptyCtx.customer}
              onAccionCompletada={handleActionCompleted} />
          </div>
        ) : (
          <div className="relative">
            {groups.map((g) => (
              <div key={g.day} className="mb-4">
                <h4 className="sticky top-0 z-[1] mb-2 bg-surface px-1 py-1 text-[11px] text-fg-muted">{g.label}</h4>
                <div className="space-y-2">
                  {g.entries.map((e) => (
                    <TimelineEntryCard key={`${e.kind}:${e.id}`} entry={e} compact={compact} context={context} onAction={handleEntryAction} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center pt-1">
          <Button type="button" variant="outline" size="sm" className="h-8 w-full text-xs" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{t('mas')}
          </Button>
        </div>
      )}
    </section>
  );
}

export default OpportunityTimeline;
