import type { ReactNode } from 'react';
import type { HealthBand } from '@/lib/services/crm/healthBands';
import { cn } from '@/utils/Utils';
import { BAND_STYLES } from './healthBandStyles';

/**
 * Anillo del puntaje (Figma: «Ellipse» de 28 px en la fila 1415:984 y de
 * 140 px en el detalle 1424:807): solo el arco del puntaje, sin pista.
 * Decorativo: el número y la banda van siempre en texto al lado.
 */
export function AnilloPuntaje({ score, band, tamano, children, className }: { score: number; band: HealthBand; tamano: number; children?: ReactNode; className?: string }) {
  const grosor = tamano >= 80 ? 10 : 4;
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const lleno = Math.max(0, Math.min(100, score)) / 100;
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} aria-hidden="true" className="-rotate-90">
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={r}
          fill="none"
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={`${c * lleno} ${c}`}
          className={BAND_STYLES[band].ring}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}
