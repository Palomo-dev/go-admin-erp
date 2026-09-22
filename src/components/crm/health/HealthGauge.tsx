'use client';

import { useReducedMotion } from '@/components/shared/motion';
import type { HealthBand } from '@/lib/services/crm/healthBands';
import { BAND_STYLES } from './healthBandStyles';

/**
 * HealthGauge (F11 §4.2): anillo 0–100 con el número, la banda en texto y su
 * icono. Nunca comunica solo con color. `role="img"` con etiqueta completa
 * para lectores de pantalla; el texto visible queda `aria-hidden` para no
 * duplicar la lectura.
 */
export interface HealthGaugeProps {
  score: number;
  band: HealthBand;
  size?: 'sm' | 'md' | 'lg';
  /** Muestra la banda debajo del anillo (por defecto sí). */
  showLabel?: boolean;
  className?: string;
}

const SIZES = {
  sm: { box: 64, r: 26, stroke: 5, text: 'text-base' },
  md: { box: 88, r: 36, stroke: 6, text: 'text-xl' },
  lg: { box: 112, r: 46, stroke: 7, text: 'text-2xl' },
} as const;

export function HealthGauge({ score, band, size = 'md', showLabel = true, className = '' }: HealthGaugeProps) {
  const reduceMotion = useReducedMotion();
  const s = SIZES[size];
  const style = BAND_STYLES[band];
  const Icon = style.icon;
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const circumference = 2 * Math.PI * s.r;
  const offset = circumference - (value / 100) * circumference;
  const center = s.box / 2;

  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <div
        role="img"
        aria-label={`Salud ${value} de 100, ${style.label}`}
        className="relative shrink-0"
        style={{ width: s.box, height: s.box }}
      >
        <svg width={s.box} height={s.box} viewBox={`0 0 ${s.box} ${s.box}`} className="-rotate-90" aria-hidden="true" focusable="false">
          <circle cx={center} cy={center} r={s.r} fill="none" strokeWidth={s.stroke} className="stroke-gray-200 dark:stroke-gray-700" />
          <circle
            cx={center}
            cy={center}
            r={s.r}
            fill="none"
            strokeWidth={s.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={style.ring}
            style={reduceMotion ? undefined : { transition: 'stroke-dashoffset 300ms ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className={`font-bold tabular-nums ${s.text} ${style.text}`}>{value}</span>
        </div>
      </div>
      {showLabel && (
        <span aria-hidden="true" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>
          <Icon className="h-3 w-3" />
          {style.label}
        </span>
      )}
    </div>
  );
}

export default HealthGauge;
