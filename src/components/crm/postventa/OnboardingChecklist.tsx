'use client';

import { useEffect, useRef } from 'react';
import { CalendarClock, CheckCircle2, ClipboardList, Loader2, PlayCircle, RefreshCw, UserRound } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, todayInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { checklistStepControl, focusTargetAfterComplete, ownerLabel } from '@/lib/services/crm/onboardingProgress';
import { useOnboardingInstance, type OnboardingChecklistStep } from './useOnboardingInstance';

/**
 * Checklist de onboarding (F11 §4.2) en la ficha de la oportunidad de
 * onboarding: pasos con casilla, responsable (owner de la plantilla),
 * vencimiento en la zona de la organización, progreso `role="progressbar"`
 * y «Completar onboarding» solo cuando todos los pasos están hechos
 * (el servidor lo vuelve a exigir: 409 si falta alguno).
 * Foco (r2): la casilla nunca se desmonta al guardar (sigue enfocable con
 * `aria-busy`/`aria-disabled` y handler inerte; `disabled` del DOM le quitaría
 * el foco), spinner al lado; al completar, el botón desaparece y el foco va al
 * mensaje de estado (`tabIndex=-1`), no al `body`.
 */
export interface OnboardingChecklistProps {
  opportunityId: string;
  active?: boolean;
  /** Se invoca tras completar (la oportunidad pasó a la etapa ganada). */
  onCompleted?: () => void;
}

export function OnboardingChecklist({ opportunityId, active = true, onCompleted }: OnboardingChecklistProps) {
  const { timezone } = useOrgTimezone();
  const { data, loading, error, busyStepId, busyAction, reload, start, toggleStep, complete } = useOnboardingInstance(opportunityId, active);
  const today = todayInTz(timezone);
  const fmtDay = (v: string | null) => (v ? formatDateInTz(v, timezone, { day: '2-digit', month: 'short' }) : null);
  const isOverdue = (s: OnboardingChecklistStep) => !s.is_completed && !!s.due_date && toPlainDate(new Date(s.due_date), timezone) < today;
  const statusRef = useRef<HTMLParagraphElement>(null);
  const completeBtnRef = useRef<HTMLButtonElement>(null);
  const focusPendingRef = useRef<'status' | 'button' | null>(null);
  const completed = data?.status === 'completed';

  useEffect(() => {
    if (!focusPendingRef.current) return;
    const target = focusPendingRef.current === 'status' ? statusRef.current : completeBtnRef.current;
    if (target) {
      target.focus();
      focusPendingRef.current = null;
    }
  }, [completed, data]);

  const handleComplete = async () => {
    const ok = await complete();
    focusPendingRef.current = focusTargetAfterComplete(ok);
    if (ok) {
      toast({ title: 'Onboarding completado', description: 'La oportunidad pasó a la etapa final del pipeline de onboarding.' });
      onCompleted?.();
    }
  };

  if (loading) {
    return <div className="space-y-2" aria-busy="true"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-2 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-3">
          <ClipboardList className="h-6 w-6 text-blue-700 dark:text-blue-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Este onboarding aún no tiene checklist</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-xs">Se creará con los pasos de la plantilla de tu organización y sus fechas desde hoy.</p>
        {error && <Alert variant="destructive" className="mt-3 text-left"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => void start()} disabled={busyAction === 'start'}>
          {busyAction === 'start' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PlayCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />}
          Iniciar checklist
        </Button>
      </div>
    );
  }

  const { progress } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
            Checklist de onboarding
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
            {data.template_name ?? 'Plantilla'} · inicio {fmtDay(data.started_at)}
            {completed && data.completed_at ? ` · completado ${fmtDay(data.completed_at)}` : ''}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={() => void reload()} aria-label="Actualizar checklist">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5 text-xs">
          <span className="text-gray-700 dark:text-gray-300">{progress.done} de {progress.total} pasos completados</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{progress.pct} %</span>
        </div>
        <div role="progressbar" aria-label="Progreso del onboarding" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct} aria-valuetext={`${progress.done} de ${progress.total} pasos`} className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${completed ? 'bg-green-600 dark:bg-green-400' : 'bg-blue-600'} transition-[width] duration-300 motion-reduce:transition-none`} style={{ width: `${progress.pct}%` }} />
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <ul className="space-y-1.5" aria-label="Pasos del onboarding">
        {data.steps.map((step) => {
          const overdue = isOverdue(step);
          const checkboxId = `onb-step-${step.id}`;
          const control = checklistStepControl({ stepId: step.id, busyStepId, instanceCompleted: completed });
          return (
            <li key={step.id} className={`flex items-start gap-3 p-2.5 rounded-lg border ${step.is_completed ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/50' : 'bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'}`}>
              <div className="mt-0.5 flex items-center gap-1.5 shrink-0">
                <Checkbox id={checkboxId} checked={step.is_completed} disabled={control.disabled} aria-disabled={control.locked || undefined} aria-busy={control.busy || undefined} onCheckedChange={() => { if (!control.locked) void toggleStep(step); }} className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white" />
                {control.busy && <Loader2 className="h-4 w-4 text-gray-500 animate-spin motion-reduce:animate-none" aria-hidden="true" data-testid="step-saving" />}
              </div>
              <div className="flex-1 min-w-0">
                <label htmlFor={checkboxId} className={`block text-sm font-medium cursor-pointer ${step.is_completed ? 'text-green-800 dark:text-green-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                  {step.step_number}. {step.name}
                </label>
                {step.description && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{step.description}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
                  <span className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-300"><UserRound className="h-3 w-3" aria-hidden="true" />{ownerLabel(step.owner)}</span>
                  {step.due_date && (
                    <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-700 dark:text-red-400 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
                      <CalendarClock className="h-3 w-3" aria-hidden="true" />
                      {overdue ? 'Vencido el ' : 'Vence el '}{fmtDay(step.due_date)}
                    </span>
                  )}
                  {step.is_completed && step.completed_at && <span className="text-green-800 dark:text-green-300">Hecho el {fmtDay(step.completed_at)}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {completed ? (
        <p ref={statusRef} tabIndex={-1} role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800 dark:text-green-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Onboarding completado</p>
      ) : (
        <Button ref={completeBtnRef} className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={() => void handleComplete()} disabled={!progress.allDone || busyAction === 'complete'} aria-disabled={!progress.allDone}>
          {busyAction === 'complete' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />}
          {progress.allDone ? 'Completar onboarding' : `Completar onboarding (faltan ${progress.total - progress.done})`}
        </Button>
      )}
    </div>
  );
}

export default OnboardingChecklist;
