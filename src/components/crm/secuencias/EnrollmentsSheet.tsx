'use client';

/**
 * Panel lateral con las inscripciones de una secuencia (brief UX 6.3).
 * Antes se desplegaban bajo la fila, con UUIDs y estados en inglés.
 * Reanudar y desinscribir siguen llamando a las mismas rutas (F8).
 * Los motivos se traducen con `reasonText` (catálogo probado contra el motor).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, LogOut, PauseCircle, Play, PlayCircle, UserPlus, XCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { fetchEnrollments, resumeEnrollment, unenroll, type EnrollmentView, type SequenceView } from './useSequences';
import { enrollBlockReason, enrollmentTitle, reasonText } from './sequenceOptions';

const STATUS: Record<EnrollmentView['status'], { label: string; icon: typeof PlayCircle; tone: string }> = {
  active: { label: 'En curso', icon: PlayCircle, tone: 'text-emerald-700 dark:text-emerald-300' },
  paused: { label: 'Pausada', icon: PauseCircle, tone: 'text-amber-700 dark:text-amber-300' },
  completed: { label: 'Completada', icon: CheckCircle2, tone: 'text-blue-700 dark:text-blue-300' },
  exited: { label: 'Salió', icon: XCircle, tone: 'text-gray-600 dark:text-gray-400' },
};

interface Props {
  sequence: SequenceView | null;
  onOpenChange: (open: boolean) => void;
  onEnroll: (sequence: SequenceView) => void;
  /** Se incrementa desde fuera para forzar una recarga (tras inscribir). */
  refreshKey: number;
  /** Adónde va el foco al cerrar si el botón que abrió ya no existe. */
  returnFocusFallback?: () => HTMLElement | null;
}

export function EnrollmentsSheet({ sequence, onOpenChange, onEnroll, refreshKey, returnFocusFallback }: Props) {
  const [rows, setRows] = useState<EnrollmentView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unenrolling, setUnenrolling] = useState<EnrollmentView | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const enrollButtonRef = useRef<HTMLButtonElement>(null);
  const { formatDateTime } = useFormatDate();
  const sequenceId = sequence?.id ?? null;
  // Mismo motivo que la tarjeta: sin pasos activos o inactiva, el botón lo dice.
  const blockReason = sequence ? enrollBlockReason(sequence) : null;
  const onCloseAutoFocus = useReturnFocus(sequence !== null, returnFocusFallback);
  // Al cerrar la confirmación, «Desinscribir» ya no existe (la fila salió):
  // el foco va a «Inscribir oportunidad», un control, no al contenedor.
  const focusEnrollButton = useCallback(() => enrollButtonRef.current, []);
  const onConfirmCloseAutoFocus = useReturnFocus(unenrolling !== null, focusEnrollButton);

  const load = useCallback(async () => {
    if (!sequenceId) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchEnrollments(sequenceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // Tras reanudar, el botón pulsado desaparece: el foco pasa a «Desinscribir»
  // de la misma fila (sigue inscrita) o, si no está, a «Inscribir oportunidad».
  useEffect(() => {
    if (!pendingFocus) return;
    (document.getElementById(pendingFocus) ?? enrollButtonRef.current)?.focus();
    setPendingFocus(null);
  }, [pendingFocus, rows]);

  const act = async (fn: () => Promise<void>, okTitle: string, failTitle: string, focusAfter?: string) => {
    try {
      await fn();
      toast({ title: okTitle });
      await load();
      if (focusAfter) setPendingFocus(focusAfter);
    } catch (err) {
      toast({ title: failTitle, description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  return (
    <Sheet open={sequence !== null} onOpenChange={onOpenChange}>
      <SheetContent onCloseAutoFocus={onCloseAutoFocus} className="flex w-full flex-col gap-4 overflow-y-auto border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 sm:max-w-lg">
        <SheetHeader>
          {/* `text-foreground` del kit no tiene variable definida aquí: el color va en un span propio. */}
          <SheetTitle><span className="text-gray-900 dark:text-gray-100">Inscripciones de «{sequence?.name ?? ''}»</span></SheetTitle>
          <SheetDescription>
            <span className="text-gray-600 dark:text-gray-400">
              Quién está dentro de la secuencia y en qué estado. Reanudar una pausada vuelve a programar envíos reales y deja de contar como «pausada por respuesta» en la tarjeta.
            </span>
          </SheetDescription>
        </SheetHeader>

        {sequence && (
          <div className="flex flex-wrap items-center gap-2">
            <Button ref={enrollButtonRef} className="w-fit bg-blue-600 text-white hover:bg-blue-700" onClick={() => onEnroll(sequence)} disabled={blockReason !== null} aria-describedby={blockReason ? 'enroll-block-reason' : undefined}>
              <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Inscribir oportunidad
            </Button>
            {blockReason && <p id="enroll-block-reason" className="text-xs text-gray-600 dark:text-gray-400">{blockReason}</p>}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            Nadie está inscrito todavía. Inscribe una oportunidad para que empiece a recibir los pasos.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((e) => {
              const s = STATUS[e.status] ?? STATUS.exited;
              const Icon = s.icon;
              const title = enrollmentTitle(e);
              const why = reasonText(e.status === 'paused' ? e.paused_reason : e.exit_reason);
              return (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900 dark:text-gray-100">{title}</p>
                    {e.customer_name && e.opportunity_name && (
                      <p className="truncate text-xs text-gray-600 dark:text-gray-400">{e.customer_name}</p>
                    )}
                    <p className={`mt-0.5 flex items-center gap-1 text-xs ${s.tone}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {s.label}{why ? ` · ${why}` : ''}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Inscrita el {formatDateTime(e.enrolled_at)}
                      {e.status === 'active' && e.next_run_at ? ` · siguiente paso ${formatDateTime(e.next_run_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {e.status === 'paused' && sequenceId && (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Reanudar la inscripción de ${title}`}
                        onClick={() => void act(() => resumeEnrollment(sequenceId, e.id), 'Inscripción reanudada', 'No se pudo reanudar', `enr-${e.id}-unenroll`)}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Reanudar
                      </Button>
                    )}
                    {(e.status === 'active' || e.status === 'paused') && sequenceId && (
                      <Button
                        id={`enr-${e.id}-unenroll`}
                        size="sm"
                        variant="ghost"
                        aria-label={`Desinscribir a ${title}`}
                        onClick={() => setUnenrolling(e)}
                      >
                        <LogOut className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Desinscribir
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Desinscribir es irreversible (exited/manual_unenroll): se confirma con el nombre (brief §3). */}
        <ConfirmDialog
          open={unenrolling !== null}
          onOpenChange={(open) => { if (!open) setUnenrolling(null); }}
          onCloseAutoFocus={onConfirmCloseAutoFocus}
          title={`Desinscribir a «${unenrolling ? enrollmentTitle(unenrolling) : ''}»`}
          description="Sale de la secuencia y no recibirá más pasos. No se puede deshacer: para volver habría que inscribirla de nuevo desde el principio."
          confirmLabel="Desinscribir"
          variant="destructive"
          onConfirm={async () => {
            if (unenrolling && sequenceId) await act(() => unenroll(sequenceId, unenrolling.id), 'Inscripción finalizada', 'No se pudo desinscribir');
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
