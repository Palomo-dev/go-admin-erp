'use client';

import { useId } from 'react';
import { cn } from '@/utils/Utils';
import { SegmentedControl } from './SegmentedControl';
import { useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Franja horaria (Figma `SelectorFranja`, 14 Reportes «Selector de franja»):
 * «Todo el día» o una franja `HH:mm – HH:mm` en la zona de la organización.
 * Si el fin es anterior o igual al inicio, la franja cruza la medianoche
 * («2:00 a. m. (+1)»): lo vendido después de medianoche suma al día en que
 * empezó el turno.
 *
 * Controlado: `valor` null es día completo. Con `deshabilitado`, se muestra el
 * `motivo` (el reporte se calcula por día).
 */
export interface FranjaHoraria {
  desde: string;
  hasta: string;
}

export interface SelectorFranjaProps {
  valor: FranjaHoraria | null;
  onValorChange: (valor: FranjaHoraria | null) => void;
  deshabilitado?: boolean;
  motivo?: string;
  /** Minutos entre opciones (30 por defecto). */
  paso?: 15 | 30 | 60;
  className?: string;
}

const FRANJA_POR_DEFECTO: FranjaHoraria = { desde: '16:00', hasta: '02:00' };

function horas(paso: number): string[] {
  const lista: string[] = [];
  for (let m = 0; m < 24 * 60; m += paso) lista.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return lista;
}

/** ¿La franja termina al día siguiente? */
export function cruzaMedianoche(f: FranjaHoraria): boolean {
  return f.hasta <= f.desde;
}

export function SelectorFranja({ valor, onValorChange, deshabilitado, motivo, paso = 30, className }: SelectorFranjaProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const id = useId();
  const formato = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const rotulo = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return formato.format(new Date(Date.UTC(2000, 0, 1, h, m)));
  };
  const opciones = horas(paso);
  const conOpcion = (lista: string[], v: string) => (lista.includes(v) ? lista : [...lista, v].sort());
  const cruza = valor ? cruzaMedianoche(valor) : false;

  const clasesSelect =
    'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <SegmentedControl
        etiqueta={t('franja.etiqueta')}
        anchoCompleto
        deshabilitado={deshabilitado}
        opciones={[
          { valor: 'dia', etiqueta: t('franja.todoElDia') },
          { valor: 'franja', etiqueta: t('franja.franja') },
        ]}
        valor={valor ? 'franja' : 'dia'}
        onValorChange={(v) => onValorChange(v === 'dia' ? null : (valor ?? FRANJA_POR_DEFECTO))}
      />
      {valor && !deshabilitado && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor={`${id}-desde`} className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
              {t('franja.desde')}
              <select id={`${id}-desde`} className={clasesSelect} value={valor.desde} onChange={(e) => onValorChange({ ...valor, desde: e.target.value })}>
                {conOpcion(opciones, valor.desde).map((h) => (
                  <option key={h} value={h}>
                    {rotulo(h)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-hasta`} className="flex flex-col gap-1.5 text-xs font-semibold text-fg-secondary">
              {t('franja.hasta')}
              <select id={`${id}-hasta`} className={clasesSelect} value={valor.hasta} onChange={(e) => onValorChange({ ...valor, hasta: e.target.value })}>
                {conOpcion(opciones, valor.hasta).map((h) => (
                  <option key={h} value={h}>
                    {h <= valor.desde ? t('franja.diaSiguiente', { hora: rotulo(h) }) : rotulo(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-fg-secondary">
            {cruza
              ? t('franja.ayudaCruza', { desde: rotulo(valor.desde), hasta: rotulo(valor.hasta) })
              : t('franja.ayuda', { desde: rotulo(valor.desde), hasta: rotulo(valor.hasta) })}
          </p>
        </>
      )}
      {deshabilitado && motivo && <p className="text-xs text-fg-secondary">{motivo}</p>}
    </div>
  );
}
