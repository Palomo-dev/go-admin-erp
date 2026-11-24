/**
 * Miniatura de una serie real (Figma `463:15529` «Miniatura (serie real)»):
 * área y línea en 44 px de alto, sin ejes. El trazo lo calcula
 * `trazoMiniatura` (regla pura). Decorativa: la cifra y su variación ya
 * están en texto al lado.
 */
import { trazoMiniatura } from '@/lib/dashboard/serieInicio';
import { cn } from '@/utils/Utils';

const ANCHO = 320;
const ALTO = 44;

export type TonoMiniatura = 'marca' | 'advertencia' | 'exito';

const COLOR: Record<TonoMiniatura, string> = {
  marca: 'var(--go-brand-primary, #4361ee)',
  advertencia: 'var(--go-state-warning, #f59e0b)',
  exito: 'var(--go-state-success, #16a34a)',
};

/**
 * `className` cambia el alto (p. ej. `h-6` dentro de una tarjeta de cifra del inicio, Figma
 * 2917:45560 «Ocupación»); por defecto 44 px.
 */
export function MiniaturaSerie({ valores, tono = 'marca', className }: { valores: readonly number[]; tono?: TonoMiniatura; className?: string }) {
  const trazo = trazoMiniatura(valores, ANCHO, ALTO);
  if (!trazo) return null;
  const color = COLOR[tono];
  return (
    <svg
      aria-hidden="true"
      data-miniatura={tono}
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      className={cn('h-11 w-full overflow-visible', className)}
    >
      <path d={trazo.area} fill={color} fillOpacity={0.15} stroke="none" />
      <path d={trazo.linea} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
