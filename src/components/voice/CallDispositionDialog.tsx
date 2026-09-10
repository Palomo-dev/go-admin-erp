'use client';

/**
 * CallDispositionDialog — resultado de la llamada al colgar (FASE-03 §5.2).
 * Resultado (radios) + próxima acción (tarea con fecha / reunión / email /
 * WhatsApp / ninguna) + nota (prefill de la nota en vivo).
 * PATCH /api/crm/calls/[id] { disposition } → calls.metadata, tasks,
 * actividad `call`, opportunities.last_contact_at/contact_result/next_contact_at.
 * Ctrl+Enter guarda; Esc = Omitir. Si aún no hay `calls.id` (webhook tardío),
 * reintenta resolverlo por CallSid hasta 5 veces antes de deshabilitar Guardar.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { DISPOSITION_LABELS, DISPOSITION_OUTCOMES, type DispositionOutcome } from '@/lib/services/crm/callDispositionService';
import type { EndedCallInfo } from './SoftphoneProvider';

type NextType = 'none' | 'task' | 'meeting' | 'email' | 'whatsapp' | 'call';
const NEXT_LABELS: Record<NextType, string> = { none: 'Ninguna', task: 'Tarea', call: 'Volver a llamar', meeting: 'Reunión', email: 'Email', whatsapp: 'WhatsApp' };

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface CallDispositionDialogProps {
  open: boolean;
  ended: EndedCallInfo;
  onClose: () => void;
  onSaved?: (callId: string) => void;
}

export function CallDispositionDialog({ open, ended, onClose, onSaved }: CallDispositionDialogProps) {
  const [outcome, setOutcome] = useState<DispositionOutcome>(ended.durationSeconds > 0 ? 'answered' : 'no_answer');
  const [nextType, setNextType] = useState<NextType>('none');
  const [dueAt, setDueAt] = useState(defaultDue());
  const [title, setTitle] = useState('');
  const [note, setNote] = useState(ended.liveNote ?? '');
  const [saving, setSaving] = useState(false);
  const [callId, setCallId] = useState<string | null>(ended.callId);

  // Resolver calls.id si aún no llegó (webhook del TwiML App tardío).
  useEffect(() => {
    if (callId || !ended.callSid || !open) return;
    let tries = 0;
    let cancelled = false;
    const tick = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/crm/calls?provider_call_sid=${encodeURIComponent(ended.callSid as string)}&limit=1`);
        const body = res.ok ? await res.json() : null;
        const id = body?.data?.[0]?.id as string | undefined;
        if (id && !cancelled) {
          setCallId(id);
          return;
        }
      } catch {
        /* noop */
      }
      if (!cancelled && tries < 5) window.setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [callId, ended.callSid, open]);

  const canSave = Boolean(callId) && !saving;
  const summary = useMemo(() => `${ended.displayName ?? ended.number} · ${formatDuration(ended.durationSeconds)}`, [ended]);

  const save = async () => {
    if (!callId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposition: {
            outcome,
            note: note.trim() || null,
            next_action: nextType === 'none' ? null : { type: nextType, due_at: dueAt ? new Date(dueAt).toISOString() : null, title: title.trim() || null },
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
      toast({ title: `Llamada registrada (${formatDuration(ended.durationSeconds)})`, description: body.task_id ? 'Se creó la tarea de seguimiento' : undefined });
      onSaved?.(callId);
      onClose();
    } catch (err) {
      toast({ title: 'No se pudo guardar el resultado', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey && canSave) {
            e.preventDefault();
            void save();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Resultado de la llamada</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-gray-900 dark:text-gray-100">¿Cómo terminó?</legend>
          <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as DispositionOutcome)} className="grid grid-cols-2 gap-2">
            {DISPOSITION_OUTCOMES.map((o) => (
              <div key={o} className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1.5 dark:border-gray-700">
                <RadioGroupItem value={o} id={`disp-${o}`} />
                <Label htmlFor={`disp-${o}`} className="cursor-pointer text-sm font-normal">
                  {DISPOSITION_LABELS[o]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="disp-next">Próxima acción</Label>
          <div className="flex gap-2">
            <select
              id="disp-next"
              value={nextType}
              onChange={(e) => setNextType(e.target.value as NextType)}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {(Object.keys(NEXT_LABELS) as NextType[]).map((k) => (
                <option key={k} value={k}>
                  {NEXT_LABELS[k]}
                </option>
              ))}
            </select>
            {nextType !== 'none' && <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Fecha de la próxima acción" className="flex-1" />}
          </div>
          {nextType === 'task' && <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la tarea (opcional)" aria-label="Título de la tarea" />}
        </div>

        <div className="space-y-1">
          <Label htmlFor="disp-note">Nota</Label>
          <Textarea id="disp-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resumen breve de la conversación…" />
        </div>

        {!callId && <p className="text-xs text-yellow-700 dark:text-yellow-300">Esperando el registro de la llamada…</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Omitir
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!canSave}>
            {saving ? 'Guardando…' : 'Guardar (Ctrl+Enter)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
