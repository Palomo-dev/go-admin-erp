'use client';

/**
 * Periodo del centro de reportes (Figma 14 Reportes, botón «Septiembre 2026 ·
 * Día completo» y «Selector de franja» móvil): tipo de periodo, anterior y
 * siguiente, rango libre y franja horaria. El periodo siguiente nunca empieza
 * después de hoy (día de la organización).
 */
import { useCallback, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CampoFecha, ChipsOpcion, SelectorFranja, clasesBoton, cruzaMedianoche } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/Utils';
import { TIPOS_CIERRE, periodoAnterior, periodoSiguiente, resolverPeriodo } from '@/lib/services/reportes/periodosService';
import type { PeriodoCierre, TipoCierre } from '@/lib/services/reportes/types';
import { etiquetaDePeriodo, etiquetaFranja } from './etiquetaPeriodo';

/** Rótulo del periodo en el idioma de la persona («Septiembre de 2026», «T3 2026»). */
export function useEtiquetaPeriodo() {
  const t = useTranslations('reportes.periodo');
  const locale = useLocaleIntl();
  const periodo = useCallback((p: Pick<PeriodoCierre, 'tipo' | 'fechaInicio' | 'fechaFin'>) => etiquetaDePeriodo(p, locale, (c, v) => t(c, v)), [locale, t]);
  const franja = useCallback((p: Pick<PeriodoCierre, 'horaInicio' | 'horaFin'>) => etiquetaFranja(p, locale), [locale]);
  /** «Septiembre de 2026 · 4:00 p. m. – 2:00 a. m.» o «… · Día completo». */
  const completa = useCallback((p: PeriodoCierre) => `${periodo(p)} · ${franja(p) ?? t('diaCompleto')}`, [franja, periodo, t]);
  return { periodo, franja, completa };
}

export interface SelectorPeriodoProps {
  periodo: PeriodoCierre;
  onPeriodoChange: (p: PeriodoCierre) => void;
  /** Hoy en la zona de la organización (`YYYY-MM-DD`). */
  hoy: string;
  /** `si`: se elige franja; `noAplica`: el reporte se calcula por día; `oculta`: ni se menciona. */
  franja?: 'si' | 'noAplica' | 'oculta';
  tipos?: readonly TipoCierre[];
  /** `false` cuando los tipos se eligen fuera (el diálogo de cierre). */
  mostrarTipos?: boolean;
  anchoCompleto?: boolean;
  deshabilitado?: boolean;
  className?: string;
}

export function SelectorPeriodo({ periodo, onPeriodoChange, hoy, franja = 'si', tipos = TIPOS_CIERRE, mostrarTipos = true, anchoCompleto, deshabilitado, className }: SelectorPeriodoProps) {
  const t = useTranslations('reportes.periodo');
  const tTipo = useTranslations('reportes.tipos');
  const etiqueta = useEtiquetaPeriodo();
  const [abierto, setAbierto] = useState(false);

  const conFranja = franja === 'si' && periodo.horaInicio && periodo.horaFin ? { desde: periodo.horaInicio, hasta: periodo.horaFin } : null;
  const franjaDe = (p: PeriodoCierre): PeriodoCierre => ({ ...p, horaInicio: periodo.horaInicio ?? null, horaFin: periodo.horaFin ?? null });
  const anterior = periodo.tipo === 'personalizado' ? null : periodoAnterior(periodo);
  const siguiente = periodo.tipo === 'personalizado' ? null : periodoSiguiente(periodo, hoy);
  const referencia = periodo.fechaFin < hoy ? periodo.fechaFin : hoy;

  const elegirTipo = (tipo: TipoCierre) => {
    if (tipo === 'personalizado') onPeriodoChange(franjaDe(resolverPeriodo('personalizado', hoy, { from: periodo.fechaInicio, to: periodo.fechaFin < hoy ? periodo.fechaFin : hoy })));
    else onPeriodoChange(franjaDe(resolverPeriodo(tipo, referencia)));
  };

  const textoFranja = franja === 'oculta' ? null : franja === 'noAplica' ? t('diaCompleto') : (etiqueta.franja(periodo) ?? t('diaCompleto'));

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        disabled={deshabilitado}
        aria-label={t('cambiar', { periodo: etiqueta.periodo(periodo) })}
        className={cn(
          'inline-flex h-10 min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg',
          'hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
          anchoCompleto && 'w-full',
          className,
        )}
      >
        <Clock aria-hidden className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        <span className="truncate font-semibold">{etiqueta.periodo(periodo)}</span>
        {textoFranja && (
          <span className="truncate text-fg-secondary">
            <span aria-hidden> · </span>
            {textoFranja}
          </span>
        )}
        {conFranja && cruzaMedianoche(conFranja) && (
          <span className="shrink-0 rounded-full bg-info-subtle px-2 py-0.5 text-xs font-semibold text-info-text">{t('masUnDia')}</span>
        )}
        <ChevronDown aria-hidden className="ml-auto size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,420px)] p-4">
        <div className="flex flex-col gap-4">
          {mostrarTipos && (
            <div className="flex flex-col gap-2">
              <p id="periodo-tipo" className="text-xs font-semibold text-fg-secondary">
                {t('tipo')}
              </p>
              <ChipsOpcion<TipoCierre>
                aria-labelledby="periodo-tipo"
                opciones={tipos.map((v) => ({ valor: v, etiqueta: tTipo(v) }))}
                valor={periodo.tipo}
                onValorChange={elegirTipo}
              />
            </div>
          )}

          {periodo.tipo === 'personalizado' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
                {t('desde')}
                <CampoFecha
                  valor={periodo.fechaInicio}
                  max={periodo.fechaFin}
                  hoy={hoy}
                  limpiable={false}
                  onValorChange={(d) => d && onPeriodoChange(franjaDe(resolverPeriodo('personalizado', hoy, { from: d, to: periodo.fechaFin })))}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
                {t('hasta')}
                <CampoFecha
                  valor={periodo.fechaFin}
                  min={periodo.fechaInicio}
                  max={hoy}
                  hoy={hoy}
                  limpiable={false}
                  onValorChange={(d) => d && onPeriodoChange(franjaDe(resolverPeriodo('personalizado', hoy, { from: periodo.fechaInicio, to: d })))}
                />
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-9 px-0' })}
                onClick={() => anterior && onPeriodoChange(anterior)}
                aria-label={t('anterior')}
              >
                <ChevronLeft aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
              <p className="flex-1 text-center text-sm font-semibold text-fg" aria-live="polite">
                {etiqueta.periodo(periodo)}
              </p>
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-9 px-0' })}
                onClick={() => siguiente && onPeriodoChange(siguiente)}
                disabled={!siguiente}
                aria-label={t('siguiente')}
                title={siguiente ? undefined : t('sinSiguiente')}
              >
                <ChevronRight aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          )}

          {franja !== 'oculta' && (
            <SelectorFranja
              valor={conFranja}
              deshabilitado={franja === 'noAplica'}
              motivo={t('franjaNoAplica')}
              onValorChange={(v) => onPeriodoChange({ ...periodo, horaInicio: v?.desde ?? null, horaFin: v?.hasta ?? null })}
            />
          )}

          <div className="flex justify-end">
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={() => setAbierto(false)}>
              {t('listo')}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
