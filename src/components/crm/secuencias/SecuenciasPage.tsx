'use client';

/**
 * /app/crm/secuencias — secuencias multicanal (FASE-08 §5.1, rediseño UX
 * brief 6.3). Lista en tarjetas con mini-línea de tiempo, inscritos activos y
 * tasa de respuesta; búsqueda y chips de filtro arriba; editor en línea de
 * tiempo vertical; inscripción con advertencia de envíos reales.
 *
 * Toda la lógica sigue en las rutas de `src/app/api/crm/sequences/**` y en
 * `sequenceService.ts` (F8): aquí solo hay presentación.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { AnimatePresence } from '@/components/shared/motion/primitives';
import { StaggerItem, StaggerList } from '@/components/shared/motion/staggerList';
import { SequenceCard } from './SequenceCard';
import { SequenceEmptyState } from './SequenceEmptyState';
import { SequenceEditorDialog } from './SequenceEditorDialog';
import { EnrollDialog } from './EnrollDialog';
import { EnrollmentsSheet } from './EnrollmentsSheet';
import { useSequences, type SequenceView } from './useSequences';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';

type StatusFilter = 'all' | 'active' | 'inactive';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

export function SecuenciasPage() {
  const { sequences, loading, error, reload, save, toggle, remove, enroll } = useSequences();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SequenceView | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<SequenceView | null>(null);
  const [sheetTarget, setSheetTarget] = useState<SequenceView | null>(null);
  const [sheetRefresh, setSheetRefresh] = useState(0);
  const [deleting, setDeleting] = useState<SequenceView | null>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  // Si el botón que abrió un diálogo ya no existe al cerrarlo (la tarjeta se
  // filtró o se borró), el foco va a «Nueva secuencia», nunca al body.
  const focusFallback = useCallback(() => newButtonRef.current, []);
  // La confirmación de borrado devuelve el foco por `onCloseAutoFocus` del
  // `ConfirmDialog`, como `EnrollmentsSheet` (antes: sondeo de hasta 3 s).
  const onDeleteCloseAutoFocus = useReturnFocus(deleting !== null, focusFallback);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sequences.filter((s) => {
      if (status === 'active' && !s.is_active) return false;
      if (status === 'inactive' && s.is_active) return false;
      return !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q);
    });
  }, [sequences, query, status]);

  const openCreate = () => { setEditing(null); setEditorOpen(true); };

  const runAction = async (fn: () => Promise<unknown>, okTitle: string) => {
    try {
      await fn();
      toast({ title: okTitle });
      // Activar/desactivar con un filtro de estado puesto saca la tarjeta de
      // la rejilla (tras la animación de salida, ≤300 ms) y el `Switch`
      // pulsado desaparece: el foco no se queda en el body.
      window.setTimeout(() => { if (document.activeElement === document.body) newButtonRef.current?.focus(); }, 400);
    } catch (err) {
      toast({ title: 'Operación no realizada', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={300}>
        <div className="space-y-5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Secuencias</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Pasos por canal con esperas entre ellos. Cada paso sale del servidor una sola vez.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void reload()} aria-label="Actualizar la lista">
                <RefreshCw className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Actualizar</span>
              </Button>
              <Button ref={newButtonRef} className="bg-blue-600 text-white hover:bg-blue-700" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nueva secuencia
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <Label htmlFor="seq-search" className="sr-only">Buscar secuencia por nombre</Label>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <Input id="seq-search" className="pl-8" placeholder="Buscar por nombre" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div role="group" aria-label="Filtrar por estado" className="flex gap-1.5">
              {FILTERS.map((f) => {
                const selected = status === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setStatus(f.value)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            {!loading && (
              <p className="text-sm text-gray-500 dark:text-gray-400 sm:ml-auto" aria-live="polite">
                {filtered.length} de {sequences.length}
              </p>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error} — pulsa «Actualizar» para reintentar.
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <SequenceEmptyState
              filtered={sequences.length > 0}
              onCreate={openCreate}
              onClearFilters={() => { setQuery(''); setStatus('all'); }}
            />
          ) : (
            <StaggerList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map((sequence) => (
                  <StaggerItem key={sequence.id}>
                    <SequenceCard
                      sequence={sequence}
                      onToggle={(s) => void runAction(() => toggle(s), s.is_active ? 'Secuencia desactivada' : 'Secuencia activada')}
                      onEnroll={setEnrollTarget}
                      onEnrollments={setSheetTarget}
                      onEdit={(s) => { setEditing(s); setEditorOpen(true); }}
                      onDelete={setDeleting}
                    />
                  </StaggerItem>
                ))}
              </AnimatePresence>
            </StaggerList>
          )}

          <SequenceEditorDialog open={editorOpen} sequence={editing} onOpenChange={setEditorOpen} onSave={save} returnFocusFallback={focusFallback} />

          <EnrollDialog
            open={enrollTarget !== null}
            sequence={enrollTarget}
            onOpenChange={(open) => { if (!open) setEnrollTarget(null); }}
            onEnroll={enroll}
            onDone={async () => { setSheetRefresh((n) => n + 1); await reload(); }}
            returnFocusFallback={focusFallback}
          />

          <EnrollmentsSheet
            sequence={sheetTarget}
            refreshKey={sheetRefresh}
            onOpenChange={(open) => { if (!open) setSheetTarget(null); }}
            onEnroll={setEnrollTarget}
            returnFocusFallback={focusFallback}
          />

          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(open) => { if (!open) setDeleting(null); }}
            onCloseAutoFocus={onDeleteCloseAutoFocus}
            title={`Eliminar «${deleting?.name ?? ''}»`}
            description="Se borra la secuencia y sus pasos. Las inscripciones en curso dejan de avanzar. Esta acción no se puede deshacer."
            confirmLabel="Eliminar"
            variant="destructive"
            onConfirm={async () => {
              if (deleting) await runAction(() => remove(deleting.id), 'Secuencia eliminada');
            }}
          />
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
