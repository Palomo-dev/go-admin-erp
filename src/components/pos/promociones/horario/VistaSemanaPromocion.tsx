'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { vistaSemanal } from '@/lib/promotions/horarioPromocion';
import { DIAS_DESDE_LUNES, SEGUNDOS_DIA, type HorarioPromocion } from '@/lib/promotions/vigencia';
import { diasDelIdioma } from '../diasPromocion';

/**
 * Vista previa de la semana (Figma 2693:189260): una barra por día con los
 * tramos en que la promoción está activa. Sale de `vistaSemanal`, el mismo
 * criterio del motor. `madrugadaAparte` pinta en tono claro la madrugada que
 * pertenece al día anterior (modo «Mismo horario cada día»).
 */
interface VistaSemanaPromocionProps {
  horario: HorarioPromocion;
  madrugadaAparte?: boolean;
  /** Rótulo «16:00» / «hasta 14:00» dentro de las barras (escritorio). */
  rotulos?: boolean;
  className?: string;
}

function hhmm(segundos: number): string {
  const s = Math.min(Math.max(segundos, 0), SEGUNDOS_DIA);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function VistaSemanaPromocion({ horario, madrugadaAparte = false, rotulos = true, className }: VistaSemanaPromocionProps) {
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const dias = diasDelIdioma(locale);
  const semana = vistaSemanal(horario);
  const hayMadrugada = madrugadaAparte && semana.some((d) => d.some((s) => s.continua));
  const pct = (segundos: number) => `${(Math.min(segundos, SEGUNDOS_DIA) / SEGUNDOS_DIA) * 100}%`;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium leading-[18px] text-fg">{t('horario.vistaPrevia')}</p>
        <ul className="flex flex-wrap items-center gap-3 text-xs leading-4 text-fg-secondary" aria-hidden="true">
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" />{t('horario.leyendaActiva')}</li>
          {hayMadrugada && (
            <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand/50" />{t('horario.leyendaMadrugada')}</li>
          )}
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-line bg-subtle" />{t('horario.leyendaSin')}</li>
        </ul>
      </div>
      <ul className="flex flex-col gap-1.5" aria-label={t('horario.vistaPrevia')}>
        {dias.map((dia) => {
          const segmentos = semana[DIAS_DESDE_LUNES.indexOf(dia.value)];
          const activo = segmentos.length > 0;
          const descripcion = activo
            ? segmentos.map((s) => `${hhmm(s.desde)}–${hhmm(s.hasta)}`).join(', ')
            : t('horario.leyendaSin');
          return (
            <li key={dia.value} className="grid grid-cols-[2.75rem_1fr] items-center gap-2 sm:grid-cols-[5.5rem_1fr]">
              <span className={cn('text-[13px] leading-[18px]', activo ? 'font-medium text-fg' : 'text-fg-secondary')}>
                <span className="sm:hidden">{dia.corto}</span>
                <span className="hidden sm:inline">{dia.largo}</span>
              </span>
              <span className="relative block h-4 overflow-hidden rounded bg-subtle" role="img" aria-label={`${dia.largo}: ${descripcion}`}>
                {segmentos.map((s, i) => (
                  <span
                    key={i}
                    className={cn(
                      'absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap px-1.5 text-[11px] font-medium leading-none text-white',
                      madrugadaAparte && s.continua ? 'bg-brand/50' : 'bg-brand',
                      s.continua ? 'justify-end' : 'justify-start',
                    )}
                    style={{ left: pct(s.desde), width: pct(s.hasta - s.desde) }}
                  >
                    {rotulos && !madrugadaAparte && (
                      <span className="hidden md:inline">
                        {s.continua ? t('horario.hastaHora', { hora: hhmm(s.hasta) }) : s.hasta - s.desde >= 3 * 3600 ? hhmm(s.desde) : ''}
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-[2.75rem_1fr] gap-2 sm:grid-cols-[5.5rem_1fr]" aria-hidden="true">
        <span />
        <div className="flex justify-between text-xs tabular-nums leading-4 text-fg-muted">
          <span>0:00</span>
          <span className="hidden sm:inline">6:00</span>
          <span>12:00</span>
          <span className="hidden sm:inline">18:00</span>
          <span>24:00</span>
        </div>
      </div>
    </div>
  );
}
