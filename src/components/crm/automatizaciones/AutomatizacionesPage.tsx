'use client';

/**
 * /app/crm/automatizaciones — reglas del motor único (FASE-08 §5.1).
 *
 * Lista, activa/desactiva, edita, simula en seco y muestra el historial real de
 * `automation_runs` (incluidos los `failed` y `skipped`, que antes se
 * enterraban en un run "completed").
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Play, Pencil, Trash2, RefreshCw, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { RuleFormDialog } from './RuleFormDialog';
import { fetchRuns, useAutomationRules, type AutomationRuleView, type AutomationRunView } from './useAutomationRules';

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  skipped: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export function AutomatizacionesPage() {
  const { rules, loading, error, reload, save, toggle, remove, dryRun } = useAutomationRules();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRuleView | null>(null);
  const [runs, setRuns] = useState<AutomationRunView[]>([]);
  const [runsFor, setRunsFor] = useState<string | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);

  const loadRuns = useCallback(async (ruleId?: string) => {
    setRunsLoading(true);
    try {
      setRuns(await fetchRuns(ruleId));
      setRunsFor(ruleId ?? null);
    } catch (err) {
      toast({
        title: 'No se pudo cargar el historial',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setRunsLoading(false);
    }
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);

  const onToggle = async (rule: AutomationRuleView) => {
    try {
      await toggle(rule);
      toast({ title: rule.is_active ? 'Regla desactivada' : 'Regla activada' });
    } catch (err) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const onDelete = async (rule: AutomationRuleView) => {
    if (!window.confirm(`¿Eliminar la regla "${rule.name}"?`)) return;
    try {
      await remove(rule.id);
      toast({ title: 'Regla eliminada' });
    } catch (err) {
      toast({
        title: 'No se pudo eliminar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const onDryRun = async (rule: AutomationRuleView) => {
    try {
      const result = await dryRun(rule.id, null);
      toast({
        title: result.matched ? 'La regla se dispararía' : 'La regla no se dispararía',
        description: result.matched
          ? `${result.actions_plan.length} acción(es) en el plan`
          : `Motivo: ${result.skip_reason ?? 'condiciones no cumplidas'}`,
      });
    } catch (err) {
      toast({
        title: 'No se pudo simular',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Automatizaciones</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Reglas que actúan solas cuando ocurre algo en el pipeline. Las ejecuta la cola del servidor, no el navegador.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { void reload(); void loadRuns(runsFor ?? undefined); }}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Actualizar
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nueva regla
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-gray-100">Todavía no hay reglas</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Crea la primera: por ejemplo, al entrar a “Propuesta”, enviar un email y crear una tarea a 3 días.
          </p>
          <Button className="mt-4" onClick={() => { setEditing(null); setFormOpen(true); }}>Crear regla</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li key={rule.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{rule.name}</span>
                    <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                      {rule.is_active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {rule.trigger_type} · {rule.actions?.length ?? 0} acción(es) · {rule.runs_count ?? 0} ejecuciones ·
                    {' '}última: {formatDate(rule.last_run_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    aria-label={`Activar la regla ${rule.name}`}
                    checked={rule.is_active}
                    onCheckedChange={() => void onToggle(rule)}
                  />
                  <Button size="icon" variant="ghost" aria-label={`Simular ${rule.name}`} onClick={() => void onDryRun(rule)}>
                    <Play className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Historial de ${rule.name}`} onClick={() => void loadRuns(rule.id)}>
                    <History className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Editar ${rule.name}`} onClick={() => { setEditing(rule); setFormOpen(true); }}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Eliminar ${rule.name}`} onClick={() => void onDelete(rule)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="runs-title" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="runs-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Historial {runsFor ? '(regla seleccionada)' : '(todas las reglas)'}
          </h2>
          {runsFor && (
            <Button size="sm" variant="ghost" onClick={() => void loadRuns()}>Ver todas</Button>
          )}
        </div>
        {runsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : runs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Sin ejecuciones registradas.</p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {runs.map((run) => (
              <li key={run.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded px-2 py-0.5 text-xs font-medium', STATUS_STYLES[run.status] ?? STATUS_STYLES.pending)}>
                    {run.status}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">{formatDate(run.created_at)}</span>
                  {run.skip_reason && <span className="text-gray-500 dark:text-gray-400">motivo: {run.skip_reason}</span>}
                </div>
                {run.error_message && (
                  <p className="mt-1 break-words text-xs text-red-700 dark:text-red-300">{run.error_message}</p>
                )}
                {run.result?.results && run.result.results.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                    {run.result.results.map((r) => (
                      <li key={r.index}>
                        #{r.index + 1} {r.type}: {r.status === 'failed' ? `error — ${r.error}` : 'ok'}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RuleFormDialog
        open={formOpen}
        rule={editing}
        onOpenChange={setFormOpen}
        onSave={save}
      />
    </div>
  );
}
