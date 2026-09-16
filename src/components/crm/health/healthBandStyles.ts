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
    text: 'text-green-700 dark:text-green-400',
    ring: 'stroke-green-600 dark:stroke-green-400',
    badge: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',
    bar: 'bg-green-600 dark:bg-green-400',
    icon: CheckCircle2,
  },
  yellow: {
    label: bandLabel('yellow'),
    text: 'text-amber-700 dark:text-amber-400',
    ring: 'stroke-amber-600 dark:stroke-amber-400',
    badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',
    bar: 'bg-amber-600 dark:bg-amber-400',
    icon: CircleDot,
  },
  red: {
    label: bandLabel('red'),
    text: 'text-red-700 dark:text-red-400',
    ring: 'stroke-red-600 dark:stroke-red-400',
    badge: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
    bar: 'bg-red-600 dark:bg-red-400',
    icon: AlertTriangle,
  },
};
