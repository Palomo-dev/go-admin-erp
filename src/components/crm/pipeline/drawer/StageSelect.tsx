'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import type { GateResult } from '@/lib/services/crm/stageGateService';

/**
 * StageSelect — selector de etapa que llama PATCH /api/crm/opportunities/[id]/stage
 * y expone los tres resultados (ok | gate | needs_won/needs_lost). El padre
 * decide abrir GateWarningDialog / WonCloseModal / StructuredLossDialog.
 */
export interface StageOption { id: string; name: string; color?: string | null; is_won?: boolean | null; is_lost?: boolean | null }

export type StageChangeResult =
  | { ok: true; opportunity: Record<string, unknown> }
  | { ok: false; reason: 'gate'; gate: GateResult; stage: StageOption }
  | { ok: false; reason: 'needs_won' | 'needs_lost'; stage: StageOption }
  | { ok: false; reason: 'error'; message: string };

export async function requestStageChange(
  opportunityId: string,
  body: { stage_id: string; override?: boolean; override_reason?: string; won_data?: Record<string, unknown>; loss_data?: Record<string, unknown> }
): Promise<StageChangeResult> {
  try {
    const res = await fetch(`/api/crm/opportunities/${opportunityId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) return { ok: true, opportunity: json.data?.opportunity ?? {} };
    if (res.status === 409 && json.reason === 'gate') return { ok: false, reason: 'gate', gate: json.gate, stage: json.stage };
    if (res.status === 409 && (json.reason === 'needs_won' || json.reason === 'needs_lost')) return { ok: false, reason: json.reason, stage: json.stage };
    return { ok: false, reason: 'error', message: json.error || `Error ${res.status}` };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : 'Error de red' };
  }
}

export interface StageSelectProps {
  opportunityId: string;
  value: string;
  stages: StageOption[];
  disabled?: boolean;
  onResult: (r: StageChangeResult, targetStageId: string) => void;
  className?: string;
}

export function StageSelect({ opportunityId, value, stages, disabled, onResult, className }: StageSelectProps) {
  const [pending, setPending] = useState(false);
  const current = stages.find((s) => s.id === value);

  const handleChange = async (stageId: string) => {
    if (stageId === value) return;
    setPending(true);
    const r = await requestStageChange(opportunityId, { stage_id: stageId });
    setPending(false);
    if (!r.ok && r.reason === 'error') toast({ title: 'No se pudo cambiar la etapa', description: r.message, variant: 'destructive' });
    onResult(r, stageId);
  };

  return (
    <Select value={value} onValueChange={(v) => void handleChange(v)} disabled={disabled || pending}>
      <SelectTrigger className={className ?? 'h-8 w-[180px] text-xs'} aria-label="Etapa">
        <span className="flex items-center gap-1.5 truncate">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: current?.color ?? '#3b82f6' }} aria-hidden />}
          <SelectValue placeholder="Etapa" />
        </span>
      </SelectTrigger>
      <SelectContent>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color ?? '#3b82f6' }} aria-hidden />
              {s.name}{s.is_won ? ' ✓' : s.is_lost ? ' ✗' : ''}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
