'use client';

/**
 * Tarjeta base de los widgets del vendedor (F13): título con icono, entrada
 * escalonada por `index` con `motion` (la animación explica que el panel se
 * compone), sin animación con `prefers-reduced-motion`. Con `error`, pinta el
 * fallo en lugar del contenido: un widget nunca dice «Sin comisiones» porque
 * la BD no respondió.
 */

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { staggerDelay } from './widgetModels';

interface Props {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  index: number;
  /** Enlace «ver todo» opcional (texto + href). */
  action?: ReactNode;
  /** Mensaje de error de la carga: sustituye al contenido. */
  error?: string | null;
  children: ReactNode;
  className?: string;
}

export function WidgetCard({ title, icon: Icon, index, action, error, children, className = '' }: Props) {
  const reduced = useReducedMotion();
  return (
    <motion.section
      aria-label={title}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22, delay: staggerDelay(index, reduced), ease: 'easeOut' }}
      className={`flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <span className="rounded-md bg-blue-100 p-1.5 dark:bg-blue-900/40" aria-hidden="true">
            <Icon className="h-4 w-4 text-blue-700 dark:text-blue-300" />
          </span>
          {title}
        </h3>
        {action}
      </header>
      {error ? (
        <p role="status" className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>No se pudo cargar: {error}</span>
        </p>
      ) : (
        <div className="flex-1">{children}</div>
      )}
    </motion.section>
  );
}
