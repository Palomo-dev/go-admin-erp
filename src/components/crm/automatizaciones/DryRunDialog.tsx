'use client';

/**
 * «Probar en seco» (brief 6.2): elegir una oportunidad, ver qué haría la
 * regla con ella —condición por condición y acción por acción— sin ejecutar
 * nada. Usa el mismo `dry_run` del servidor que existía; solo cambia cómo se
 * muestra.
 *
 * «Últimos 30 días» (Figma CRM 1379:776) repite en el servidor los eventos
 * capturados contra la regla, con la misma decisión del motor
 * (`/api/crm/automation-rules/[id]/replay`).
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
import { useTranslations } from 'next-intl';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { ReplayAutomatizacion } from '@/lib/services/crm/automation/automationReplay';
import { ReplayResultado } from './ReplayResultado';
import { rutaReplay, type ModoPrueba } from './replayLogica';
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

function actualText(value: unknown, t: (clave: string) => string): string {
  if (value === null || value === undefined || value === '') return t('dryRunDialog.vacio');
  if (typeof value === 'number') return formatNumberEs(value);
  if (typeof value === 'boolean') return value ? t('dryRunDialog.si') : t('dryRunDialog.no');
  if (Array.isArray(value)) return value.map(String).join(', ') || t('dryRunDialog.vacio');
  return String(value);
}

export function DryRunDialog({ open, rule, lookups, onOpenChange, onRun }: Props) {
  const tx = useTranslations('crm.automatizaciones');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoPrueba>('una');
  const [historial, setHistorial] = useState<ReplayAutomatizacion | null>(null);
  const tReplay = useTranslations('crm.automatizaciones.replay');
  const { hits, loading, error: searchError } = useOpportunitySearch(query, open);
  const onCloseAutoFocus = useReturnFocus(open); // H1: vuelve a «Probar en seco» de la tarjeta.

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setSelectedName(null);
    setResult(null);
    setError(null);
    setModo('una');
    setHistorial(null);
  }, [open, rule?.id]);

  const run = async () => {
    if (!rule) return;
    setRunning(true);
    setError(null);
    try {
      if (modo === 'historial') setHistorial((await pedirCrm<ReplayAutomatizacion>(rutaReplay(rule.id), { method: 'POST', cuerpo: {} })).data);
      else setResult(await onRun(rule.id, selected));
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('automatizacionesPage.errorDesconocido'));
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
            <span className="min-w-0 break-words">{tx('dryRunDialog.probarSeco', { name: rule?.name ?? '' })}</span>
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            {tx('dryRunDialog.eligeOportunidadVerasHaria')}
          </DialogDescription>
        </DialogHeader>

        <SegmentedControl<ModoPrueba>
          etiqueta={tReplay('modo')}
          valor={modo}
          onValorChange={(v) => { setModo(v); setError(null); }}
          opciones={[{ valor: 'una', etiqueta: tReplay('modoUna') }, { valor: 'historial', etiqueta: tReplay('modoHistorial') }]}
        />

        {modo === 'historial' ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-secondary">{tReplay('explicacion')}</p>
            {error && (
              <Alert variant="destructive">
                <AlertTitle>{tx('dryRunDialog.noPudoProbar')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {historial && rule && <ReplayResultado resultado={historial} rule={rule} lookups={lookups} />}
          </div>
        ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="dry-search" className="text-xs text-gray-700 dark:text-gray-300">{tx('dryRunDialog.oportunidad')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <Input id="dry-search" type="search" className="pl-9" placeholder={tx('dryRunDialog.buscarNombre')} value={query}
                aria-describedby="dry-search-hint" onChange={(e) => setQuery(e.target.value)} />
            </div>
            <p id="dry-search-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {selectedName ? tx('dryRunDialog.elegida', { selectedName }) : tx('dryRunDialog.sinElegirEvaluaSin')}
            </p>
          </div>

          {searchError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{searchError}</p>}
          <ul aria-label={tx('dryRunDialog.resultadosBusqueda')} aria-busy={loading} className="flex flex-wrap gap-2">
            <li className="min-w-0 max-w-full">
              <button type="button" aria-pressed={selected === null} className={chipClass(selected === null)}
                onClick={() => { setSelected(null); setSelectedName(null); }}>
                {tx('dryRunDialog.sinOportunidad')}
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
              <li className="self-center text-xs text-gray-600 dark:text-gray-400">{tx('dryRunDialog.ningunaOportunidadCoincide')}</li>
            )}
          </ul>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>{tx('dryRunDialog.noPudoProbar')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && rule && (
            <section aria-live="polite" aria-labelledby="dry-result-title" className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
              <h3 id="dry-result-title" className={cn('flex items-center gap-2 font-semibold', result.matched ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-800 dark:text-gray-200')}>
                {result.matched
                  ? <><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> {tx('dryRunDialog.reglaDispararia')}</>
                  : <><XCircle className="h-5 w-5" aria-hidden="true" /> {tx('dryRunDialog.reglaNoDispararia')}</>}
              </h3>
              {!result.matched && result.skip_reason && (
                <p className="text-sm text-gray-700 dark:text-gray-300">{describeSkipReason(result.skip_reason)}</p>
              )}

              {result.trace.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{tx('dryRunDialog.condiciones')}</h4>
                  <ul className="mt-1 space-y-1 text-sm">
                    {result.trace.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {t.ok
                          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-label={tx('dryRunDialog.cumple')} />
                          : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" aria-label={tx('dryRunDialog.noCumple')} />}
                        <span className="min-w-0 break-words text-gray-800 dark:text-gray-200">
                          {conditionOf(t)}
                          {!t.reason && <span className="text-gray-600 dark:text-gray-400"> {tx('dryRunDialog.valorReal', { actualText: actualText(t.actual, tx) })}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                  {result.matched ? tx('dryRunDialog.hariaEsteOrden') : tx('dryRunDialog.hariaSiDisparara')}
                </h4>
                {result.actions_plan.length === 0 ? (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{tx('dryRunDialog.nadaReglaNoTiene')}</p>
                ) : (
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-800 dark:text-gray-200">
                    {result.actions_plan.map((p) => (
                      <li key={p.index} className="break-words">
                        {rule.actions[p.index] ? describeAction(rule.actions[p.index], lookups) : String(p.type)}
                        {!p.implemented && <span className="ml-1 text-xs text-amber-800 dark:text-amber-300">{tx('dryRunDialog.noDisponibleFallaria')}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          )}
        </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tx('dryRunDialog.cerrar')}</Button>
          <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" disabled={running || !rule} onClick={() => void run()}>
            {running ? tx('dryRunDialog.probando') : (modo === 'historial' ? historial : result) ? tx('dryRunDialog.probarNuevo') : tx('dryRunDialog.probar')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
