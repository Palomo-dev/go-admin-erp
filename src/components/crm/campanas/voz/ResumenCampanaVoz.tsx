'use client';

import { Check } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { PASOS_ASISTENTE, type PasoAsistente } from './asistenteVozLogica';

export interface FilaResumen {
  clave: 'objetivo' | 'audiencia' | 'agente' | 'horario' | 'topes' | 'cumplimiento';
  /** Paso del asistente donde se decide. */
  paso: Exclude<PasoAsistente, 'revision'>;
  /** Valor ya decidido (se muestra con ✓). `null` = aún pendiente. */
  valor: string | null;
}

/**
 * Tarjeta «Resumen» del asistente (Figma 1680:859620 … 1683:136171): cada fila
 * dice «En este paso», «Pendiente» o el valor decidido con ✓, y al pie los
 * minutos estimados contra los disponibles de la organización.
 */
export function ResumenCampanaVoz({
  actual,
  filas,
  estimado,
  disponibles,
  pie,
}: {
  actual: PasoAsistente;
  filas: FilaResumen[];
  estimado: number | null;
  disponibles: number | null;
  pie: string;
}) {
  const t = useTranslations('crm.campanaVozAsistente.resumen');
  const formato = useFormatter();
  const indiceActual = PASOS_ASISTENTE.indexOf(actual);
  return (
    <section aria-labelledby="resumen-campana-voz" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <h2 id="resumen-campana-voz" className="text-base font-semibold leading-6 text-fg">
        {t('titulo')}
      </h2>
      <dl className="flex flex-col gap-2.5">
        {filas.map((f) => {
          const i = PASOS_ASISTENTE.indexOf(f.paso);
          const enEste = i === indiceActual;
          const listo = !enEste && i < indiceActual && f.valor;
          return (
            <div key={f.clave} className="flex items-baseline justify-between gap-3 text-[13px] leading-[18px]">
              <dt className="shrink-0 text-fg-secondary">{t(`filas.${f.clave}`)}</dt>
              <dd className="flex min-w-0 items-center gap-1 text-right text-fg">
                {listo ? (
                  <>
                    <Check aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
                    <span className="truncate">{f.valor}</span>
                  </>
                ) : (
                  <span className="truncate">{enEste ? t('enEstePaso') : t('pendiente')}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3">
        <div className="flex items-baseline justify-between gap-2 text-[13px] leading-[18px]">
          <span className="text-fg-secondary">{t('minutos.titulo')}</span>
          <span className="font-medium tabular-nums text-fg">
            {estimado !== null && disponibles !== null
              ? t('minutos.valor', { estimado: formato.number(estimado), disponibles: formato.number(disponibles) })
              : t('minutos.sinDato')}
          </span>
        </div>
        {estimado !== null && disponibles !== null && disponibles > 0 && (
          <BarraProgreso valor={Math.min(estimado, disponibles)} max={disponibles} etiqueta={t('minutos.titulo')} />
        )}
        <p className="text-xs leading-4 text-fg-muted">{pie}</p>
      </div>
    </section>
  );
}
