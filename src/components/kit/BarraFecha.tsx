'use client';

import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { DateRangeButton } from './DateRangeButton';
import { etiquetaRango, presetsRango, type IdPresetRango, type RangoFechas } from './rangoFechas';
import { useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Fecha a la vista de una barra de filtros (Figma «05 POS y ventas» 3300-420478 y 3306-209149):
 * «Fecha  [✓ Hoy] [Ayer] [Esta semana] [Este mes] [Rango…]». Los atajos son los del
 * `DateRangeButton` (días calendario de la organización: la pantalla pasa `hoy` con
 * `useFormatDate().getToday()`); «Rango…» abre el mismo calendario y, elegido, muestra el rango.
 *
 * `activo` dice qué chip va marcado: un atajo, `'rango'` o `null` (ninguno: p. ej. «Todo» o un
 * periodo elegido en otro lado).
 */
export interface BarraFechaProps {
  /** Atajos a la vista, en orden. */
  atajos?: readonly IdPresetRango[];
  activo: IdPresetRango | 'rango' | null;
  /** Rango en curso (lo que abre el calendario de «Rango…»). */
  rango: RangoFechas;
  hoy: string;
  onElegir: (id: IdPresetRango | 'rango', rango: RangoFechas) => void;
  /** Muestra la etiqueta «Fecha» delante (en escritorio). */
  conEtiqueta?: boolean;
  className?: string;
}

const CLAVE: Record<IdPresetRango, string> = {
  hoy: 'hoy',
  ayer: 'ayer',
  semana: 'semana',
  '7d': 'dias7',
  '30d': 'dias30',
  mes: 'esteMes',
  mesPasado: 'mesPasado',
};

export const ATAJOS_BARRA: readonly IdPresetRango[] = ['hoy', 'ayer', 'semana', 'mes'];

export function BarraFecha({ atajos = ATAJOS_BARRA, activo, rango, hoy, onElegir, conEtiqueta = true, className }: BarraFechaProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const presets = presetsRango(hoy).filter((p) => atajos.includes(p.id));
  const orden = (id: IdPresetRango) => atajos.indexOf(id);
  presets.sort((a, b) => orden(a.id) - orden(b.id));

  return (
    <div role="group" aria-label={t('rango.fecha')} className={cn('flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]', className)}>
      {conEtiqueta && <span className="mr-1 hidden shrink-0 text-sm text-fg-secondary sm:inline">{t('rango.fecha')}</span>}
      {presets.map((p) => {
        const elegido = activo === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={elegido}
            onClick={() => onElegir(p.id, p.rango)}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              elegido ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
            )}
          >
            {elegido && <Check aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
            {t(`rango.${CLAVE[p.id]}`)}
          </button>
        );
      })}
      <DateRangeButton
        variante="chip"
        activo={activo === 'rango'}
        texto={activo === 'rango' ? etiquetaRango(rango, locale) : t('rango.rangoCorto')}
        valor={rango}
        hoy={hoy}
        etiqueta={t('rango.etiqueta')}
        onValorChange={(r) => onElegir('rango', r)}
      />
    </div>
  );
}
