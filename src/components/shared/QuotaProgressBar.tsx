'use client';

/**
 * Barra de progreso de cuota accesible (`role="progressbar"` con valor,
 * mínimo, máximo y texto) y animada con `motion`: la barra «explica» cuánto
 * se ha avanzado. Con `prefers-reduced-motion` se pinta sin animación.
 * Compartida por la pestaña «Cuotas» de miembros y el widget de /app/inicio.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { QuotaStatus } from '@/lib/services/crm/quotaProgress';

interface Props {
  /** Porcentaje visible, ya acotado a [0, 100]. */
  pct: number;
  status: QuotaStatus;
  /** Texto para lectores de pantalla («84 % de la cuota, en ritmo»). */
  label: string;
  className?: string;
}

// Relleno vs pista ≥ 3:1 (WCAG 1.4.11) en ambos temas, medido en el arnés F13:
// claro sobre gray-200 → blue-700 5,41 · green-700 4,05 · amber-700 4,06 · red-700 5,23;
// oscuro sobre gray-700 → blue-400 4,05 · green-400 5,92 · amber-400 6,17 · red-400 3,73.
const FILL: Record<QuotaStatus, string> = {
  en_ritmo: 'bg-blue-700 dark:bg-blue-400',
  cumplida: 'bg-green-700 dark:bg-green-400',
  atrasado: 'bg-amber-700 dark:bg-amber-400',
  vencida: 'bg-red-700 dark:bg-red-400',
};

export function QuotaProgressBar({ pct, status, label, className = '' }: Props) {
  const reduced = useReducedMotion();
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={label}
      className={`h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${className}`}
    >
      <motion.div
        className={`h-full rounded-full ${FILL[status]}`}
        initial={reduced ? false : { width: 0 }}
        animate={{ width: `${value}%` }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22, mass: 0.6 }}
      />
    </div>
  );
}
