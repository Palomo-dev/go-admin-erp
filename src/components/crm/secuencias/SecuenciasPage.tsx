'use client';

/**
 * /app/crm/secuencias — secuencias multicanal (FASE-08 §5.1).
 *
 * Lista, crea, activa/desactiva, inscribe una oportunidad y muestra las
 * inscripciones con su estado real. La inscripción es atómica y no duplica:
 * si ya hay una viva, la respuesta lo dice (`already_active`).
 *
 * Ronda 2: inscribir ya no es pegar un UUID (tester r2 N7) sino elegir la
 * oportunidad en `EnrollDialog`, con previsualización de los pasos y
 * confirmación; y una inscripción pausada se puede REANUDAR (tester r2 N3).
 */

import { useCallback, useState } from 'react';
import { Plus, RefreshCw, Trash2, Pencil, Users, UserPlus, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { SequenceFormDialog } from './SequenceFormDialog';
import { EnrollDialog } from './EnrollDialog';
import {
  fetchEnrollments,
  resumeEnrollment,
  unenroll,
  useSequences,
  type EnrollmentView,
  type SequenceView,
} from './useSequences';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export function SecuenciasPage() {
  const { sequences, loading, error, reload, save, toggle, remove, enroll } = useSequences();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SequenceView | null>(null);
  const [openEnrollments, setOpenEnrollments] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentView[]>([]);
  const [enrollDialog, setEnrollDialog] = useState<SequenceView | null>(null);

  const loadEnrollments = useCallback(async (sequenceId: string) => {
    try {
      setEnrollments(await fetchEnrollments(sequenceId));
      setOpenEnrollments(sequenceId);
    } catch (err) {
      toast({
        title: 'No se pudieron cargar las inscripciones',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  }, []);

  const onResume = async (sequenceId: string, enrollmentId: string) => {
    try {
      await resumeEnrollment(sequenceId, enrollmentId);
      toast({ title: 'Inscripción reanudada', description: 'El siguiente paso pendiente volvió a la cola.' });
      await loadEnrollments(sequenceId);
    } catch (err) {
      toast({
        title: 'No se pudo reanudar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const onUnenroll = async (sequenceId: string, enrollmentId: string) => {
    try {
      await unenroll(sequenceId, enrollmentId);
      toast({ title: 'Inscripción finalizada' });
      await loadEnrollments(sequenceId);
    } catch (err) {
      toast({
        title: 'No se pudo desinscribir',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const runAction = async (fn: () => Promise<unknown>, okTitle: string) => {
    try {
      await fn();
      toast({ title: okTitle });
    } catch (err) {
      toast({
        title: 'Operación no realizada',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Secuencias</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Series de pasos por canal con retardos. Cada paso se ejecuta desde la cola del servidor, una sola vez.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reload()}>
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Actualizar
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nueva secuencia
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : sequences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-gray-100">Todavía no hay secuencias</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Por ejemplo: email el día 0, tarea de llamada el día 1 y WhatsApp el día 3.
          </p>
          <Button className="mt-4" onClick={() => { setEditing(null); setFormOpen(true); }}>Crear secuencia</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {sequences.map((sequence) => (
            <li key={sequence.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{sequence.name}</span>
                    <Badge variant={sequence.is_active ? 'default' : 'secondary'}>
                      {sequence.is_active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {sequence.trigger_type} · {sequence.steps?.length ?? 0} paso(s) ·{' '}
                    {(sequence.steps ?? []).map((s) => `${s.channel}(+${s.delay_days}d)`).join(' → ') || 'sin pasos'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    aria-label={`Activar la secuencia ${sequence.name}`}
                    checked={sequence.is_active}
                    onCheckedChange={() => void runAction(() => toggle(sequence), sequence.is_active ? 'Secuencia desactivada' : 'Secuencia activada')}
                  />
                  <Button size="icon" variant="ghost" aria-label={`Inscripciones de ${sequence.name}`} onClick={() => void loadEnrollments(sequence.id)}>
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Editar ${sequence.name}`} onClick={() => { setEditing(sequence); setFormOpen(true); }}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Eliminar ${sequence.name}`}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar la secuencia "${sequence.name}"?`)) {
                        void runAction(() => remove(sequence.id), 'Secuencia eliminada');
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {openEnrollments === sequence.id && (
                <div className="mt-3 space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => setEnrollDialog(sequence)}>
                      <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Inscribir oportunidad
                    </Button>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Se elige de una lista y se confirma viendo los pasos que se van a enviar.
                    </span>
                  </div>
                  {enrollments.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Sin inscripciones.</p>
                  ) : (
                    <ul className="divide-y divide-gray-200 text-sm dark:divide-gray-700">
                      {enrollments.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <span className="text-gray-700 dark:text-gray-300">
                            {e.opportunity_id ?? e.customer_id ?? '—'} · {e.status}
                            {e.status === 'paused' && e.paused_reason ? ` (${e.paused_reason})` : ''}
                            {e.exit_reason ? ` (${e.exit_reason})` : ''} · {formatDate(e.enrolled_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            {e.status === 'paused' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="Reanudar la inscripción pausada"
                                onClick={() => void onResume(sequence.id, e.id)}
                              >
                                <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Reanudar
                              </Button>
                            )}
                            {(e.status === 'active' || e.status === 'paused') && (
                              <Button size="sm" variant="ghost" onClick={() => void onUnenroll(sequence.id, e.id)}>
                                Desinscribir
                              </Button>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <SequenceFormDialog open={formOpen} sequence={editing} onOpenChange={setFormOpen} onSave={save} />

      <EnrollDialog
        open={enrollDialog !== null}
        sequenceId={enrollDialog?.id ?? null}
        sequenceName={enrollDialog?.name ?? ''}
        onOpenChange={(open) => { if (!open) setEnrollDialog(null); }}
        onEnroll={enroll}
        onDone={() => (enrollDialog ? loadEnrollments(enrollDialog.id) : Promise.resolve())}
      />
    </div>
  );
}
