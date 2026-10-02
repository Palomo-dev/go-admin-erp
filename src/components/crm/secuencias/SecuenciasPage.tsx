'use client';
import { useSequenceText } from './useSequenceText';

/**
 * /app/crm/secuencias — secuencias multicanal (FASE-08 §5.1, rediseño UX
 * brief 6.3). Lista en tarjetas con mini-línea de tiempo, inscritos activos y
 * tasa de respuesta; búsqueda y chips de filtro arriba; editor en línea de
 * tiempo vertical; inscripción con advertencia de envíos reales.
 *
 * Toda la lógica sigue en las rutas de `src/app/api/crm/sequences/**` y en
 * `sequenceService.ts` (F8): aquí solo hay presentación.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SequenceDeleteDialog } from './SequenceDeleteDialog';
import { SequencesTable } from './SequencesTable';
import { PageHeader, StatCard, useEsEscritorio } from '@/components/kit';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { AnimatePresence, StaggerItem, StaggerList } from '@/components/shared/motion';
import { SequenceCard } from './SequenceCard';
import { SequenceEmptyState } from './SequenceEmptyState';
import { SequenceEditorDialog } from './SequenceEditorDialog';
import { EnrollDialog } from './EnrollDialog';
import { EnrollmentsSheet } from './EnrollmentsSheet';
import { useSequences, type SequenceView } from './useSequences';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { SearchInput } from '@/components/kit/SearchInput';

type StatusFilter = 'all' | 'active' | 'inactive';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Activas' },
  { value: 'inactive', label: 'Inactivas' },
];

export function SecuenciasPage() {
 const tr=useSequenceText();
  const { sequences, loading, error, reload, save, toggle, remove, enroll,canManage,summary,organizationId } = useSequences();
  const desktop=useEsEscritorio(),pending=useRef(false);
  const [busy,setBusy]=useState(false);
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

  useEffect(()=>{setEditing(null);setEditorOpen(false);setEnrollTarget(null);setSheetTarget(null);setDeleting(null);setQuery('');setStatus('all');},[organizationId]);
  const openCreate = () => { if(!canManage)return; setEditing(null); setEditorOpen(true); };

  const runAction = async (fn: () => Promise<unknown>, okTitle: string) => {
    if(!canManage||pending.current)return false;pending.current=true;setBusy(true);
    try {
      await fn();
      toast({ title: okTitle });
      // Activar/desactivar con un filtro de estado puesto saca la tarjeta de
      // la rejilla (tras la animación de salida, ≤300 ms) y el `Switch`
      // pulsado desaparece: el foco no se queda en el body.
      window.setTimeout(() => { if (document.activeElement === document.body) newButtonRef.current?.focus(); }, 400);
      return true;
    } catch (err) {
      toast({ title: tr("Operación no realizada"), description: err instanceof Error ? err.message : tr("Error desconocido"), variant: 'destructive' });return false;
    }finally{pending.current=false;setBusy(false);}
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={tr('Secuencias')} subtitulo={tr('Pasos por canal con esperas entre ellos. Cada paso sale del servidor una sola vez.')} icono={GitBranch} migas={[{etiqueta:'CRM',href:'/app/crm'},{etiqueta:tr('Secuencias')}]} acciones={<div className="flex gap-2"><Button variant="outline" onClick={()=>void reload()} disabled={busy} aria-label={tr('Actualizar la lista')}><RefreshCw strokeWidth={1.5} className="h-4 w-4 sm:mr-1.5"/><span className="hidden sm:inline">{tr('Actualizar')}</span></Button>{canManage&&<Button ref={newButtonRef} className="bg-brand text-white hover:bg-brand-deep" onClick={openCreate}><Plus strokeWidth={1.5} className="mr-1.5 h-4 w-4"/>{tr('Nueva secuencia')}</Button>}</div>}/>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard etiqueta={tr('Inscritos activos')} valor={summary?.active_enrollments??'—'} cargando={loading}/><StatCard etiqueta={tr('Pausadas por respuesta')} valor={summary?.replied_enrollments??'—'} cargando={loading}/><StatCard etiqueta={tr('Reuniones (30 días)')} valor={summary?.meetings_available?summary.meetings_30d??'—':'—'} cargando={loading}/><StatCard etiqueta={tr('Pausadas')} valor={summary?.paused_enrollments??'—'} cargando={loading}/></div>

        {summary && !summary.meetings_available && <p role="note" className="text-xs text-fg-muted">{tr('Las reuniones aún no están vinculadas a inscripciones; esta cifra no está disponible.')}</p>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            onValueChange={setQuery}
            placeholder={tr("Buscar por nombre")}
            id="seq-search"
            className="sm:max-w-xs sm:flex-1"
            etiqueta={tr("Buscar secuencia por nombre")}
          />
          <div role="group" aria-label={tr("Filtrar por estado")} className="flex gap-1.5">
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
                      ? 'border-brand bg-brand text-white'
                      : 'border-line-strong bg-surface text-fg-secondary hover:bg-subtle dark:border-gray-600 dark:bg-surface dark:text-fg dark:hover:bg-hover'
                  }`}
                >
                  {tr(f.label)}
                </button>
              );
            })}
          </div>
          {!loading && (
            <p className="text-sm text-fg-muted dark:text-fg-secondary sm:ml-auto" aria-live="polite">
              {filtered.length} {tr("de")}{sequences.length}
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {tr(error)} {tr("— pulsa «Actualizar» para reintentar.")}</div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <SequenceEmptyState
            canManage={canManage}
            filtered={sequences.length > 0}
            onCreate={openCreate}
            onClearFilters={() => { setQuery(''); setStatus('all'); }}
          />
        ) : desktop ? <SequencesTable sequences={filtered} canManage={canManage} busy={busy} onToggle={s=>void runAction(()=>toggle(s),s.is_active?tr("Secuencia desactivada"):tr("Secuencia activada"))} onEdit={s=>{if(canManage){setEditing(s);setEditorOpen(true);}}} onDelete={s=>{if(canManage)setDeleting(s);}} onEnroll={s=>{if(canManage)setEnrollTarget(s);}} onEnrollments={setSheetTarget}/> : (
          <StaggerList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout" initial={false}>
              {filtered.map((sequence) => (
                <StaggerItem key={sequence.id}>
                  <SequenceCard
                    sequence={sequence}
                    canManage={canManage&&!busy}
                    onToggle={(s) => void runAction(() => toggle(s), s.is_active ? tr("Secuencia desactivada") : tr("Secuencia activada"))}
                    onEnroll={s=>{if(canManage)setEnrollTarget(s);}}
                    onEnrollments={setSheetTarget}
                    onEdit={(s) => { if(!canManage)return;setEditing(s); setEditorOpen(true); }}
                    onDelete={s=>{if(canManage)setDeleting(s);}}
                  />
                </StaggerItem>
              ))}
            </AnimatePresence>
          </StaggerList>
        )}

        <SequenceEditorDialog open={editorOpen&&canManage} sequence={editing} onOpenChange={setEditorOpen} onSave={save} returnFocusFallback={focusFallback} />

        <EnrollDialog
          open={enrollTarget !== null&&canManage}
          sequence={enrollTarget}
          onOpenChange={(open) => { if (!open) setEnrollTarget(null); }}
          onEnroll={enroll}
          onDone={async () => { setSheetRefresh((n) => n + 1); await reload(); }}
          returnFocusFallback={focusFallback}
        />

        <EnrollmentsSheet
          canManage={canManage}
          sequence={sheetTarget}
          refreshKey={sheetRefresh}
          onOpenChange={(open) => { if (!open) setSheetTarget(null); }}
          onEnroll={s=>{if(canManage)setEnrollTarget(s);}}
          returnFocusFallback={focusFallback}
        />

        <SequenceDeleteDialog
          loading={busy}
          open={deleting !== null}
          onOpenChange={(open) => { if (!open) setDeleting(null); }}
          onCloseAutoFocus={onDeleteCloseAutoFocus}
          title={tr("Eliminar «{p0}»",{p0:deleting?.name ?? ''})}
          description={tr("Se borra la secuencia y sus pasos. Las inscripciones en curso dejan de avanzar. Esta acción no se puede deshacer.")}
          confirmLabel={tr("Eliminar")}
          variant="destructive"
          onConfirm={async () => {
            if(deleting && !(await runAction(()=>remove(deleting.id),tr("Secuencia eliminada"))))throw new Error("operacion_no_realizada");
          }}
        />
      </div>
    </TooltipProvider>
  );
}
