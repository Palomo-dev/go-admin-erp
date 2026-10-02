'use client';
import { useAutomationText } from './useAutomationText';

/**
 * Historial de ejecuciones (`automation_runs`) en una hoja lateral. Es dato
 * tabular real, así que va en tabla (brief §3). Muestra también los `failed`
 * y `skipped`, con el motivo en lenguaje humano.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Loader2, Clock, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { cn } from '@/utils/Utils';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { describeRunStatus, describeSkipReason, type RunTone } from '@/lib/services/crm/automation/ruleHumanizer';
import { actionEntry } from '@/lib/services/crm/automation/ruleCatalog';
import { fetchRuns, type AutomationRunView } from './useAutomationRules';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = todas las reglas. */
  ruleId: string | null;
  ruleName: string | null;
}

const TONE_CLASS: Record<RunTone, string> = {
  success: 'text-success-text dark:text-success-text',
  danger: 'text-danger-text dark:text-danger-text',
  neutral: 'text-fg-secondary dark:text-fg-secondary',
  info: 'text-brand-deep dark:text-blue-300',
  warning: 'text-warning-text dark:text-warning-text',
};

function StatusIcon({ tone }: { tone: RunTone }) {
  const cls = "h-4 w-4 shrink-0";
  switch (tone) {
    case 'success': return <CheckCircle2 strokeWidth={1.5} className={cls} aria-hidden="true" />;
    case 'danger': return <XCircle strokeWidth={1.5} className={cls} aria-hidden="true" />;
    case 'info': return <Loader2 strokeWidth={1.5} className={cn(cls, 'motion-safe:animate-spin')} aria-hidden="true" />;
    case 'warning': return <Clock strokeWidth={1.5} className={cls} aria-hidden="true" />;
    default: return <MinusCircle strokeWidth={1.5} className={cls} aria-hidden="true" />;
  }
}

export function RunsSheet({ open, onOpenChange, ruleId, ruleName }: Props) {
  const tr = useAutomationText();
  const [runs, setRuns] = useState<AutomationRunView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const { formatDateTime } = useFormatDate();
  const onCloseAutoFocus = useReturnFocus(open); // H1: vuelve a «Historial» (cabecera o tarjeta).

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRuns(ruleId ?? undefined)
      .then((data) => { if (!cancelled) setRuns(data); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Error desconocido'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, ruleId, tick]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="w-full bg-surface dark:bg-canvas sm:max-w-2xl">
        <SheetHeader className="pr-8">
          <SheetTitle className="break-words text-fg dark:text-fg">
            {ruleName ? tr("Historial de «{p0}»", { p0: ruleName }) : tr("Historial de todas las reglas")}
          </SheetTitle>
          <SheetDescription className="text-fg-secondary dark:text-fg-secondary">
            {tr("Últimas 50 ejecuciones reales del servidor. Las pruebas en seco no se registran aquí.")}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => setTick((t) => t + 1)} disabled={loading}>
            <RefreshCw strokeWidth={1.5} className={cn("mr-1.5 h-4 w-4", loading && 'motion-safe:animate-spin')} aria-hidden="true" /> {tr("Actualizar")}</Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertTitle>{tr("No se pudo cargar el historial")}</AlertTitle>
            <AlertDescription>{error} {tr("— pulsa «Actualizar» para reintentar.")}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="mt-2 space-y-2" aria-busy="true" aria-label={tr("Cargando historial")}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : runs.length === 0 && !error ? (
          <p className="mt-6 text-center text-sm text-fg-secondary dark:text-fg-secondary">
            {tr("Todavía no hay ejecuciones. Cuando la regla se dispare, aparecerán aquí.")}</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-line dark:border-line">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{tr("Estado")}</TableHead>
                  {/* UX móvil: bajo `sm` la fecha va debajo del estado (misma celda) y la tabla cabe en 375 px sin scroll lateral. */}
                  <TableHead scope="col" className="hidden sm:table-cell">{tr("Fecha")}</TableHead>
                  <TableHead scope="col">{tr("Detalle")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const status = describeRunStatus(run.status);
                  const results = run.result?.results ?? [];
                  return (
                    <TableRow key={run.id}>
                      <TableCell className={cn("align-top font-medium", TONE_CLASS[status.tone])}>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <StatusIcon tone={status.tone} />
                          {tr(status.label)}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-fg-secondary dark:text-fg-secondary sm:hidden">
                          {formatDateTime(run.created_at) || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap align-top text-fg-secondary dark:text-fg-secondary sm:table-cell">
                        {formatDateTime(run.created_at) || '—'}
                      </TableCell>
                      {/* Tester UXM-C: `overflow-wrap: anywhere` (no `break-words`): en una celda de tabla `break-word` no reduce el
                          ancho mínimo y un error de 120 caracteres sin espacios ensanchaba la tabla a 1146 px (scroll lateral a 375). */}
                      <TableCell className="min-w-0 align-top text-fg-secondary [overflow-wrap:anywhere] dark:text-fg-secondary">
                        {run.skip_reason && <p>{tr(describeSkipReason(run.skip_reason))}</p>}
                        {run.error_message && (
                          <p className="text-danger-text [overflow-wrap:anywhere] dark:text-danger-text">{run.error_message}</p>
                        )}
                        {results.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs">
                            {results.map((r) => (
                              <li key={r.index} className={r.status === 'failed' ? 'text-danger-text dark:text-danger-text' : ''}>
                                {r.index + 1}. {tr(actionEntry(r.type)?.label ?? r.type)}
                                {r.status === 'failed' ? tr(" — error: {p0}", { p0: r.error ?? 'sin detalle' }) : tr(" — ok")}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!run.skip_reason && !run.error_message && results.length === 0 && (
                          <span className="text-fg-muted dark:text-fg-secondary">{tr("Sin detalle")}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
