'use client';
import { useAutomationText } from './useAutomationText';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit/EmptyState';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { describeSkipReason } from '@/lib/services/crm/automation/ruleHumanizer';
import type { BulkAutomationPreview } from '@/lib/services/crm/automation/automationBulkPreview';
interface Props { result: BulkAutomationPreview | null; loading: boolean; error: string | null; onRetry(): void }
export function BulkDryRunPreview({ result, loading, error, onRetry }: Props) {
  const tr = useAutomationText();
  const { formatDateTime } = useFormatDate();
  return <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="bulk-dry-title">
    <div className="flex items-center justify-between gap-2"><h3 id="bulk-dry-title" className="text-base font-semibold">{tr("Prueba en seco")}</h3><StatusBadge estado="dry" tono="marca" etiqueta={tr("No se envió nada")} /></div>
    <p className="mt-2 text-xs text-fg-secondary">{tr("Disparadores de los últimos 30 días evaluados con los datos actuales de los registros. No se ejecutan acciones ni se modifica el historial.")}</p>
    {loading ? <div className="mt-3 space-y-2" role="status" aria-label={tr("Simulando regla")}><Skeleton className="h-12 w-full" /><Skeleton className="h-24 w-full" /></div>
      : error ? <EmptyState variante="error" compacto titulo={tr("No se pudo simular")} descripcion={error} onReintentar={onRetry} />
      : result && <>
        <p className="mt-3 text-xs text-fg-secondary">{formatDateTime(result.from)} – {formatDateTime(result.until)}</p>
        <p className="mt-2 text-sm" role="status">{result.total} {tr("evaluados ·")}{result.matched} {tr("se ejecutarían ·")}{result.skipped} {tr("omitidos ·")}{result.unavailable} {tr("registros no disponibles")}</p>
        {result.sample.length === 0 ? <EmptyState variante="empty" compacto titulo={result.total === 0 ? tr("No hay disparadores registrados en este periodo") : tr("Registro no disponible")} /> : <ul className="mt-3 space-y-2">{result.sample.map(item => <li key={item.event_id} className="rounded-lg border border-line p-3 text-sm">
          <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{item.name || tr("Registro no disponible")}</span><StatusBadge estado={item.matched ? 'matched' : 'skipped'} tono={item.matched ? 'exito' : 'neutro'} etiqueta={item.matched ? tr("Se ejecutaría") : tr("Omitida")} /></div>
          <p className="sr-only">{formatDateTime(item.occurred_at)}</p>
          {item.skip_reason && <p className="mt-1 break-words text-xs text-fg-secondary">{tr(describeSkipReason(item.skip_reason))}</p>}
        </li>)}</ul>}
        {result.total > result.sample.length && <p className="mt-3 text-xs text-fg-muted">{tr("Se muestran los primeros")}{result.sample.length} {tr("registros; los totales incluyen todos los evaluados.")}</p>}
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>{tr("Volver a simular")}</Button>
      </>}
  </section>;
}
