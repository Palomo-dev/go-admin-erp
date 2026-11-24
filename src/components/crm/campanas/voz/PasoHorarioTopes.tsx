'use client';

import { Check, RefreshCw, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/kit/FormField';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import {
  DIAS_SEMANA,
  INTENTOS_DIA_CLIENTE,
  LIMITES_TOPES,
  VENTANA_LEGAL,
  franjaSabado,
  horasDesde,
  horasHasta,
  type ErrorPaso,
  type FormAsistente,
} from './asistenteVozLogica';
import type { AgenteVoz } from './useDatosAsistenteVoz';

/** Eje del gráfico: de 6:00 a 20:00. */
const EJE = { desde: 6, hasta: 20 } as const;
const MARCAS = [6, 9, 12, 15, 18];
const pct = (h: number) => `${((h - EJE.desde) / (EJE.hasta - EJE.desde)) * 100}%`;

/** Paso 4 · Horario y topes (Figma 1682:130990). La franja solo puede estrechar la ventana legal. */
export function PasoHorarioTopes({
  form,
  cambiar,
  errores,
  agente,
}: {
  form: FormAsistente;
  cambiar: (p: Partial<FormAsistente>) => void;
  errores: ErrorPaso[];
  agente: AgenteVoz | null;
}) {
  const t = useTranslations('crm.campanaVozAsistente.horario');
  const hora = (h: number) => t('hora', { h });
  const sab = franjaSabado(form.desde, form.hasta);

  const alternarDia = (d: number) =>
    cambiar({ dias: form.dias.includes(d) ? form.dias.filter((x) => x !== d) : [...form.dias, d].sort((a, b) => a - b) });

  const numero = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold leading-6 text-fg">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success-text" strokeWidth={1.5} />
          {t('ventana.titulo')}
        </h2>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('ventana.texto')}</p>
        <div className="flex flex-col gap-1.5 overflow-x-auto">
          <div className="relative ml-12 h-4 min-w-[280px] text-xs text-fg-muted" aria-hidden="true">
            {MARCAS.map((m) => (
              <span key={m} className="absolute -translate-x-1/2" style={{ left: pct(m) }}>
                {`${m}:00`}
              </span>
            ))}
          </div>
          <ul className="flex flex-col gap-2">
            {DIAS_SEMANA.map((d) => {
              const legal = d === 0 ? null : d === 6 ? VENTANA_LEGAL.sabado : VENTANA_LEGAL.semana;
              const propia = !form.dias.includes(d) || d === 0 ? null : d === 6 ? sab : { desde: form.desde, hasta: form.hasta };
              const textoLegal = legal ? `${hora(legal.desde)}–${hora(legal.hasta)}` : t('ventana.cerrado');
              const textoPropia = propia ? `${hora(propia.desde)}–${hora(propia.hasta)}` : t('ventana.cerrado');
              return (
                <li
                  key={d}
                  className="flex items-center gap-2"
                  aria-label={t('ventana.aria', { dia: t(`diasLargos.${d}`), legal: textoLegal, campana: textoPropia })}
                >
                  <span aria-hidden="true" className="w-10 shrink-0 text-[13px] text-fg">
                    {t(`diasCortos.${d}`)}
                  </span>
                  <div aria-hidden="true" className="relative h-3 min-w-[280px] flex-1 rounded-full bg-subtle">
                    {legal && <span className="absolute inset-y-0 rounded-full bg-success-subtle" style={{ left: pct(legal.desde), width: `calc(${pct(legal.hasta)} - ${pct(legal.desde)})` }} />}
                    {propia && (
                      <span className="absolute inset-y-0.5 rounded-full bg-brand-action" style={{ left: pct(propia.desde), width: `calc(${pct(propia.hasta)} - ${pct(propia.desde)})` }} />
                    )}
                    {!legal && <span className="absolute inset-y-0 left-2 flex items-center text-[11px] leading-none text-fg-muted">{t('ventana.noSeLlama')}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <div aria-hidden="true" className="flex flex-wrap gap-4 pt-1 text-xs text-fg-secondary">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-success-subtle" />
              {t('ventana.leyendaLegal')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-brand-action" />
              {t('ventana.leyendaCampana')}
            </span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium leading-[18px] text-fg">{t('franja')}</h2>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div role="group" aria-label={t('diasAria')} className="flex flex-wrap gap-1.5">
              {DIAS_SEMANA.map((d) => {
                const domingo = d === 0;
                const on = !domingo && form.dias.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={domingo ? t('domingoNo') : t(`diasLargos.${d}`)}
                    title={domingo ? t('domingoNo') : undefined}
                    disabled={domingo}
                    onClick={() => alternarDia(d)}
                    className={cn(
                      'flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
                      on ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
                    )}
                  >
                    {on && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                    {t(`diasLetra.${d}`)}
                  </button>
                );
              })}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-2">
              <SelectCrm
                aria-label={t('desdeAria')}
                valor={String(form.desde)}
                opciones={horasDesde().map((h) => ({ valor: String(h), etiqueta: t('desde', { hora: hora(h) }) }))}
                onValorChange={(v) => {
                  const desde = Number(v);
                  cambiar({ desde, hasta: Math.max(form.hasta, desde + 1) });
                }}
              />
              <SelectCrm
                aria-label={t('hastaAria')}
                valor={String(form.hasta)}
                opciones={horasHasta(form.desde).map((h) => {
                  const s = franjaSabado(form.desde, h);
                  return {
                    valor: String(h),
                    etiqueta:
                      form.dias.includes(6) && s && s.hasta !== h
                        ? t('hastaSabado', { hora: hora(h), sabado: hora(s.hasta) })
                        : t('hasta', { hora: hora(h) }),
                  };
                })}
                onValorChange={(v) => cambiar({ hasta: Number(v) })}
              />
            </div>
          </div>
          {(errores.includes('dias') || errores.includes('franja')) && (
            <p role="alert" className="text-xs text-danger-text">
              {errores.includes('dias') ? t('errores.dias') : t('errores.franja')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium leading-[18px] text-fg">{t('topes')}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField etiqueta={t('porDia')} error={errores.includes('porDia') ? t('errores.porDia') : null}>
              <Input
                type="number"
                inputMode="numeric"
                min={LIMITES_TOPES.porDia.min}
                max={LIMITES_TOPES.porDia.max}
                className="text-right tabular-nums"
                value={Number.isNaN(form.porDia) ? '' : form.porDia}
                onChange={(e) => cambiar({ porDia: numero(e.target.value) })}
              />
            </FormField>
            <FormField etiqueta={t('porHora')} error={errores.includes('porHora') ? t('errores.porHora') : null}>
              <Input
                type="number"
                inputMode="numeric"
                min={LIMITES_TOPES.porHora.min}
                max={LIMITES_TOPES.porHora.max}
                className="text-right tabular-nums"
                value={Number.isNaN(form.porHora) ? '' : form.porHora}
                onChange={(e) => cambiar({ porHora: numero(e.target.value) })}
              />
            </FormField>
            <FormField etiqueta={t('simultaneas')} error={errores.includes('simultaneas') ? t('errores.simultaneas') : null}>
              <Input
                type="number"
                inputMode="numeric"
                min={LIMITES_TOPES.simultaneas.min}
                max={LIMITES_TOPES.simultaneas.max}
                className="text-right tabular-nums"
                value={Number.isNaN(form.simultaneas) ? '' : form.simultaneas}
                onChange={(e) => cambiar({ simultaneas: numero(e.target.value) })}
              />
            </FormField>
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-subtle p-3 text-[13px] leading-[18px] text-fg-secondary">
            <RefreshCw aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {agente && agente.max_calls_per_day && agente.max_calls_per_hour
              ? t('reintentos', { n: INTENTOS_DIA_CLIENTE, dia: agente.max_calls_per_day, hora: agente.max_calls_per_hour })
              : t('reintentosSinAgente', { n: INTENTOS_DIA_CLIENTE })}
          </p>
        </div>
      </section>
    </div>
  );
}
