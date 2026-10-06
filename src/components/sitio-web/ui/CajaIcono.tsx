import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesTonoTarjeta, type TonoTarjeta } from '@/components/kit/tonosKit';
import { CAJA_ICONO, TRAZO_ICONO, type TamanoCajaIcono } from './iconosSitio';

/**
 * Caja de icono con tinte (Manual v2.0 §5: «el icono de cada subpágina va en
 * caja 40×40 con tinte»). `md` 40 px con icono de 20 (tarjetas de tarea,
 * alertas, Ventas en línea); `sm` 32 px con icono de 16 (checklist, filas
 * densas). El tono acompaña al dato: `neutro` = marca (tinte azul); `apagado`
 * = gris real, el mismo de un StatusBadge neutro («Guardado en borrador»), para
 * que caja y píldora digan lo mismo; los demás, su color funcional. Los tonos
 * salen de `tonosKit`, los mismos de `Tarjeta`.
 * Siempre decorativa: el texto de al lado dice lo mismo.
 */
/** Tonos de la caja: los de `Tarjeta` más `apagado` (gris neutro, no marca). */
export type TonoCajaIcono = TonoTarjeta | 'apagado';

const CLASE_APAGADO = 'bg-subtle text-fg-secondary';

export interface CajaIconoProps {
  icono: LucideIcon;
  tamano?: TamanoCajaIcono;
  tono?: TonoCajaIcono;
  /** Gira el icono (p. ej. «Guardando…»); se detiene con movimiento reducido. */
  girando?: boolean;
  className?: string;
}

export function CajaIcono({ icono: Icono, tamano = 'md', tono = 'neutro', girando, className }: CajaIconoProps) {
  const t = CAJA_ICONO[tamano];
  return (
    <span
      aria-hidden="true"
      data-tamano={tamano}
      className={cn('inline-flex shrink-0 items-center justify-center', t.caja, tono === 'apagado' ? CLASE_APAGADO : clasesTonoTarjeta(tono).icono, className)}
    >
      <Icono className={cn(t.icono, girando && 'animate-spin motion-reduce:animate-none')} strokeWidth={TRAZO_ICONO} />
    </span>
  );
}
