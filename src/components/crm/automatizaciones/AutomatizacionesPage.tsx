'use client';

/**
 * /app/crm/automatizaciones — rediseño UX (brief 6.2, 2026-09-14).
 *
 * Tarjetas con la regla en lenguaje humano, búsqueda y filtros arriba,
 * editor como frase construible, prueba en seco explicada e historial en
 * una hoja lateral. Mismos servicios y rutas que la versión anterior
 * (`/api/crm/automation-rules/**`, `/api/crm/automation-runs`): cambia la
 * presentación, no el motor.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, History, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { AnimatePresence } from 'motion/react';
import { StaggerList } from '@/components/shared/motion/staggerList';
import { cn } from '@/utils/Utils';
import { EMPTY_FILTERS, EXAMPLE_FORM, filterRules, type RuleFilters, type RuleFormState } from '@/lib/services/crm/automation/ruleEditorModel';
import { RuleCard } from './RuleCard';
import { RulesToolbar } from './RulesToolbar';
import { RulesEmptyState } from './RulesEmptyState';
import { RuleEditorSheet } from './RuleEditorSheet';
import { DryRunDialog } from './DryRunDialog';
import { RunsSheet } from './RunsSheet';
import { useAutomationRules, type AutomationRuleView } from './useAutomationRules';
import { useRuleLookups } from './useRuleLookups';

type Target = { rule: AutomationRuleView } | null;

export function AutomatizacionesPage() {
  const { rules, loading, loaded, error, reload, save, toggle, remove, dryRun } = useAutomationRules();
  const lookups = useRuleLookups();
  const { formatDateTime } = useFormatDate();

  const [filters, setFilters] = useState<RuleFilters>(EMPTY_FILTERS);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRuleView | null>(null);
  const [initialForm, setInitialForm] = useState<RuleFormState | null>(null);
  const [dryRunTarget, setDryRunTarget] = useState<Target>(null);
  const [runsTarget, setRunsTarget] = useState<{ ruleId: string | null; ruleName: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Target>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [refocusSwitchId, setRefocusSwitchId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // «Nueva regla» es el fallback de foco de la hoja y del diálogo de borrar:
  // el botón que abrió puede haberse desmontado (estado vacío tras crear la
  // primera regla, R-1; tarjeta borrada, H5).
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const deletedRef = useRef(false);
  const returnDeleteFocus = useReturnFocus(deleteTarget !== null, () => newButtonRef.current);
  // H5: tras borrar, el botón «Eliminar» de la tarjeta sigue en el DOM mientras
  // la tarjeta sale animada, así que no basta con `isConnected`: si se borró,
  // el foco va a «Nueva regla»; si se canceló, vuelve al botón que abrió.
  const onDeleteCloseAutoFocus = (event: Event) => {
    if (deletedRef.current) {
      deletedRef.current = false;
      event.preventDefault();
      newButtonRef.current?.focus();
      return;
    }
    returnDeleteFocus(event);
  };

  const shown = useMemo(() => filterRules(rules, filters), [rules, filters]);

  const openEditor = (rule: AutomationRuleView | null, form: RuleFormState | null = null) => {
    setEditing(rule);
    setInitialForm(form);
    setEditorOpen(true);
  };

  const onToggle = async (rule: AutomationRuleView) => {
    setTogglingId(rule.id);
    try {
      await toggle(rule);
      toast({ title: rule.is_active ? `«${rule.name}» desactivada` : `«${rule.name}» activada` });
    } catch (err) {
      toast({ title: 'No se pudo cambiar el estado', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      setTogglingId(null);
      setRefocusSwitchId(rule.id);
    }
  };

  // El interruptor se deshabilita mientras guarda y el navegador suelta el foco
  // al body; tras el render que lo vuelve a habilitar, se le devuelve si nadie
  // lo movió a otro sitio.
  useEffect(() => {
    if (!refocusSwitchId) return;
    if (document.activeElement === document.body) document.getElementById(`rule-active-${refocusSwitchId}`)?.focus();
    setRefocusSwitchId(null);
  }, [refocusSwitchId]);

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.rule.id);
      deletedRef.current = true;
      toast({ title: `«${deleteTarget.rule.name}» eliminada` });
    } catch (err) {
      toast({ title: 'No se pudo eliminar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([reload(), lookups.reload()]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-5 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Automatizaciones</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Reglas que actúan solas cuando pasa algo en el pipeline. Las ejecuta el servidor, no el navegador.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="icon" aria-label="Actualizar lista" disabled={refreshing} onClick={() => void refresh()}>
              <RefreshCw className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" onClick={() => setRunsTarget({ ruleId: null, ruleName: null })}>
              <History className="mr-1.5 h-4 w-4" aria-hidden="true" /> Historial
            </Button>
            <Button ref={newButtonRef} type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => openEditor(null)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nueva regla
            </Button>
          </div>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{loaded ? 'No se pudo actualizar la lista' : 'No se pudieron cargar las reglas'}</AlertTitle>
            <AlertDescription>
              {error}. {loaded ? 'Se muestra la última lista conocida; pulsa' : 'Pulsa'} «Actualizar» para reintentar.
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Cargando reglas">
            <Skeleton className="h-9 w-full max-w-md" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
            </div>
          </div>
        ) : rules.length === 0 && (loaded || !error) ? (
          <RulesEmptyState
            filtered={false}
            onCreate={() => openEditor(null)}
            onUseExample={() => openEditor(null, EXAMPLE_FORM)}
            onClearFilters={() => setFilters(EMPTY_FILTERS)}
          />
        ) : rules.length === 0 ? null : (
          <>
            <RulesToolbar filters={filters} onChange={setFilters} total={rules.length} shown={shown.length} />
            {shown.length === 0 ? (
              <RulesEmptyState
                filtered
                onCreate={() => openEditor(null)}
                onUseExample={() => openEditor(null, EXAMPLE_FORM)}
                onClearFilters={() => setFilters(EMPTY_FILTERS)}
              />
            ) : (
              <StaggerList as="ul" aria-label="Reglas de automatización" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>
                  {shown.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      lookups={lookups.humanizer}
                      lastRunAbsolute={formatDateTime(rule.last_run_at)}
                      toggling={togglingId === rule.id}
                      onToggle={(r) => void onToggle(r)}
                      onDryRun={(r) => setDryRunTarget({ rule: r })}
                      onHistory={(r) => setRunsTarget({ ruleId: r.id, ruleName: r.name })}
                      onEdit={(r) => openEditor(r)}
                      onDelete={(r) => setDeleteTarget({ rule: r })}
                    />
                  ))}
                </AnimatePresence>
              </StaggerList>
            )}
          </>
        )}

        <RuleEditorSheet
          open={editorOpen}
          rule={editing}
          initialForm={initialForm}
          lookups={lookups}
          onOpenChange={setEditorOpen}
          onSave={save}
          returnFocusFallback={() => newButtonRef.current}
        />

        <DryRunDialog
          open={dryRunTarget !== null}
          rule={dryRunTarget?.rule ?? null}
          lookups={lookups.humanizer}
          onOpenChange={(open) => { if (!open) setDryRunTarget(null); }}
          onRun={dryRun}
        />

        <RunsSheet
          open={runsTarget !== null}
          ruleId={runsTarget?.ruleId ?? null}
          ruleName={runsTarget?.ruleName ?? null}
          onOpenChange={(open) => { if (!open) setRunsTarget(null); }}
        />

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title="Eliminar regla"
          description={`Se eliminará «${deleteTarget?.rule.name ?? ''}» y dejará de ejecutarse. También se borra su historial de ejecuciones. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          variant="destructive"
          onConfirm={onDelete}
          onCloseAutoFocus={onDeleteCloseAutoFocus}
        />
      </div>
    </TooltipProvider>
  );
}
