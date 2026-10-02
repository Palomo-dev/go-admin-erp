'use client';
import { useAutomationText } from './useAutomationText';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { BulkAutomationPreview } from '@/lib/services/crm/automation/automationBulkPreview';
import { BulkDryRunPreview } from './BulkDryRunPreview';
interface Props { open: boolean; id: string | null; name: string | null; onOpenChange(value: boolean): void; onRun(id: string): Promise<BulkAutomationPreview> }
export function BulkDryRunDialog({ open, id, name, onOpenChange, onRun }: Props) {
  const tr = useAutomationText();
  const [result,setResult] = useState<BulkAutomationPreview | null>(null), [error,setError] = useState<string | null>(null);
  const [loading,setLoading] = useState(false), [attempt,setAttempt] = useState(0);
  const latest = useRef(onRun); latest.current = onRun;
  useEffect(() => {
    if (!open || !id) return;
    let alive = true; setLoading(true); setResult(null); setError(null);
    latest.current(id).then(data => { if (alive) setResult(data); }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Error desconocido'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  },[open,id,attempt]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{tr("Simulación de la regla guardada")}</DialogDescription></DialogHeader>
    <BulkDryRunPreview result={result} error={error} loading={loading} onRetry={() => setAttempt(x => x+1)} />
  </DialogContent></Dialog>;
}
