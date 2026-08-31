'use client';

import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyableIdProps {
  /** Texto a mostrar como identificador clickeable */
  label: string;
  /** Valor a copiar al portapapeles (por defecto = label) */
  copyValue?: string;
  /** Función al hacer click en el texto (ej. navegar al detalle). Si se omite, solo copia. */
  onClick?: () => void;
  /** Tamaño del icono de copiar */
  iconSize?: number;
  /** Clases extra para el texto */
  className?: string;
  /** Title del botón de copiar */
  copyTitle?: string;
  /** Title del texto clickeable */
  linkTitle?: string;
}

/**
 * Identificador clickeable con botón de copiar al portapapeles.
 * Muestra el texto en azul (hover:underline) + icono de copiar.
 * Al copiar, el icono cambia a un check verde por 2 segundos.
 */
export function CopyableId({
  label,
  copyValue,
  onClick,
  iconSize = 12,
  className = '',
  copyTitle = 'Copiar',
  linkTitle = 'Ver detalle',
}: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(copyValue ?? label);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silencioso
    }
  }, [copyValue, label]);

  const baseLinkClass = 'text-blue-600 dark:text-blue-400 hover:underline cursor-pointer text-left font-medium';

  return (
    <span className="inline-flex items-center gap-1">
      {onClick ? (
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className={`${baseLinkClass} ${className}`}
          title={linkTitle}
        >
          {label}
        </button>
      ) : (
        <span className={className}>{label}</span>
      )}
      <button
        onClick={handleCopy}
        className="inline-flex items-center justify-center p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
        title={copyTitle}
        aria-label={copyTitle}
      >
        {copied ? (
          <Check
            className="text-green-500 dark:text-green-400"
            style={{ width: iconSize, height: iconSize }}
          />
        ) : (
          <Copy
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            style={{ width: iconSize, height: iconSize }}
          />
        )}
      </button>
    </span>
  );
}
