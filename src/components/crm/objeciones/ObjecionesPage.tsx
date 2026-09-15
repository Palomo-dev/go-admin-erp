'use client';

/**
 * /app/crm/objeciones — biblioteca de objeciones de la organización
 * (FASE-02, brief UX §6 aplicado a F2). Tarjetas, búsqueda y filtros arriba,
 * crear/editar en hoja lateral, activar/desactivar y borrar con confirmación
 * que nombra la objeción. Rutas: `/api/crm/objections/**`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { StaggerList } from '@/components/shared/motion/staggerList';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { Objection } from '@/lib/services/crm/objectionService';
import { EMPTY_FILTERS, filterObjections, type ObjectionFilters } from '@/lib/services/crm/objectionModel';
import { cn } from '@/utils/Utils';
import { ObjectionCard } from './ObjectionCard';
import { ObjectionEditorSheet } from './ObjectionEditorSheet';
import { ObjectionsEmptyState } from './ObjectionsEmptyState';
import { ObjectionsToolbar } from './ObjectionsToolbar';
import { useObjections } from './useObjections';

export function ObjecionesPage() {
  const { objections, loading, loaded, error, reload, save, toggle, remove } = useObjections();
  const [filters, setFilters] = useState<ObjectionFilters>(EMPTY_FILTERS);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Objection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Objection | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [refocusSwitchId, setRefocusSwitchId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // «Nueva objeción» es el fallback de foco: el botón que abrió puede haberse
  // desmontado (tarjeta borrada, estado vacío tras crear la primera).
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const deletedRef = useRef(false);
  const returnDeleteFocus = useReturnFocus(deleteTarget !== null, () => newButtonRef.current);
  // Tras borrar, el botón «Eliminar» sigue en el DOM mientras la tarjeta sale
  // animada: si se borró, el foco va a «Nueva objeción»; si se canceló, vuelve.
  const onDeleteCloseAutoFocus = (event: Event) => {
    if (deletedRef.current) {
      deletedRef.current = false;
      event.preventDefault();
      newButtonRef.current?.focus();
      return;
    }
    returnDeleteFocus(event);
  };

  const shown = useMemo(() => filterObjections(objections, filters), [objections, filters]);
  const categories = useMemo(() => Array.from(new Set(objections.map((o) => o.category).filter((c): c is string => !!c))), [objections]);

  const openEditor = (objection: Objection | null) => {
    setEditing(objection);
    setEditorOpen(true);
  };

  const onToggle = async (objection: Objection) => {
    setTogglingId(objection.id);
    try {
      await toggle(objection);
      toast({ title: objection.is_active ? `«${objection.title}» desactivada` : `«${objection.title}» activada` });
    } catch (err) {
      toast({ title: 'No se pudo cambiar el estado', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setTogglingId(null);
      setRefocusSwitchId(objection.id);
    }
  };

  // El interruptor se deshabilita mientras guarda y el navegador suelta el
  // foco al body; al volver a habilitarse se le devuelve si nadie lo movió.
  useEffect(() => {
    if (!refocusSwitchId) return;
    if (document.activeElement === document.body) document.getElementById(`objection-active-${refocusSwitchId}`)?.focus();
    setRefocusSwitchId(null);
  }, [refocusSwitchId]);

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      deletedRef.current = true;
      toast({ title: `«${deleteTarget.title}» eliminada` });
    } catch (err) {
      toast({ title: 'No se pudo eliminar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-5 p-4 sm:p-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Objeciones</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Lo que dice el cliente, cómo responder y qué preguntar. El vendedor las registra en la oportunidad con dos clics.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="icon" aria-label="Actualizar lista" disabled={refreshing} onClick={() => void refresh()}>
                <RefreshCw className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
              </Button>
              <Button ref={newButtonRef} type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => openEditor(null)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nueva objeción
              </Button>
            </div>
          </header>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>{loaded ? 'No se pudo actualizar la lista' : 'No se pudieron cargar las objeciones'}</AlertTitle>
              <AlertDescription>
                {error}. {loaded ? 'Se muestra la última lista conocida; pulsa' : 'Pulsa'} «Actualizar» para reintentar.
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="space-y-4" aria-busy="true" aria-label="Cargando objeciones">
              <Skeleton className="h-9 w-full max-w-md" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
              </div>
            </div>
          ) : objections.length === 0 && (loaded || !error) ? (
            <ObjectionsEmptyState filtered={false} onCreate={() => openEditor(null)} onClearFilters={() => setFilters(EMPTY_FILTERS)} />
          ) : objections.length === 0 ? null : (
            <>
              <ObjectionsToolbar filters={filters} onChange={setFilters} total={objections.length} shown={shown.length} categories={categories} />
              {shown.length === 0 ? (
                <ObjectionsEmptyState filtered onCreate={() => openEditor(null)} onClearFilters={() => setFilters(EMPTY_FILTERS)} />
              ) : (
                <StaggerList as="ul" aria-label="Objeciones" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <AnimatePresence initial={false}>
                    {shown.map((o) => (
                      <ObjectionCard
                        key={o.id}
                        objection={o}
                        toggling={togglingId === o.id}
                        onToggle={(x) => void onToggle(x)}
                        onEdit={(x) => openEditor(x)}
                        onDelete={(x) => setDeleteTarget(x)}
                      />
                    ))}
                  </AnimatePresence>
                </StaggerList>
              )}
            </>
          )}

          <ObjectionEditorSheet
            open={editorOpen}
            objection={editing}
            onOpenChange={setEditorOpen}
            onSave={save}
            returnFocusFallback={() => newButtonRef.current}
          />

          <ConfirmDialog
            open={deleteTarget !== null}
            onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
            title="Eliminar objeción"
            description={`Se eliminará «${deleteTarget?.title ?? ''}» del catálogo. Las oportunidades donde ya estaba registrada perderán ese registro. Esta acción no se puede deshacer.`}
            confirmLabel="Eliminar"
            variant="destructive"
            onConfirm={onDelete}
            onCloseAutoFocus={onDeleteCloseAutoFocus}
          />
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
