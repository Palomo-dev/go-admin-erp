'use client';

/**
 * Bloque de error con botón de reintentar.
 *
 * Se usa en lugar de dejar un spinner girando o de mostrar el estado vacío
 * ("no hay datos") cuando en realidad la carga falló.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LoadErrorStateProps {
  /** Mensaje legible ya formateado (usa `describeError`). */
  message: string;
  /** Se invoca al pulsar «Reintentar». */
  onRetry: () => void;
  /** Deshabilita el botón mientras hay un reintento en curso. */
  isRetrying?: boolean;
  /** Título corto. Por defecto: «No se pudo cargar». */
  title?: string;
  className?: string;
}

export function LoadErrorState({
  message,
  onRetry,
  isRetrying = false,
  title = 'No se pudo cargar',
  className = '',
}: LoadErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200 ${className}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 break-words text-red-700 dark:text-red-300">{message}</p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={isRetrying}
        className="shrink-0"
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} aria-hidden="true" />
        Reintentar
      </Button>
    </div>
  );
}

export default LoadErrorState;
