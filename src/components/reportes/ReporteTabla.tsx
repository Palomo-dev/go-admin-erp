'use client';

import { useState, useMemo } from 'react';
import type { ReportData, ReporteColumna } from '@/lib/services/reportes/types';
import { ReportePagination } from './ReportePagination';

const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
const numero = new Intl.NumberFormat('es-CO');

function formatCelda(valor: unknown, tipo: ReporteColumna['tipo']): string {
  if (valor === null || valor === undefined) return '—';
  if (tipo === 'moneda') return moneda.format(Number(valor) || 0);
  if (tipo === 'porcentaje') return `${valor}%`;
  if (tipo === 'numero') return numero.format(Number(valor) || 0);
  if (tipo === 'fecha') {
    const str = String(valor);
    const d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
    return d.toLocaleDateString('es-CO');
  }
  return String(valor);
}

export function ReporteTabla({ data, comparisonData }: { data: ReportData; comparisonData?: ReportData | null }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const { filas, columnas, totales } = data;
  const start = page * pageSize;
  const visibleRows = useMemo(() => filas.slice(start, start + pageSize), [filas, start, pageSize]);

  // Construir mapa de comparación: clave -> fila anterior
  const comparisonMap = useMemo(() => {
    if (!comparisonData || !comparisonData.filas.length) return null;
    const xCol =
      columnas.find((c) => c.tipo === 'fecha') ||
      columnas.find((c) => c.tipo === 'texto') ||
      columnas[0];
    if (!xCol) return null;
    const map = new Map<string, Record<string, unknown>>();
    comparisonData.filas.forEach((fila) => {
      const key = String(fila[xCol.key] ?? '');
      map.set(key, fila);
    });
    return map;
  }, [comparisonData, columnas]);

  const xColKey = useMemo(() => {
    const xCol =
      columnas.find((c) => c.tipo === 'fecha') ||
      columnas.find((c) => c.tipo === 'texto') ||
      columnas[0];
    return xCol?.key ?? '';
  }, [columnas]);

  const alignClass = (alinear?: ReporteColumna['alinear']) => {
    if (alinear === 'right') return 'text-right';
    if (alinear === 'center') return 'text-center';
    return 'text-left';
  };

  const isNumeric = (tipo: ReporteColumna['tipo']) =>
    tipo === 'numero' || tipo === 'moneda' || tipo === 'porcentaje';

  if (!filas.length) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        Sin datos en este período
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              {columnas.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider ${alignClass(col.alinear)}`}
                >
                  {col.titulo}
                </th>
              ))}
              {comparisonMap && columnas.filter((c) => isNumeric(c.tipo)).map((col) => (
                <th
                  key={`${col.key}_prev`}
                  className={`px-3 py-2.5 font-semibold text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wider ${alignClass(col.alinear)}`}
                >
                  {col.titulo} (Ant.)
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {visibleRows.map((fila, idx) => {
              const compRow = comparisonMap?.get(String(fila[xColKey] ?? ''));
              return (
                <tr
                  key={idx}
                  className={`transition-colors ${
                    idx % 2 === 0
                      ? 'bg-white dark:bg-gray-900'
                      : 'bg-gray-50/50 dark:bg-gray-800/30'
                  } hover:bg-blue-50/50 dark:hover:bg-blue-900/10`}
                >
                  {columnas.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 ${
                        isNumeric(col.tipo)
                          ? 'text-right font-medium text-gray-900 dark:text-gray-100 tabular-nums'
                          : 'text-gray-700 dark:text-gray-300'
                      } ${alignClass(col.alinear)}`}
                    >
                      {formatCelda(fila[col.key], col.tipo)}
                    </td>
                  ))}
                  {comparisonMap && columnas.filter((c) => isNumeric(c.tipo)).map((col) => (
                    <td
                      key={`${col.key}_prev`}
                      className={`px-3 py-2.5 text-right tabular-nums text-gray-400 dark:text-gray-500 ${alignClass(col.alinear)}`}
                    >
                      {compRow ? formatCelda(compRow[col.key], col.tipo) : '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {totales && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold bg-blue-50/50 dark:bg-blue-900/20">
                {columnas.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2.5 text-gray-900 dark:text-gray-100 ${
                      isNumeric(col.tipo) ? 'text-right tabular-nums' : ''
                    } ${alignClass(col.alinear)}`}
                  >
                    {totales[col.key] !== undefined ? formatCelda(totales[col.key], col.tipo) : ''}
                  </td>
                ))}
                {comparisonMap && columnas.filter((c) => isNumeric(c.tipo)).map((col) => (
                  <td
                    key={`${col.key}_prev`}
                    className={`px-3 py-2.5 text-right tabular-nums text-gray-400 dark:text-gray-500 ${alignClass(col.alinear)}`}
                  >
                    {comparisonData?.totales && comparisonData.totales[col.key] !== undefined
                      ? formatCelda(comparisonData.totales[col.key], col.tipo)
                      : '—'}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <ReportePagination
        page={page}
        pageSize={pageSize}
        total={filas.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
      />
    </div>
  );
}
