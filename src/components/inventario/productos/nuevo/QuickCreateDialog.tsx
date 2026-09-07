'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface QuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  loading?: boolean;
  /** Ancho máximo del diálogo. Por defecto 'max-w-4xl'. */
  maxWidth?: string;
}

/**
 * Diálogo reutilizable para crear entidades "en línea" desde el formulario
 * de nuevo producto (categoría, proveedor, etc.). Envuelve el contenido en
 * un modal con scroll vertical para formularios largos.
 * Usa el mismo patrón visual y funcional del modal de "Nueva Sucursal" (div custom).
 *
 * Se renderiza con createPortal en document.body para evitar que el
 * transform de la animación del dialog padre (zoom-in-95) convierta
 * el position:fixed en position:absolute relativo al padre.
 */
export function QuickCreateDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  loading = false,
  maxWidth = 'max-w-4xl',
}: QuickCreateDialogProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] overflow-y-auto">
      <div className="min-h-screen px-1 sm:px-4 py-2 sm:py-8 flex items-center justify-center">
        <div className={`bg-white rounded-xl shadow-2xl w-full ${maxWidth} max-h-[97vh] sm:max-h-[90vh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-800`}>
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50 flex items-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {title}
              </h2>
              {description && (
                <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{description}</p>
              )}
            </div>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-700"
              onClick={() => onOpenChange(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50 dark:bg-gray-900">
            <div className="p-4 sm:p-6">{children}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
