'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { RUTA_IMPUESTOS_ORGANIZACION, rutaEditarProducto } from '@/lib/services/taxCoverage';
import type { LineaSinImpuesto } from '@/hooks/useLineasSinImpuesto';

interface AvisoSinImpuestoProps {
  lineas: LineaSinImpuesto[];
  /** Verbo del documento: «se facturará», «se cotizará», «se cobrará». */
  accion?: string;
  className?: string;
}

/**
 * Advertencia (no bloqueante) sobre el botón de emitir/cobrar: hay líneas que
 * saldrán sin IVA porque ni el producto ni la organización tienen un impuesto
 * configurado. Texto explícito además del color, y `role="status"` para que el
 * lector de pantalla lo anuncie cuando aparece.
 */
export function AvisoSinImpuesto({ lineas, accion = 'se facturará', className }: AvisoSinImpuestoProps) {
  if (lineas.length === 0) return null;

  const uno = lineas.length === 1;
  const titulo = uno
    ? `Este producto no tiene impuesto asignado: ${accion} sin IVA.`
    : `${lineas.length} productos no tienen impuesto asignado: ${accion.replace(/á$/, 'án')} sin IVA.`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text',
        className,
      )}
    >
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="sr-only">Advertencia: </span>
          {titulo}
        </span>
      </p>
      <ul className="mt-2 space-y-1 pl-6">
        {lineas.map((l) => (
          <li key={`${l.index}-${l.productId ?? 'manual'}`} className="flex flex-wrap items-baseline gap-x-2">
            <span className="break-words">{l.nombre || 'Línea sin descripción'}</span>
            {l.productId != null && (
              <Link
                href={rutaEditarProducto(l.productUuid)}
                target="_blank"
                className="text-xs font-medium text-brand-action underline underline-offset-2"
              >
                Asignar impuesto al producto
                <span className="sr-only"> {l.nombre} (se abre en otra pestaña)</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 pl-6 text-xs">
        O define una{' '}
        <Link
          href={RUTA_IMPUESTOS_ORGANIZACION}
          target="_blank"
          className="font-medium text-brand-action underline underline-offset-2"
        >
          tarifa por defecto para productos sin impuesto
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </Link>
        . Puedes continuar; es solo una advertencia.
      </p>
    </div>
  );
}

/** Marca breve para la celda o tarjeta de la línea. */
export function EtiquetaSinImpuesto({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border border-line-warning bg-warning-subtle px-1.5 py-0.5 text-[10px] font-medium leading-tight text-warning-text',
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      Sin impuesto asignado
    </span>
  );
}
