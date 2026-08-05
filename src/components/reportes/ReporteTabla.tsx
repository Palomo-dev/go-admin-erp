'use client';

import { useState, useMemo } from 'react';
import type { ReportData, ReporteColumna } from '@/lib/services/reportes/types';

const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO');

function formatCelda(valor: unknown, tipo: ReporteColumna['tipo']): string {
  if (valor === null || valor === undefined) return '—';
  if (tipo === 'moneda') return moneda.format(Number(valor) || 0);
  if (tipo === 'porcentaje') return `${valor}%`;
  if (tipo === 'numero') return numero.format(Number(valor) || 0);
  if (tipo === 'fecha') {
    const d = new Date(String(valor));
    return d.toLocaleDateString('es-CO');
  }
  return String(valor);
}

const PAGE_SIZES = [25, 50, 100];

export function ReporteTabla({ data }: { data: ReportData }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const { filas, columnas, totales } = data;
  const totalPages = Math.ceil(filas.length / pageSize);
  const start = page * pageSize;
  const visibleRows = useMemo(() => filas.slice(start, start + pageSize), [filas, start, pageSize]);

  const alignClass = (alinear?: ReporteColumna['alinear']) => {
    if (alinear === 'right') return 'text-right';
    if (alinear === 'center') return 'text-center';
    return 'text-left';
  };

  if (!filas.length) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        Sin datos en este período
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {columnas.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-semibold text-gray-700 dark:text-gray-300 ${alignClass(col.alinear)}`}
                >
                  {col.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((fila, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                {columnas.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-gray-700 dark:text-gray-300 ${alignClass(col.alinear)}`}
                  >
                    {formatCelda(fila[col.key], col.tipo)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totales && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold bg-gray-50 dark:bg-gray-800">
                {columnas.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-gray-900 dark:text-gray-100 ${alignClass(col.alinear)}`}
                  >
                    {totales[col.key] !== undefined ? formatCelda(totales[col.key], col.tipo) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {filas.length > PAGE_SIZES[0] && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {start + 1}–{Math.min(start + pageSize, filas.length)} de {filas.length}
          </span>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="rounded border border-gray-200 dark:border-gray-700 bg-transparent px-2 py-1 text-sm"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s} por página</option>
              ))}
            </select>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40"
            >
              ◀
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40"
            >
              ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
