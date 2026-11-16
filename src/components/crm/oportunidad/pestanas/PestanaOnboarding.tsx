'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, ClipboardList, Loader2, PlayCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/kit/EmptyState';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { clasesBoton } from '@/components/kit/botonClases';
import { nombreUsuario } from '@/components/crm/acciones/catalogosCrmLogica';
import { fechaCortaInstante } from '@/components/crm/kit/fechasCrm';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { useOnboardingInstance } from '@/components/crm/postventa/useOnboardingInstance';
import { checklistStepControl } from '@/lib/services/crm/onboardingProgress';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

/**
 * Pestaña «Onboarding» (solo oportunidades de onboarding; Figma 822:237627):
 * «Checklist de onboarding · N de M pasos», barra de progreso, cada paso con
 * casilla, responsable y fecha en la zona de la organización, y «Completar
 * onboarding», deshabilitado con su motivo hasta que todos estén hechos (el
 * servidor lo vuelve a exigir). Reutiliza las rutas y el hook de F11.
 */
export interface PestanaOnboardingProps {
  oportunidadId: string;
  usuarios: readonly OpcionUsuario[];
  onCompletado?: () => void;
}

export function PestanaOnboarding({ oportunidadId, usuarios, onCompletado }: PestanaOnboardingProps) {
  const t = useTranslations('crm.oportunidad.pestanas.onboarding');
  const idioma = useLocale();
  const { timezone } = useFormatDate();
  const ob = useOnboardingInstance(oportunidadId, true);

  if (ob.loading) return <div aria-busy="true" className="flex flex-col gap-2">{[24, 8, 44, 44, 44].map((h, i) => <div key={i} className="animate-pulse rounded-lg bg-subtle" style={{ height: h }} />)}</div>;
  if (!ob.data) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState
          variante={ob.error ? 'error' : 'empty'}
          compacto
          icono={ob.error ? undefined : ClipboardList}
          titulo={ob.error ? t('errorCarga') : t('sinChecklist')}
          descripcion={ob.error ?? t('sinChecklistDetalle')}
          accion={ob.error ? undefined : { etiqueta: t('iniciar'), icono: PlayCircle, onClick: () => void ob.start() }}
          onReintentar={ob.error ? () => void ob.reload() : undefined}
        />
      </div>
    );
  }

  const { progress } = ob.data;
  const completado = ob.data.status === 'completed';
  const owner = (o: string | null) => (o === 'vendor' ? t('owner.vendor') : o === 'cs' ? t('owner.cs') : o || t('owner.ninguno'));
  const completar = async () => {
    if (await ob.complete()) {
      toast({ title: t('completado'), description: t('completadoDetalle') });
      onCompletado?.();
    }
  };

  return (
    <section aria-label={t('titulo')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-fg-secondary">{t('titulo')}</h3>
        <span className="text-xs font-medium text-fg">{t('pasos', { hechos: progress.done, total: progress.total })}</span>
      </div>
      <BarraProgreso valor={progress.pct} etiqueta={t('progresoAria')} tono={completado ? 'exito' : 'marca'} />
      {ob.error && <p role="alert" className="text-xs text-danger-text">{ob.error}</p>}
      <ul className="flex flex-col gap-2">
        {ob.data.steps.map((s) => {
          const control = checklistStepControl({ stepId: s.id, busyStepId: ob.busyStepId, instanceCompleted: completado });
          const id = `onb-${s.id}`;
          const quien = s.is_completed ? nombreUsuario(usuarios, s.completed_by) ?? owner(s.owner) : owner(s.owner);
          const cuando = s.is_completed ? s.completed_at : s.due_date;
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <Checkbox id={id} checked={s.is_completed} disabled={control.disabled} aria-busy={control.busy || undefined} onCheckedChange={() => { if (!control.locked) void ob.toggleStep(s); }} />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate text-sm text-fg">{s.name}</label>
              {control.busy && <Loader2 aria-hidden="true" className="size-4 animate-spin text-fg-muted motion-reduce:animate-none" />}
              <span className="shrink-0 text-xs text-fg-secondary">{[quien, cuando ? fechaCortaInstante(cuando, timezone, idioma) : null].filter(Boolean).join(' · ')}</span>
            </li>
          );
        })}
      </ul>
      {completado ? (
        <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success-text"><CheckCircle2 aria-hidden="true" className="size-4" />{t('completado')}</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">{progress.allDone ? '' : t('habilita', { total: progress.total })}</span>
          <button type="button" disabled={!progress.allDone || ob.busyAction === 'complete'} onClick={() => void completar()} className={clasesBoton({ tamano: 'sm' })}>
            {ob.busyAction === 'complete' ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <CheckCircle2 aria-hidden="true" className="size-4" />}
            {t('completar')}
          </button>
        </div>
      )}
    </section>
  );
}
