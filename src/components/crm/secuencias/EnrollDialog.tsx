'use client';

/**
 * Diálogo de inscripción en una secuencia (FASE-08 §5.3).
 *
 * Corrige el hallazgo N7 del tester r2: «la única acción que dispara envíos
 * reales desde la interfaz era un identificador pegado a mano, sin selector,
 * sin previsualizar los pasos y sin confirmación, mientras que borrar una
 * secuencia sí la pide».
 *
 * Ahora son dos pasos explícitos:
 *   1. Buscar la oportunidad por nombre y elegirla de una lista (con el nombre
 *      del cliente, su email y un aviso si ya está inscrita).
 *   2. Confirmar viendo la lista completa de pasos que se van a ejecutar y
 *      cuándo, más el destinatario real.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Search, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { fetchEnrollPreview, type EnrollCandidate, type EnrollPreviewStep } from './useSequences';

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email al cliente',
  whatsapp: 'WhatsApp al cliente',
  sms: 'SMS (sin proveedor: fallará)',
  call: 'Tarea de llamada para el vendedor',
  task: 'Tarea',
  wait: 'Espera',
  condition: 'Condición (puede cortar la secuencia)',
};

function delayLabel(step: EnrollPreviewStep): string {
  const days = step.delay_days ?? 0;
  const hours = step.delay_hours ?? 0;
  if (days === 0 && hours === 0) return 'inmediato';
  return [days > 0 ? `${days} d` : null, hours > 0 ? `${hours} h` : null].filter(Boolean).join(' ');
}

interface Props {
  open: boolean;
  sequenceId: string | null;
  sequenceName: string;
  onOpenChange: (open: boolean) => void;
  onEnroll: (sequenceId: string, opportunityId: string) => Promise<{ enrolled: number; skipped: { reason: string }[] }>;
  onDone: () => void | Promise<void>;
}

export function EnrollDialog({ open, sequenceId, sequenceName, onOpenChange, onEnroll, onDone }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<EnrollPreviewStep[]>([]);
  const [candidates, setCandidates] = useState<EnrollCandidate[]>([]);
  const [selected, setSelected] = useState<EnrollCandidate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (q: string) => {
    if (!sequenceId) return;
    setLoading(true);
    setError(null);
    try {
      const preview = await fetchEnrollPreview(sequenceId, q);
      setSteps(preview.steps);
      setCandidates(preview.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    void load('');
  }, [open, load]);

  const confirmEnroll = async () => {
    if (!sequenceId || !selected) return;
    setSaving(true);
    try {
      const result = await onEnroll(sequenceId, selected.id);
      toast({
        title: result.enrolled > 0 ? 'Oportunidad inscrita' : 'No se inscribió',
        description: result.enrolled > 0
          ? `${steps.length} paso(s) programados. El primero saldrá ${delayLabel(steps[0] ?? { delay_days: 0, delay_hours: 0 } as EnrollPreviewStep)}.`
          : (result.skipped[0]?.reason ?? 'sin detalle'),
        variant: result.enrolled > 0 ? undefined : 'destructive',
      });
      if (result.enrolled > 0) {
        onOpenChange(false);
        await onDone();
      }
    } catch (err) {
      toast({
        title: 'No se pudo inscribir',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const sendsToCustomer = steps.some((s) => s.channel === 'email' || s.channel === 'whatsapp' || s.channel === 'sms');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inscribir en «{sequenceName}»</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <section aria-labelledby="pasos-secuencia">
            <h3 id="pasos-secuencia" className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Lo que se va a ejecutar ({steps.length} paso{steps.length === 1 ? '' : 's'})
            </h3>
            {loading && steps.length === 0 ? (
              <Skeleton className="mt-2 h-20 w-full" />
            ) : steps.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Esta secuencia no tiene pasos activos: no se puede inscribir.
              </p>
            ) : (
              <ol className="mt-2 space-y-1 text-sm">
                {steps.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">#{s.step_number}</span>
                    <span>{CHANNEL_LABEL[s.channel] ?? s.channel}</span>
                    <Badge variant="secondary">{delayLabel(s)}</Badge>
                    {s.channel === 'condition' && (s.condition_rules ?? 0) === 0 && (
                      <Badge variant="destructive">sin reglas: cortará aquí</Badge>
                    )}
                    {s.name ? <span className="text-xs text-gray-500 dark:text-gray-400">{s.name}</span> : null}
                  </li>
                ))}
              </ol>
            )}
            {sendsToCustomer && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Esta secuencia envía mensajes reales al cliente. El consentimiento y la ventana de 24 h se aplican al
                despachar, pero la inscripción es inmediata.
              </p>
            )}
          </section>

          <section aria-labelledby="elegir-oportunidad" className="space-y-2">
            <h3 id="elegir-oportunidad" className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Oportunidad
            </h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="buscar-oportunidad" className="sr-only">Buscar oportunidad por nombre</Label>
              <Input
                id="buscar-oportunidad"
                placeholder="Buscar por nombre de la oportunidad"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(query); } }}
              />
              <Button type="button" variant="outline" onClick={() => void load(query)} disabled={loading}>
                <Search className="mr-1.5 h-4 w-4" aria-hidden="true" /> Buscar
              </Button>
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>
            )}

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : candidates.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Sin oportunidades abiertas que coincidan.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-gray-200 overflow-y-auto rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.id === c.id}
                      disabled={c.already_enrolled}
                      onClick={() => setSelected(c)}
                      className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected?.id === c.id
                          ? 'bg-blue-50 dark:bg-blue-950/40'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                          {c.customer_name ?? 'Sin cliente'}{c.customer_email ? ` · ${c.customer_email}` : ' · sin email'}
                        </span>
                      </span>
                      {c.already_enrolled && <Badge variant="secondary">Ya inscrita</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-gray-900 dark:text-gray-100">
                Se inscribirá <strong>{selected.name}</strong>
                {selected.customer_name ? <> — cliente <strong>{selected.customer_name}</strong></> : null}
                {selected.customer_email ? <> ({selected.customer_email})</> : <> (sin email: los pasos de correo fallarán)</>}.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void confirmEnroll()}
            disabled={saving || !selected || steps.length === 0}
          >
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {saving ? 'Inscribiendo…' : 'Confirmar inscripción'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
