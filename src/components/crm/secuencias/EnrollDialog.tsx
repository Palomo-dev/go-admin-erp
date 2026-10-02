'use client';
import { useSequenceText } from './useSequenceText';

/**
 * Diálogo de inscripción (FASE-08 §5.3, rediseño UX brief 6.3).
 *
 * Corto: (1) a quién —buscar y elegir la oportunidad—, (2) qué se va a
 * enviar —siempre desde el primer paso: la RPC `fn_enroll_in_sequence` no
 * admite `p_start_step`, así que no se ofrece una elección que no existe—,
 * y (3) una advertencia inequívoca, con los canales nombrados, de que se
 * enviarán mensajes REALES a una persona, con casilla de confirmación.
 * Sigue llamando a `/enroll/preview` y `/enroll` (F8, sin cambios).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Search, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { describeDelay } from '@/lib/services/crm/sequenceTimeline';
import { ChannelIcon, channelMeta } from './channelMeta';
import { enrollBlockReason, enrollErrorText, enrollWarning, stepsCountLabel } from './sequenceOptions';
import { fetchEnrollPreview, type EnrollCandidate, type EnrollPreviewStep, type SequenceView } from './useSequences';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';

interface Props {
  open: boolean;
  sequence: SequenceView | null;
  onOpenChange: (open: boolean) => void;
  onEnroll: (sequenceId: string, opportunityId: string) => Promise<{ enrolled: number; skipped: { reason: string }[] }>;
  onDone: () => void | Promise<void>;
  /** Adónde va el foco al cerrar si el botón que abrió ya no existe. */
  returnFocusFallback?: () => HTMLElement | null;
}

/** «El primero sale de inmediato» / «El primero sale 2 días después» (antes «sale inmediato»). */
function firstStepSentence(first: EnrollPreviewStep | undefined,tr:ReturnType<typeof useSequenceText>): string {
  if (!first) return tr('El primero sale ahora.');
  const delay = describeDelay(first,tr);
  return delay === tr('Inmediato') ? tr('El primero sale de inmediato.') : tr('El primero sale {p0}.',{p0:delay.toLowerCase()});
}

export function EnrollDialog({ open, sequence, onOpenChange, onEnroll, onDone, returnFocusFallback }: Props) {
 const tr=useSequenceText();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<EnrollPreviewStep[]>([]);
  // Lo que dice el servidor al abrir: si la secuencia se desactivó desde otra pestaña, la tarjeta no lo sabe.
  const [previewActive, setPreviewActive] = useState(true);
  const [candidates, setCandidates] = useState<EnrollCandidate[]>([]);
  const [selected, setSelected] = useState<EnrollCandidate | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
 const pendingSave=useRef(false),loadVersion=useRef(0);
  const sequenceId = sequence?.id ?? null;
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);

  const load = useCallback(async (q: string) => {
    if (!sequenceId) return;
    const version=++loadVersion.current;setSelected(null);setAcknowledged(false);
    setLoading(true);
    setError(null);
    try {
      const preview = await fetchEnrollPreview(sequenceId, q);
      if(loadVersion.current!==version)return;
      setSteps(preview.steps);
      setCandidates(preview.candidates);
      setPreviewActive(preview.sequence.is_active);
    } catch (err) {
      if(loadVersion.current===version)setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      if(loadVersion.current===version)setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    if (!open) {loadVersion.current++;return;}
    setQuery('');
    setSelected(null);
    setAcknowledged(false);
    void load('');
  }, [open, load]);

  // Qué canales llegan a una persona y qué contacto falta: función pura probada.
  const { sendsToCustomer, channelNames, contactNote } = enrollWarning(steps, selected ?? { customer_email: null }, tr);
  const first = steps[0];
  // Misma guarda que la tarjeta, con los datos frescos del preview (pasos activos + estado).
  const blockReason = loading ? null : enrollBlockReason({ is_active: previewActive, steps }, tr);
  const canConfirm = !!selected && blockReason === null && !loading && !error && !saving && (!sendsToCustomer || acknowledged);

  const confirmEnroll = async () => {
    if (!sequenceId || !selected || !canConfirm) return;
    if(pendingSave.current)return;pendingSave.current=true;setSaving(true);
    try {
      const result = await onEnroll(sequenceId, selected.id);
      if (result.enrolled > 0) {
        toast({
          title: tr("{p0} inscrita",{p0:selected.name}),
          description: tr("{p0} paso{p1} programado{p2}. {p3}",{p0:steps.length,p1:steps.length === 1 ? '' : 's',p2:steps.length === 1 ? '' : 's',p3:firstStepSentence(first,tr)}),
        });
        onOpenChange(false);
        await onDone();
      } else {
        toast({ title: tr("No se inscribió"), description: tr(enrollErrorText(result.skipped[0]?.reason)) || tr("sin detalle"), variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: tr("No se pudo inscribir"), description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    } finally {
      pendingSave.current=false;setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next=>{if(!saving)onOpenChange(next);}}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tr("Inscribir en «")}{sequence?.name ?? ''}»</DialogTitle>
          <DialogDescription>{tr("Elige la oportunidad. Empieza por el primer paso y sigue sola desde el servidor.")}</DialogDescription>
        </DialogHeader>

        <fieldset disabled={saving} className="min-w-0 space-y-4">
          <section aria-labelledby="enroll-who" className="space-y-2">
            <h3 id="enroll-who" className="text-sm font-medium text-fg dark:text-fg">{tr("1. A quién")}</h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="buscar-oportunidad" className="sr-only">{tr("Buscar oportunidad por nombre")}</Label>
              <Input
                id="buscar-oportunidad"
                placeholder={tr("Buscar por nombre de la oportunidad")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(query); } }}
              />
              <Button type="button" variant="outline" onClick={() => void load(query)} disabled={loading} aria-label={tr("Buscar")}>
                <Search strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {error && <p role="alert" className="text-sm text-danger-text dark:text-danger-text">{tr(error)}</p>}
            {loading ? (
              <Skeleton className="h-28 w-full" />
            ) : candidates.length === 0 ? (
              <p className="text-sm text-fg-secondary dark:text-fg-secondary">{tr("Sin oportunidades abiertas que coincidan.")}</p>
            ) : (
              <ul className="max-h-48 divide-y divide-gray-200 overflow-y-auto rounded-md border border-line dark:divide-gray-700 dark:border-line-strong" aria-label={tr("Oportunidades")}>
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={selected?.id === c.id}
                      disabled={c.already_enrolled}
                      onClick={() => { setSelected(c); setAcknowledged(false); }}
                      className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 ${
                        selected?.id === c.id ? 'bg-brand-tint dark:bg-blue-950/40' : 'hover:bg-subtle dark:hover:bg-hover/60'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg dark:text-fg">{c.name}</span>
                        <span className="block truncate text-xs text-fg-secondary dark:text-fg-secondary">
                          {c.customer_name ?? tr("Sin cliente")}{c.customer_email ? tr(" · {p0}",{p0:c.customer_email}) : tr(" · sin email")}
                        </span>
                      </span>
                      {c.already_enrolled && <Badge variant="secondary">{tr("Ya inscrita")}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="enroll-from" className="space-y-2">
            <h3 id="enroll-from" className="text-sm font-medium text-fg dark:text-fg">{tr("2. Qué se va a enviar")}</h3>
            {loading && steps.length === 0 ? (
              <Skeleton className="h-10 w-full" />
            ) : blockReason ? (
              <p role="alert" className="text-sm text-danger-text dark:text-danger-text">{blockReason}</p>
            ) : (
              <ol className="flex flex-wrap items-center gap-2" aria-label={stepsCountLabel(steps.length, tr)}>
                {steps.map((s, i) => (
                  <li key={s.id} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${
                    i === 0 ? 'border-brand bg-brand-tint text-blue-900 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-100' : 'border-line text-fg-secondary dark:border-line-strong dark:text-fg-secondary'
                  }`}>
                    <ChannelIcon channel={s.channel} size="sm" />
                    <span>{i === 0 ? tr("Empieza: ") : ''}{tr(channelMeta(s.channel).label)} · {describeDelay(s, tr).toLowerCase()}</span>
                    {s.channel === 'condition' && (s.condition_rules ?? 0) === 0 && <Badge variant="destructive">{tr("sin reglas: corta")}</Badge>}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {selected && blockReason === null && (
            <div
              role="alert"
              className={`rounded-lg border-2 p-3 text-sm ${sendsToCustomer
                ? 'border-red-500 bg-red-50 text-red-900 dark:border-red-500 dark:bg-red-950/40 dark:text-red-100'
                : 'border-line-strong bg-subtle text-fg dark:border-gray-600 dark:bg-surface/40 dark:text-fg'}`}
            >
              <p className="flex items-start gap-2 font-medium">
                <AlertTriangle strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {sendsToCustomer
                  ? <span>{tr("Esto NO es una prueba: se enviarán mensajes reales por")}<strong>{channelNames}</strong> {tr("a")}<strong>{selected.customer_name ?? selected.name}</strong>{contactNote}.</span>
                  : <span>{tr("Se inscribirá")}<strong>{selected.name}</strong>{tr(". Esta secuencia no envía mensajes al cliente: solo crea tareas o esperas.")}</span>}
              </p>
              {sendsToCustomer && (
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  <span>{tr("Entiendo que se enviarán mensajes reales por")}{channelNames} {tr("a esta persona en cuanto toque cada paso.")}</span>
                </label>
              )}
            </div>
          )}
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{tr("Cancelar")}</Button>
          <Button type="button" onClick={() => void confirmEnroll()} disabled={!canConfirm} className="bg-brand text-white hover:bg-brand-deep">
            <UserPlus strokeWidth={1.5} className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {saving ? tr('Inscribiendo…') : sendsToCustomer ? tr("Confirmar inscripción y envíos") : tr("Confirmar inscripción")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
