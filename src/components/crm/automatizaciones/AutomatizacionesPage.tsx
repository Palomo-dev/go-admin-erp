'use client';
import { useAutomationText } from './useAutomationText';

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
import { Plus, History, RefreshCw, Zap, Sparkles, MoreHorizontal } from 'lucide-react';
import { PageHeader, StatCard, EmptyState, useEsEscritorio } from '@/components/kit';
import { KbdButton as Button } from '@/components/kit/KbdButton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RuleDeleteDialog } from './RuleDeleteDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { AnimatePresence, StaggerList } from '@/components/shared/motion';
import { EMPTY_FILTERS, EXAMPLE_FORM, filterRules, type RuleFilters, type RuleFormState } from '@/lib/services/crm/automation/ruleEditorModel';
import { RuleCard } from './RuleCard';
import { RulesToolbar } from './RulesToolbar';
import { RulesEmptyState } from './RulesEmptyState';
import { KpiStrip } from '@/components/kit/KpiStrip';
import { useInPageEditorNavigation } from '@/components/crm/acciones/useInPageEditorNavigation';
import { RuleEditorSheet } from './RuleEditorSheet';
import { RunsSheet } from './RunsSheet';
import { useAutomationRules, type AutomationRuleView } from './useAutomationRules';
import { useRuleLookups } from './useRuleLookups';
import { RulesTable } from './RulesTable';
import { useRulesWithErrors } from './useRulesWithErrors';
import { BulkDryRunDialog } from './BulkDryRunDialog';

type Target = { rule: AutomationRuleView } | null;

export function AutomatizacionesPage() {
  const tr = useAutomationText();
  const { rules, loading, loaded, error, reload, save, toggle, remove, bulkDryRun, canManage, summary, organizationId } = useAutomationRules();
  const desktop = useEsEscritorio();
  const mutationPending = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const lookups = useRuleLookups();
  const { formatDateTime } = useFormatDate();

  const [errorOnly, setErrorOnly] = useState(false), [errorRevision, setErrorRevision] = useState(0);
  const failedRules = useRulesWithErrors(errorOnly, organizationId, summary?.from, summary?.until, errorRevision);
  const pendingTemplate = useRef<RuleFormState | null>(null);
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
  useEffect(() => { setEditorOpen(false); setEditing(null); setInitialForm(null); setDryRunTarget(null); setRunsTarget(null); setDeleteTarget(null); setFilters(EMPTY_FILTERS); setErrorOnly(false); pendingTemplate.current = null; }, [organizationId]);
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

  const shown = useMemo(() => filterRules(rules, filters).filter(rule => !errorOnly || failedRules.ids.has(rule.id)), [rules, filters, errorOnly, failedRules.ids]);

  const editorBusy = useRef(false);
  const editorScope = useRef(organizationId); editorScope.current = organizationId;
  useEffect(() => { editorBusy.current = false; }, [organizationId]);
  const editorNavigation = useInPageEditorNavigation({ pathname: '/app/crm/automatizaciones', ready: !loading, canManage, scope: organizationId,
    blocked: () => editorBusy.current,
    onTarget: target => {
      if (!target) { setEditorOpen(false); return; }
      const rule = target === 'new' || target === 'example' ? null : rules.find(r => r.id === target);
      if (rule === undefined) { setEditorOpen(false); return; }
      setEditing(rule); setInitialForm(target === 'example' ? pendingTemplate.current ?? EXAMPLE_FORM : null); pendingTemplate.current = null; setEditorOpen(true);
    },
  });
  const openEditor = (rule: AutomationRuleView | null, form: RuleFormState | null = null) => {
    if (!canManage) return;
    pendingTemplate.current = form;
    editorNavigation.open(rule?.id ?? (form ? 'example' : 'new'));
  };

  const onToggle = async (rule: AutomationRuleView) => {
    if (!canManage || mutationPending.current) return;
    mutationPending.current = true;
    setTogglingId(rule.id);
    try {
      await toggle(rule);
      toast({ title: rule.is_active ? tr("«{p0}» desactivada", { p0: rule.name }) : tr("«{p0}» activada", { p0: rule.name }) });
    } catch (err) {
      toast({ title: tr("No se pudo cambiar el estado"), description: err instanceof Error ? err.message : tr("Error desconocido"), variant: 'destructive' });
    } finally {
      mutationPending.current = false;
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
    if (!deleteTarget || !canManage || mutationPending.current) return;
    mutationPending.current = true; setDeleting(true);
    try {
      await remove(deleteTarget.rule.id);
      deletedRef.current = true;
      toast({ title: tr("«{p0}» eliminada", { p0: deleteTarget.rule.name }) });
    } catch (err) {
      toast({ title: tr("No se pudo eliminar"), description: err instanceof Error ? err.message : tr("Error desconocido"), variant: 'destructive' });
      throw err;
    } finally {
      mutationPending.current = false; setDeleting(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true); setErrorRevision(value => value + 1);
    try {
      await Promise.all([reload(), lookups.reload()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (runsTarget) return <TooltipProvider delayDuration={300}><RunsSheet open rules={rules} ruleId={runsTarget.ruleId} ruleName={runsTarget.ruleName} onOpenChange={open => { if (!open) setRunsTarget(null); }} /></TooltipProvider>;

  if (editorOpen && canManage) return <TooltipProvider delayDuration={300}><RuleEditorSheet
          open={editorOpen && canManage}
          rule={editing}
          initialForm={initialForm}
          lookups={lookups}
          onOpenChange={open => { if (!open && organizationId === editorScope.current) editorNavigation.close(); }}
          onBusyChange={busy => { if (organizationId === editorScope.current) editorBusy.current = busy; }}
          onSave={save}
          onBulkDryRun={bulkDryRun}
          returnFocusFallback={() => newButtonRef.current}
        /></TooltipProvider>;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4 bg-canvas p-4 sm:p-6">
        <PageHeader titulo={tr("Automatizaciones")} subtitulo={tr("Reglas cuando pasa X, si se cumple Y, haz Z sobre oportunidades, llamadas, correos y tareas")} icono={Zap} migas={[{ etiqueta: 'CRM', href: '/app/crm' },{ etiqueta: tr('Automatizaciones') }]} acciones={<div className="flex flex-wrap gap-2">
            {(canManage || !loaded) && <Button patron="button" type="button" icono={Sparkles} disabled={!canManage || loading} variante="secundario" onClick={() => openEditor(null, EXAMPLE_FORM)}>{tr("Desde plantilla")}</Button>}
            {(canManage || !loaded) && <Button patron="button" icono={Plus} disabled={!canManage || loading} ref={newButtonRef} type="button" onClick={() => openEditor(null)}>
              {tr("Nueva regla")}</Button>}
            <DropdownMenu><DropdownMenuTrigger asChild><Button patron="button" variante="secundario" icono={MoreHorizontal} className="size-10 px-0" aria-label={tr('Más opciones')} /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setRunsTarget({ ruleId: null, ruleName: null })}><History className="mr-2 size-4" strokeWidth={1.5} aria-hidden />{tr('Historial')}</DropdownMenuItem><DropdownMenuItem disabled={refreshing} onSelect={() => void refresh()}><RefreshCw className="mr-2 size-4" strokeWidth={1.5} aria-hidden />{tr('Actualizar lista')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div>} />
        {(loading || rules.length > 0) && <KpiStrip>
          <StatCard etiqueta={tr("Reglas activas")} valor={summary ? tr("{p0} de {p1}", { p0: summary.active_rules, p1: rules.length }) : '—'} cargando={loading} varianteCarga="compacta" />
          <StatCard etiqueta={tr("Ejecuciones (7 días)")} valor={summary?.executed_7d ?? '—'} cargando={loading} varianteCarga="compacta" />
          <StatCard etiqueta={tr("Omitidas (7 días)")} valor={summary?.skipped_7d ?? '—'} cargando={loading} varianteCarga="compacta" />
          <StatCard etiqueta={tr("Con error (7 días)")} valor={summary?.failed_7d ?? '—'} cargando={loading} varianteCarga="compacta" tono="peligro" onClick={() => setRunsTarget({ ruleId:null, ruleName:null })} />
        </KpiStrip>}

        {error && loaded && (
          <Alert variant="destructive">
            <AlertTitle>{loaded ? tr("No se pudo actualizar la lista") : tr("No se pudieron cargar las reglas")}</AlertTitle>
            <AlertDescription>
              {error}. {loaded ? tr("Se muestra la última lista conocida; pulsa") : tr('Pulsa')} {tr("«Actualizar» para reintentar.")}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <><RulesToolbar filters={filters} onChange={setFilters} total={0} shown={0} /><RulesTable estado="cargando" rules={[]} lookups={lookups.humanizer} canManage={false} togglingId={null} formatDate={formatDateTime} onToggle={() => {}} onEdit={() => {}} onDryRun={() => {}} onHistory={() => {}} onDelete={() => {}} /></>
        ) : rules.length === 0 && (loaded || !error) ? (
          <RulesEmptyState
            canManage={canManage}
            filtered={false}
            onCreate={() => openEditor(null)}
            onUseExample={() => openEditor(null, EXAMPLE_FORM)}
            onUseTemplate={form => openEditor(null, form)}
            onClearFilters={() => { setFilters(EMPTY_FILTERS); setErrorOnly(false); }}
          />
        ) : rules.length === 0 ? <><RulesToolbar filters={filters} onChange={setFilters} total={0} shown={0} /><div className="rounded-xl border border-line bg-surface py-16"><EmptyState variante="error" icono={Zap} titulo={tr('No se pudieron cargar las reglas')} descripcion={tr('Intenta nuevamente. Si el problema continúa, contacta a soporte.')} onReintentar={() => void refresh()} accionPrimaria /></div></> : (
          <>
            <RulesToolbar filters={filters} onChange={setFilters} total={rules.length} shown={shown.length} errorOnly={errorOnly} onErrorOnlyChange={setErrorOnly} errorFilterAvailable={summary !== null} />
            {failedRules.error && <Alert variant="destructive"><AlertTitle>{tr('No se pudieron cargar los errores')}</AlertTitle><AlertDescription>{failedRules.error}<Button patron="button" variante="fantasma" tamano="sm" onClick={() => setErrorRevision(value => value + 1)}>{tr('Reintentar')}</Button></AlertDescription></Alert>}
            {failedRules.loading && <p role="status" className="text-xs text-fg-secondary">{tr('Cargando reglas con error…')}</p>}
            {shown.length === 0 ? (
              <RulesEmptyState
                canManage={canManage}
                filtered
                onCreate={() => openEditor(null)}
                onUseExample={() => openEditor(null, EXAMPLE_FORM)}
            onUseTemplate={form => openEditor(null, form)}
                onClearFilters={() => { setFilters(EMPTY_FILTERS); setErrorOnly(false); }}
              />
            ) : desktop ? <RulesTable rules={shown} lookups={lookups.humanizer} canManage={canManage} togglingId={togglingId} formatDate={formatDateTime} onToggle={r => void onToggle(r)} onEdit={openEditor} onDryRun={r => { if (canManage) setDryRunTarget({ rule:r }); }} onHistory={r => setRunsTarget({ ruleId:r.id, ruleName:r.name })} onDelete={r => { if (canManage) setDeleteTarget({ rule:r }); }} /> : (
              <StaggerList as="ul" aria-label={tr("Reglas de automatización")} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>
                  {shown.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      canManage={canManage}
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



        <BulkDryRunDialog
          open={dryRunTarget !== null && canManage}
          id={dryRunTarget?.rule.id ?? null}
          name={dryRunTarget?.rule.name ?? null}
          onOpenChange={(open) => { if (!open) setDryRunTarget(null); }}
          onRun={bulkDryRun}
        />

        <RuleDeleteDialog
          loading={deleting}
          open={deleteTarget !== null}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          title={tr("Eliminar regla")}
          description={tr("Se eliminará «{p0}» y dejará de ejecutarse. También se borra su historial de ejecuciones. Esta acción no se puede deshacer.", { p0: deleteTarget?.rule.name ?? '' })}
          confirmLabel={tr("Eliminar")}
          variant="destructive"
          onConfirm={onDelete}
          onCloseAutoFocus={onDeleteCloseAutoFocus}
        />
      </div>
    </TooltipProvider>
  );
}
