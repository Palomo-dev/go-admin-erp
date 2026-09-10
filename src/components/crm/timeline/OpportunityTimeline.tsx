'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, RefreshCw, Wifi, WifiOff, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import type { TimelineEntityType, TimelineEntry, TimelineQuery } from '@/lib/services/crm/timelineService';
import { QuickActionsBar } from '@/components/crm/shared/QuickActionsBar';
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

const STORAGE_KEY = 'crm.timeline.filters';

function readStoredFilters(): TimelineQuery | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as TimelineQuery) : null;
  } catch {
    return null;
  }
}

export function OpportunityTimeline({
  entityType, entityId, initialFilters, pageSize = 30, compact, showFilters = true, showComposer = false, context, onEntryAction, refreshToken, className,
}: OpportunityTimelineProps) {
  const [filters, setFilters] = useState<TimelineQuery>(() => ({ ...(readStoredFilters() ?? {}), ...(initialFilters ?? {}) }));
  const [atTop, setAtTop] = useState(true);
  const topRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { groups, entries, loading, loadingMore, error, hasMore, loadMore, refresh, realtime, newCount, showNew } = useTimeline(
    entityType, entityId, { ...filters, limit: pageSize }, { pauseNew: !atTop }
  );

  const updateFilters = useCallback((v: TimelineQuery) => {
    setFilters(v);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
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

  return (
    <section className={cn('space-y-3', className)} aria-label="Actividad">
      <div ref={topRef} />
      {(showComposer || showFilters) && (
        <div className="flex flex-col gap-2">
          {showComposer && (
            <QuickActionsBar variant="drawer" opportunityId={entityType === 'opportunity' ? entityId : emptyCtx.opportunityId} customerId={entityType === 'customer' ? entityId : emptyCtx.customerId} customer={emptyCtx.customer} onActionCompleted={handleActionCompleted} />
          )}
          {showFilters && (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0"><TimelineFilters value={filters} onChange={updateFilters} compact={compact} /></div>
              <div className="flex items-center gap-1 shrink-0" title={realtime === 'live' ? 'Tiempo real activo' : realtime === 'polling' ? 'Sin tiempo real: actualizando cada 15 s' : 'Conectando…'}>
                {realtime === 'live' ? <Wifi className="h-3.5 w-3.5 text-green-500" aria-label="Tiempo real activo" /> : realtime === 'polling' ? <WifiOff className="h-3.5 w-3.5 text-amber-500" aria-label="Sin tiempo real" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void refresh()} aria-label="Actualizar"><RefreshCw className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </div>
      )}

      {newCount > 0 && (
        <button type="button" onClick={() => { showNew(); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="w-full rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs py-1.5 inline-flex items-center justify-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/50">
          <ArrowUp className="h-3 w-3" />{newCount} {newCount === 1 ? 'entrada nueva' : 'entradas nuevas'}
        </button>
      )}

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span>{error}</span>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void refresh()}>Reintentar</Button>
        </div>
      )}

      <div role="feed" aria-busy={loading} className="relative">
        {loading && entries.length === 0 ? (
          <div className="space-y-3 pl-10">
            {[0, 1, 2].map((i) => <div key={i} className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3"><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>)}
          </div>
        ) : entries.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <Inbox className="h-9 w-9 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay interacciones. Empieza con una llamada, un email o una nota.</p>
            {!showComposer && (
              <QuickActionsBar variant="drawer" opportunityId={entityType === 'opportunity' ? entityId : emptyCtx.opportunityId} customerId={entityType === 'customer' ? entityId : emptyCtx.customerId} customer={emptyCtx.customer} onActionCompleted={handleActionCompleted} className="justify-center" />
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[13px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />
            {groups.map((g) => (
              <div key={g.day} className="mb-4">
                <h4 className="sticky top-0 z-[1] -mx-1 mb-2 bg-white/90 dark:bg-gray-900/90 backdrop-blur px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{g.label}</h4>
                <div className="space-y-3">
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
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Cargar más
          </Button>
        </div>
      )}
    </section>
  );
}

export default OpportunityTimeline;
