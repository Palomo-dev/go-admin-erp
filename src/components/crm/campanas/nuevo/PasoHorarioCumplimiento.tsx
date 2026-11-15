'use client';

/**
 * Paso 3 · Horario y cumplimiento (Figma CRM 1402:821).
 *
 * Izquierda: el horario legal (Ley 2300 de 2023, fijo por ley) y, dentro de
 * esa ventana, cuándo sale la campaña. Derecha: «Requisitos para activar», en
 * rojo lo que falta y en verde lo que está bien. Se puede guardar como
 * borrador sin cumplirlos; activar no (lo dice el aviso de abajo).
 *
 * «Calcular audiencia» guarda el borrador y materializa los destinatarios con
 * `CampanasService.materialize`: exclusiones reales (RNE, «no volver a
 * contactar», sin consentimiento, duplicados) contadas por el servidor.
 */
import { useTranslations } from 'next-intl';
import { CircleCheck, CircleX, Clock, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Checkbox } from '@/components/ui/checkbox';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import type { MaterializeResult } from '@/components/crm/whatsapp/api';
import { requisitosEnRojo, type Requisito } from './asistenteCampanaLogica';

const HORARIO_LEGAL = ['semana', 'sabado', 'festivos'] as const;

export function PasoHorarioCumplimiento(p: {
  cuando: 'ahora' | 'programar';
  onCuando: (v: 'ahora' | 'programar') => void;
  fechaLocal: string;
  onFechaLocal: (v: string) => void;
  respetarHorario: boolean;
  onRespetarHorario: (v: boolean) => void;
  requisitos: readonly Requisito[];
  marketing: boolean;
  consentimiento: boolean;
  onConsentimiento: (v: boolean) => void;
  materializado: MaterializeResult | null;
  calculando: boolean;
  onCalcular: () => void;
}) {
  const t = useTranslations('crm.campanasAsistente');
  const entero = useFormatoEntero();
  const enRojo = requisitosEnRojo(p.requisitos);

  const detalle = (r: Requisito): React.ReactNode => {
    if (r.clave === 'audiencia') {
      if (!p.materializado) return t('horario.requisitos.audiencia.sinCalcular');
      return t('horario.requisitos.audiencia.calculada', { pendientes: entero(p.materializado.pending), excluidos: entero(p.materializado.skipped) });
    }
    return t(`horario.requisitos.${r.clave}.${r.ok ? 'ok' : 'falta'}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="campana-horario-legal">
          <div className="flex items-center gap-2">
            <Clock aria-hidden="true" className="size-5 shrink-0 text-brand" strokeWidth={1.5} />
            <h2 id="campana-horario-legal" className="min-w-0 flex-1 text-base font-semibold text-fg">
              {t('horario.legalTitulo')}
            </h2>
            <span className="shrink-0 rounded-full border border-line-info bg-info-subtle px-2 py-0.5 text-xs font-medium text-info-text">{t('horario.fijoPorLey')}</span>
          </div>
          <dl className="space-y-2">
            {HORARIO_LEGAL.map((k) => (
              <div key={k} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-fg">{t(`horario.franjas.${k}.dias`)}</dt>
                <dd className="text-right font-medium text-fg">{t(`horario.franjas.${k}.horas`)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('horario.notaLey')}</p>

          <FormField etiqueta={t('horario.dentroDeVentana')}>
            {(campo) => (
              <div className="space-y-2">
                <SegmentedControl<'ahora' | 'programar'>
                  aria-labelledby={campo.idEtiqueta}
                  valor={p.cuando}
                  onValorChange={p.onCuando}
                  opciones={[
                    { valor: 'ahora', etiqueta: t('horario.ahora') },
                    { valor: 'programar', etiqueta: t('horario.programar') },
                  ]}
                />
                {p.cuando === 'programar' && (
                  <input
                    id={campo.id}
                    type="datetime-local"
                    className={CLASE_CAMPO}
                    value={p.fechaLocal}
                    onChange={(e) => p.onFechaLocal(e.target.value)}
                    aria-label={t('horario.fechaHora')}
                  />
                )}
              </div>
            )}
          </FormField>
          <label className="flex items-start gap-2 text-[13px] leading-[18px] text-fg">
            <Checkbox className="mt-0.5" checked={p.respetarHorario} onCheckedChange={(v) => p.onRespetarHorario(v === true)} />
            <span>{t('horario.respetarHorario')}</span>
          </label>
        </section>

        <section className="space-y-3 rounded-xl border border-line bg-surface p-4" aria-labelledby="campana-requisitos">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-5 shrink-0 text-brand" strokeWidth={1.5} />
            <h2 id="campana-requisitos" className="min-w-0 flex-1 text-base font-semibold text-fg">
              {t('horario.requisitosTitulo')}
            </h2>
          </div>
          <ul className="space-y-2.5">
            {p.requisitos.map((r) => {
              const Icono = r.ok ? CircleCheck : CircleX;
              return (
                <li
                  key={r.clave}
                  className={cn('space-y-2 rounded-lg border p-3', r.ok ? 'border-line-success bg-success-subtle' : 'border-line-danger bg-danger-subtle')}
                >
                  <p className={cn('flex items-center gap-2 text-sm font-medium', r.ok ? 'text-success-text' : 'text-danger-text')}>
                    <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
                    {t(`horario.requisitos.${r.clave}.titulo`)}
                    <span className="sr-only">{r.ok ? t('horario.cumplido') : t('horario.pendiente')}</span>
                  </p>
                  <p className="text-xs leading-4 text-fg-secondary">{detalle(r)}</p>
                  {r.clave === 'consentimiento' && p.marketing && (
                    <label className="flex items-start gap-2 text-xs font-medium text-fg">
                      <Checkbox className="mt-0.5" checked={p.consentimiento} onCheckedChange={(v) => p.onConsentimiento(v === true)} />
                      <span>{t('horario.requisitos.consentimiento.casilla')}</span>
                    </label>
                  )}
                  {r.clave === 'audiencia' && (
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={p.onCalcular} disabled={p.calculando}>
                      {p.calculando && <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={1.5} />}
                      {p.materializado ? t('horario.recalcular') : t('horario.calcular')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {enRojo > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2 text-[13px] leading-[18px] text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t('horario.avisoRojo', { n: enRojo })}
        </p>
      )}
    </div>
  );
}
