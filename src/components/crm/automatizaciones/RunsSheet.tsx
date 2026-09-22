'use client';

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
  success: 'text-emerald-700 dark:text-emerald-300',
  danger: 'text-red-700 dark:text-red-300',
  neutral: 'text-gray-600 dark:text-gray-400',
  info: 'text-blue-700 dark:text-blue-300',
  warning: 'text-amber-700 dark:text-amber-300',
};

function StatusIcon({ tone }: { tone: RunTone }) {
  const cls = 'h-4 w-4 shrink-0';
  switch (tone) {
    case 'success': return <CheckCircle2 className={cls} aria-hidden="true" />;
    case 'danger': return <XCircle className={cls} aria-hidden="true" />;
    case 'info': return <Loader2 className={cn(cls, 'motion-safe:animate-spin')} aria-hidden="true" />;
    case 'warning': return <Clock className={cls} aria-hidden="true" />;
    default: return <MinusCircle className={cls} aria-hidden="true" />;
  }
}

export function RunsSheet({ open, onOpenChange, ruleId, ruleName }: Props) {
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
      <SheetContent side="right" onCloseAutoFocus={onCloseAutoFocus} className="w-full bg-white dark:bg-gray-950 sm:max-w-2xl">
        <SheetHeader className="pr-8">
          <SheetTitle className="break-words text-gray-900 dark:text-gray-100">
            {ruleName ? `Historial de «${ruleName}»` : 'Historial de todas las reglas'}
          </SheetTitle>
          <SheetDescription className="text-gray-600 dark:text-gray-400">
            Últimas 50 ejecuciones reales del servidor. Las pruebas en seco no se registran aquí.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => setTick((t) => t + 1)} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'motion-safe:animate-spin')} aria-hidden="true" /> Actualizar
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertTitle>No se pudo cargar el historial</AlertTitle>
            <AlertDescription>{error} — pulsa «Actualizar» para reintentar.</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="mt-2 space-y-2" aria-busy="true" aria-label="Cargando historial">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : runs.length === 0 && !error ? (
          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Todavía no hay ejecuciones. Cuando la regla se dispare, aparecerán aquí.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Estado</TableHead>
                  {/* UX móvil: bajo `sm` la fecha va debajo del estado (misma celda) y la tabla cabe en 375 px sin scroll lateral. */}
                  <TableHead scope="col" className="hidden sm:table-cell">Fecha</TableHead>
                  <TableHead scope="col">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const status = describeRunStatus(run.status);
                  const results = run.result?.results ?? [];
                  return (
                    <TableRow key={run.id}>
                      <TableCell className={cn('align-top font-medium', TONE_CLASS[status.tone])}>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <StatusIcon tone={status.tone} />
                          {status.label}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal text-gray-600 dark:text-gray-400 sm:hidden">
                          {formatDateTime(run.created_at) || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap align-top text-gray-700 dark:text-gray-300 sm:table-cell">
                        {formatDateTime(run.created_at) || '—'}
                      </TableCell>
                      {/* Tester UXM-C: `overflow-wrap: anywhere` (no `break-words`): en una celda de tabla `break-word` no reduce el
                          ancho mínimo y un error de 120 caracteres sin espacios ensanchaba la tabla a 1146 px (scroll lateral a 375). */}
                      <TableCell className="min-w-0 align-top text-gray-700 [overflow-wrap:anywhere] dark:text-gray-300">
                        {run.skip_reason && <p>{describeSkipReason(run.skip_reason)}</p>}
                        {run.error_message && (
                          <p className="text-red-700 [overflow-wrap:anywhere] dark:text-red-300">{run.error_message}</p>
                        )}
                        {results.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs">
                            {results.map((r) => (
                              <li key={r.index} className={r.status === 'failed' ? 'text-red-700 dark:text-red-300' : ''}>
                                {r.index + 1}. {actionEntry(r.type)?.label ?? r.type}
                                {r.status === 'failed' ? ` — error: ${r.error ?? 'sin detalle'}` : ' — ok'}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!run.skip_reason && !run.error_message && results.length === 0 && (
                          <span className="text-gray-500 dark:text-gray-400">Sin detalle</span>
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
