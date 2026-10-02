import { AlertTriangle, CheckCircle2, CircleDot, type LucideIcon } from 'lucide-react';
import type { HealthBand } from '@/lib/services/crm/healthBands';
import { bandLabel } from '@/lib/services/crm/healthBands';

/**
 * Estilos por banda (F11). Contraste AA en ambos temas: texto pequeño con
 * `*-700` sobre blanco y `*-400` sobre gris 900; los badges usan `*-100/*-800`.
 * La banda SIEMPRE se comunica con icono + texto (`bandLabel`), nunca solo color.
 */
export interface BandStyle {
  label: string;
  text: string;
  ring: string;
  badge: string;
  bar: string;
  icon: LucideIcon;
}

export const BAND_STYLES: Record<HealthBand, BandStyle> = {
  green: {
    label: bandLabel('green'),
    text: 'text-success-text',
    ring: 'stroke-success',
    badge: 'bg-success-subtle text-success-text border-line-success',
    bar: 'bg-success',
    icon: CheckCircle2,
  },
  yellow: {
    label: bandLabel('yellow'),
    text: 'text-warning-text',
    ring: 'stroke-warning',
    badge: 'bg-warning-subtle text-warning-text border-line-warning',
    bar: 'bg-warning',
    icon: CircleDot,
  },
  red: {
    label: bandLabel('red'),
    text: 'text-danger-text',
    ring: 'stroke-danger',
    badge: 'bg-danger-subtle text-danger-text border-line-danger',
    bar: 'bg-danger',
    icon: AlertTriangle,
  },
};
