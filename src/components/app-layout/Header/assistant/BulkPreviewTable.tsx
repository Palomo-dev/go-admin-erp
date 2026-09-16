'use client';

import React, { useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { ActionPreview, BulkPreviewRow } from '@/lib/ai/assistant/clientTypes';

/**
 * Tabla de solo lectura de una carga masiva (§6.3). Las filas con problemas
 * ya vienen arriba desde el servidor, con su motivo. Virtualizada: un listado
 * de 500 filas no puede pintar 500 `<tr>` dentro de un panel de chat.
 */
export default function BulkPreviewTable({ bulk }: { bulk: NonNullable<ActionPreview['bulk']> }) {
  const [open, setOpen] = useState(bulk.conErrores > 0);
  const aCargar = bulk.nuevos + bulk.duplicados;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <span>
          {open ? 'Ocultar' : 'Ver'} las {bulk.total} filas
          {bulk.conErrores > 0 && (
            <span className="ml-2 text-red-600 dark:text-red-400">· {bulk.conErrores} con problemas</span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>

      {open && (
        <div className="text-xs">
          <div className="grid grid-cols-[2rem_1fr_5rem_4.5rem_4rem] gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
            <span>#</span>
            <span>Producto</span>
            <span className="text-right">Precio</span>
            <span className="text-right">Stock</span>
            <span>Estado</span>
          </div>
          <Virtuoso
            style={{ height: Math.min(bulk.rows.length, 8) * 44 }}
            data={bulk.rows}
            itemContent={(_, row) => <Fila row={row} />}
          />
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            Se cargarán {aCargar} · duplicados por SKU, código de barras o nombre
          </div>
        </div>
      )}
    </div>
  );
}

const ESTADO: Record<BulkPreviewRow['estado'], { text: string; className: string }> = {
  nuevo: { text: 'Nuevo', className: 'text-green-700 dark:text-green-400' },
  existente: { text: 'Existe', className: 'text-amber-700 dark:text-amber-400' },
  error: { text: 'Se omite', className: 'text-red-700 dark:text-red-400' },
};

function Fila({ row }: { row: BulkPreviewRow }) {
  const estado = ESTADO[row.estado];
  return (
    <div
      className={cn(
        'grid grid-cols-[2rem_1fr_5rem_4.5rem_4rem] gap-2 px-3 py-1.5 border-t border-gray-100 dark:border-gray-800 items-start',
        row.estado === 'error' && 'bg-red-50/60 dark:bg-red-900/10'
      )}
    >
      <span className="text-gray-400">{row.n}</span>
      <span className="min-w-0">
        <span className="block truncate text-gray-900 dark:text-gray-100" title={row.nombre}>
          {row.nombre || '(sin nombre)'}
        </span>
        <span className="block truncate text-gray-500 dark:text-gray-400">
          {row.sku ?? row.barcode ?? ''}
          {row.estado === 'existente' && row.coincide && ` · coincide por ${row.coincide}`}
          {row.estado === 'error' && row.motivo && <span className="text-red-600 dark:text-red-400"> {row.motivo}</span>}
        </span>
      </span>
      <span className="text-right tabular-nums text-gray-700 dark:text-gray-300">
        {row.precio !== null ? row.precio.toLocaleString('es-CO') : '—'}
      </span>
      <span className="text-right tabular-nums text-gray-700 dark:text-gray-300">
        {row.stock !== null ? row.stock.toLocaleString('es-CO') : '—'}
      </span>
      <span className={cn('font-medium', estado.className)}>{estado.text}</span>
    </div>
  );
}
