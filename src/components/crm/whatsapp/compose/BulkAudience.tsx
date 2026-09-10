'use client';

import { Loader2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { SKIP_REASON_LABELS, type MaterializeResult } from '../api';

export interface BulkRecipient { customerId: string; opportunityId?: string | null; name?: string | null; phone?: string | null }

/** Panel de audiencia para el modo masivo: conteo, exclusiones por razón, throttle, horario y confirmación de opt-in. */
export function BulkAudience(p: {
  recipients: BulkRecipient[];
  result: MaterializeResult | null;
  calculating: boolean;
  onCalculate: () => void;
  throttle: number;
  onThrottle: (v: number) => void;
  respectHours: boolean;
  onRespectHours: (v: boolean) => void;
  optinConfirmed: boolean;
  onOptinConfirmed: (v: boolean) => void;
  requireOptin: boolean;
  disabled?: boolean;
}) {
  const reasons = Object.entries(p.result?.skipped_by_reason ?? {});
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4 text-emerald-600" aria-hidden="true" />{p.recipients.length} contactos seleccionados</p>
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={p.onCalculate} disabled={p.disabled || p.calculating}>
          {p.calculating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}{p.result ? 'Recalcular' : 'Calcular audiencia'}
        </Button>
      </div>
      {p.result && (
        <div className="text-xs space-y-1" aria-live="polite">
          <p><span className="font-semibold text-emerald-700 dark:text-emerald-400">{p.result.pending} pendientes</span> · {p.result.skipped} excluidos de {p.result.total}</p>
          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {reasons.map(([r, n]) => <Badge key={r} variant="outline" className="text-[10px]">{SKIP_REASON_LABELS[r] ?? r}: {n}</Badge>)}
            </div>
          )}
          {p.result.estimated_cost !== null && <p className="text-gray-600 dark:text-gray-300">Costo estimado ≈ ${p.result.estimated_cost.toFixed(4)} USD</p>}
          {p.result.pending === 0 && <p className="text-amber-700 dark:text-amber-400">Nadie cumple los criterios.</p>}
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="wa-throttle" className="text-xs">Velocidad: {p.throttle} msg/s</Label>
        <Slider id="wa-throttle" min={1} max={80} step={1} value={[p.throttle]} onValueChange={(v: number[]) => p.onThrottle(v[0] ?? 10)} disabled={p.disabled} aria-valuemin={1} aria-valuemax={80} aria-valuenow={p.throttle} />
      </div>
      <label className="flex items-center gap-2 text-xs"><Checkbox checked={p.respectHours} onCheckedChange={(v) => p.onRespectHours(v === true)} disabled={p.disabled} />Respetar el horario permitido de contacto</label>
      {p.requireOptin && (
        <label className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-300"><Checkbox checked={p.optinConfirmed} onCheckedChange={(v) => p.onOptinConfirmed(v === true)} disabled={p.disabled} />He verificado que estos contactos dieron su consentimiento (opt-in) para mensajes de marketing</label>
      )}
    </div>
  );
}
