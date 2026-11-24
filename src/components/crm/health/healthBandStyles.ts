import { AlertTriangle, CheckCircle2, CircleDot, type LucideIcon } from 'lucide-react';
import type { HealthBand } from '@/lib/services/crm/healthBands';
import { bandLabel } from '@/lib/services/crm/healthBands';

/**
 * Estilos por banda (F11) con los tokens del sistema (sin `dark:`: los tokens
 * ya cambian con el tema). La banda SIEMPRE se comunica con icono + texto
 * (`bandLabel`), nunca solo con color. Los usan la ficha del cliente
 * (`ClientHealthCard` y sus piezas) y la pantalla de Salud.
 */
export interface BandStyle {
  label: string;
  text: string;
  ring: string;
  badge: string;
  bar: string;
  /** Fondo suave (círculo del puntaje en la lista). */
  soft: string;
  icon: LucideIcon;
}

export const BAND_STYLES: Record<HealthBand, BandStyle> = {
  green: {
    label: bandLabel('green'),
    text: 'text-success-text',
    ring: 'stroke-success',
    badge: 'bg-success-subtle text-success-text border-line-success',
    bar: 'bg-success',
    soft: 'bg-success-subtle',
    icon: CheckCircle2,
  },
  yellow: {
    label: bandLabel('yellow'),
    text: 'text-warning-text',
    ring: 'stroke-warning',
    badge: 'bg-warning-subtle text-warning-text border-line-warning',
    bar: 'bg-warning',
    soft: 'bg-warning-subtle',
    icon: CircleDot,
  },
  red: {
    label: bandLabel('red'),
    text: 'text-danger-text',
    ring: 'stroke-danger',
    badge: 'bg-danger-subtle text-danger-text border-line-danger',
    bar: 'bg-danger',
    soft: 'bg-danger-subtle',
    icon: AlertTriangle,
  },
};
