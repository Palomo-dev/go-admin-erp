'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  diasDeSemana,
  etiquetaDiaCompleta,
  fueraDeLimites,
  grillaMes,
  mesDe,
  mesFueraDeLimites,
  moverFoco,
  nombreMes,
  primerDiaDeSemana,
  sumarMeses,
  sumarMesesDia,
  acotarDia,
} from './calendarioLogica';
import { useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Panel de calendario de marca (Figma `DateRange` 104:3343 › «Calendario»
 * 104:3219): cabecera del mes con flechas, iniciales de la semana y grilla de
 * 6 semanas de 42 × 32 px. El día elegido (o los extremos de un rango) va en
 * Azul acción con radio 8; el tramo de un rango, en Tinte GO.
 *
 * Días calendario puros (`YYYY-MM-DD`). Idioma y primer día de la semana
 * salen del idioma activo de next-intl (lunes en español y francés, domingo en
 * inglés y portugués). Teclado: flechas, Inicio/Fin, RePág/AvPág (con Mayús,
 * un año), Enter/Espacio eligen.
 */
export interface CalendarioMesProps {
  /** Día elegido (modo de un día). */
  valor?: string | null;
  /** Rango resaltado (modo rango): extremos en Azul acción, tramo en Tinte GO. */
  rango?: { desde: string; hasta: string } | null;
  /** Día que recibe el foco al abrir (y define el mes visible). */
  diaInicial: string;
  onElegir: (dia: string) => void;
  /** Día por el que pasa el puntero o el foco (vista previa de un rango). */
  onDiaActivo?: (dia: string) => void;
  min?: string | null;
  max?: string | null;
  /** «Hoy» en la zona de la organización: se marca en la grilla. */
  hoy?: string | null;
  /** Enfoca el día activo al montar (al abrir el popover). */
  enfocarAlMontar?: boolean;
  className?: string;
}

export function CalendarioMes({
  valor,
  rango,
  diaInicial,
  onElegir,
  onDiaActivo,
  min,
  max,
  hoy,
  enfocarAlMontar,
  className,
}: CalendarioMesProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const primerDia = primerDiaDeSemana(locale);
  const [foco, setFoco] = React.useState(() => acotarDia(diaInicial, min, max));
  const mes = mesDe(foco);
  const grilla = React.useMemo(() => grillaMes(mes, primerDia), [mes, primerDia]);
  const cabecera = React.useMemo(() => diasDeSemana(locale, primerDia), [locale, primerDia]);
  const refGrilla = React.useRef<HTMLDivElement>(null);
  const moverFocoDom = React.useRef(false);
  const idTitulo = React.useId();

  React.useEffect(() => {
    if (!enfocarAlMontar) return;
    refGrilla.current?.querySelector<HTMLButtonElement>('[data-foco="true"]')?.focus();
    // Solo al montar: el foco inicial del popover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!moverFocoDom.current) return;
    moverFocoDom.current = false;
    refGrilla.current?.querySelector<HTMLButtonElement>('[data-foco="true"]')?.focus();
  }, [foco]);

  const irA = (dia: string, enfocar: boolean) => {
    moverFocoDom.current = enfocar;
    setFoco(dia);
    onDiaActivo?.(dia);
  };

  const anteriorBloqueado = mesFueraDeLimites(sumarMeses(mes, -1), min, max);
  const siguienteBloqueado = mesFueraDeLimites(sumarMeses(mes, 1), min, max);

  const semanas: (typeof grilla)[] = [];
  for (let i = 0; i < grilla.length; i += 7) semanas.push(grilla.slice(i, i + 7));

  const BOTON_MES =
    'inline-flex size-8 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-40';

  return (
    <div className={cn('flex w-[294px] flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={BOTON_MES}
          aria-label={t('calendario.mesAnterior')}
          disabled={anteriorBloqueado}
          onClick={() => irA(sumarMesesDia(foco, -1), false)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
        <p id={idTitulo} aria-live="polite" className="text-sm font-medium text-fg">
          {nombreMes(mes, locale)}
        </p>
        <button
          type="button"
          className={BOTON_MES}
          aria-label={t('calendario.mesSiguiente')}
          disabled={siguienteBloqueado}
          onClick={() => irA(sumarMesesDia(foco, 1), false)}
        >
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      <div ref={refGrilla} role="grid" aria-labelledby={idTitulo} className="flex flex-col gap-0.5">
        <div role="row" className="flex">
          {cabecera.map((d) => (
            <span
              key={d.largo}
              role="columnheader"
              aria-label={d.largo}
              className="flex h-6 w-[42px] items-center justify-center text-xs font-medium text-fg-muted"
            >
              <abbr title={d.largo} className="no-underline">
                {d.corto}
              </abbr>
            </span>
          ))}
        </div>
        {semanas.map((semana) => (
          <div key={semana[0].dia} role="row" className="flex">
            {semana.map((celda) => {
              const bloqueado = fueraDeLimites(celda.dia, min, max);
              const esExtremo = rango ? celda.dia === rango.desde || celda.dia === rango.hasta : celda.dia === valor;
              const enTramo = Boolean(rango && celda.dia > rango.desde && celda.dia < rango.hasta);
              const esHoy = celda.dia === hoy;
              const conFoco = celda.dia === foco;
              return (
                <div key={celda.dia} role="gridcell" aria-selected={esExtremo || enTramo} className="flex">
                  <button
                    type="button"
                    tabIndex={conFoco ? 0 : -1}
                    data-foco={conFoco ? 'true' : undefined}
                    data-dia={celda.dia}
                    aria-label={etiquetaDiaCompleta(celda.dia, locale)}
                    aria-current={esHoy ? 'date' : undefined}
                    aria-disabled={bloqueado || undefined}
                    onClick={() => {
                      if (bloqueado) return;
                      setFoco(celda.dia);
                      onElegir(celda.dia);
                    }}
                    onMouseEnter={() => {
                      if (!bloqueado) onDiaActivo?.(celda.dia);
                    }}
                    onKeyDown={(e) => {
                      const destino = moverFoco(celda.dia, e.key, primerDia, e.shiftKey);
                      if (!destino) return;
                      e.preventDefault();
                      irA(acotarDia(destino, min, max), true);
                    }}
                    className={cn(
                      'flex h-8 w-[42px] items-center justify-center text-[13px] leading-[18px] tabular-nums transition-colors',
                      'focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      esExtremo
                        ? 'rounded-lg bg-brand-action font-medium text-fg-on-brand hover:bg-brand-action-hover'
                        : enTramo
                          ? 'bg-brand-tint text-brand-deep hover:bg-brand-tint-hover'
                          : cn(
                              'rounded-lg hover:bg-hover',
                              celda.delMes ? 'text-fg' : 'text-fg-muted',
                              esHoy && 'font-semibold text-brand-deep underline decoration-brand underline-offset-4',
                            ),
                      bloqueado && 'cursor-not-allowed text-fg-muted opacity-40 hover:bg-transparent',
                    )}
                  >
                    {celda.numero}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
