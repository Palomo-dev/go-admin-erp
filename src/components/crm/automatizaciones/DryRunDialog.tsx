'use client';

/**
 * «Probar en seco» (brief 6.2): elegir una oportunidad, ver qué haría la
 * regla con ella —condición por condición y acción por acción— sin ejecutar
 * nada. Usa el mismo `dry_run` del servidor que existía; solo cambia cómo se
 * muestra.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, FlaskConical, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/utils/Utils';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { ConditionTrace, ConditionRule } from '@/lib/services/crm/automation/conditionsDsl';
import { describeAction, describeCondition, describeSkipReason, formatNumberEs, type HumanizerLookups } from '@/lib/services/crm/automation/ruleHumanizer';
import { chipClass } from './SentenceBlock';
import { useOpportunitySearch } from './useOpportunitySearch';
import type { AutomationRuleView, DryRunResult } from './useAutomationRules';

interface Props {
  open: boolean;
  rule: AutomationRuleView | null;
  lookups: HumanizerLookups;
  onOpenChange: (open: boolean) => void;
  onRun: (ruleId: string, opportunityId: string | null) => Promise<DryRunResult>;
}

function actualText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'vacío';
  if (typeof value === 'number') return formatNumberEs(value);
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  if (Array.isArray(value)) return value.map(String).join(', ') || 'vacío';
  return String(value);
}

export function DryRunDialog({ open, rule, lookups, onOpenChange, onRun }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { hits, loading, error: searchError } = useOpportunitySearch(query, open);
  const onCloseAutoFocus = useReturnFocus(open); // H1: vuelve a «Probar en seco» de la tarjeta.

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setSelectedName(null);
    setResult(null);
    setError(null);
  }, [open, rule?.id]);

  const run = async () => {
    if (!rule) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await onRun(rule.id, selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setRunning(false);
    }
  };

  const conditionOf = (t: ConditionTrace): string => {
    if (t.reason) return `${t.field}: ${t.reason === 'field_not_allowed' ? 'campo no permitido' : t.reason === 'operator_not_allowed' ? 'operador no permitido' : t.reason}`;
    return describeCondition({ field: t.field, operator: t.operator as ConditionRule['operator'], value: t.expected }, lookups);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[90vh] max-w-2xl overflow-y-auto bg-white dark:bg-gray-950">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <FlaskConical className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            {/* Tester UXM-C: el nombre va en un `span` con `min-w-0 break-words`; como texto suelto del título flex no encogía y el diálogo ganaba scroll lateral (809 px en 293) a 375 px. */}
            <span className="min-w-0 break-words">Probar en seco «{rule?.name}»</span>
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            Elige una oportunidad y verás qué haría la regla con ella. No se envía nada, no se cambia nada y no queda en el historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="dry-search" className="text-xs text-gray-700 dark:text-gray-300">Oportunidad</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <Input id="dry-search" type="search" className="pl-9" placeholder="Buscar por nombre…" value={query}
                aria-describedby="dry-search-hint" onChange={(e) => setQuery(e.target.value)} />
            </div>
            <p id="dry-search-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {selectedName ? `Elegida: ${selectedName}` : 'Sin elegir: se evalúa sin oportunidad (solo el disparador y las condiciones que no la necesitan).'}
            </p>
          </div>

          {searchError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{searchError}</p>}
          <ul aria-label="Resultados de la búsqueda" aria-busy={loading} className="flex flex-wrap gap-2">
            <li className="min-w-0 max-w-full">
              <button type="button" aria-pressed={selected === null} className={chipClass(selected === null)}
                onClick={() => { setSelected(null); setSelectedName(null); }}>
                Sin oportunidad
              </button>
            </li>
            {/* `min-w-0 max-w-full` en cada `li`: sin esto medía lo que su texto sin cortar y sobresalía en móvil. */}
            {hits.map((h) => (
              <li key={h.id} className="min-w-0 max-w-full">
                <button type="button" aria-pressed={selected === h.id} className={chipClass(selected === h.id)}
                  onClick={() => { setSelected(h.id); setSelectedName(h.name); }}>
                  <span className="truncate">{h.name}</span>
                  {(h.stage_name || h.customer_name) && (
                    <span className="truncate text-xs text-gray-600 dark:text-gray-400">
                      · {[h.customer_name, h.stage_name].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {!loading && hits.length === 0 && !searchError && (
              <li className="self-center text-xs text-gray-600 dark:text-gray-400">Ninguna oportunidad coincide.</li>
            )}
          </ul>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>No se pudo probar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && rule && (
            <section aria-live="polite" aria-labelledby="dry-result-title" className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
              <h3 id="dry-result-title" className={cn('flex items-center gap-2 font-semibold', result.matched ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200')}>
                {result.matched
                  ? <><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> La regla se dispararía</>
                  : <><XCircle className="h-5 w-5" aria-hidden="true" /> La regla no se dispararía</>}
              </h3>
              {!result.matched && result.skip_reason && (
                <p className="text-sm text-gray-700 dark:text-gray-300">{describeSkipReason(result.skip_reason)}</p>
              )}

              {result.trace.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Condiciones</h4>
                  <ul className="mt-1 space-y-1 text-sm">
                    {result.trace.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {t.ok
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-label="Se cumple" />
                          : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" aria-label="No se cumple" />}
                        <span className="min-w-0 break-words text-gray-800 dark:text-gray-200">
                          {conditionOf(t)}
                          {!t.reason && <span className="text-gray-600 dark:text-gray-400"> — valor real: {actualText(t.actual)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  {result.matched ? 'Haría, en este orden' : 'Haría si se disparara'}
                </h4>
                {result.actions_plan.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Nada: la regla no tiene acciones.</p>
                ) : (
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-800 dark:text-gray-200">
                    {result.actions_plan.map((p) => (
                      <li key={p.index} className="break-words">
                        {rule.actions[p.index] ? describeAction(rule.actions[p.index], lookups) : String(p.type)}
                        {!p.implemented && <span className="ml-1 text-xs text-amber-800 dark:text-amber-300">(no disponible: fallaría)</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" disabled={running || !rule} onClick={() => void run()}>
            {running ? 'Probando…' : result ? 'Probar de nuevo' : 'Probar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
