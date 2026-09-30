'use client';

import { useMemo, useState } from 'react';
import { DataTable, ListCard, type OrdenListado } from '@/components/kit';
import { SUFIJO_VARIACION } from '@/lib/services/reportes/comparativo';
import type { ReporteColumna } from '@/lib/services/reportes/types';
import { cn } from '@/utils/Utils';
import { useFormatoReporte } from './useFormatoReporte';

export interface FilaTabla extends Record<string, unknown> {
  __id: string;
}

/** Tabla del visor: orden en el cliente, subtotales en negrita, negativos en rojo y tarjetas en móvil. */
export function TablaReporte({
  columnas,
  filas,
  totales,
  etiqueta,
  estado = 'listo',
}: {
  columnas: ReporteColumna[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>;
  etiqueta: string;
  estado?: 'cargando' | 'listo';
}) {
  const formato = useFormatoReporte();
  const [orden, setOrden] = useState<OrdenListado | null>(null);
  const texto = columnas.find((c) => c.tipo === 'texto');
  const cifra = columnas.find((c) => c.tipo === 'moneda' || c.tipo === 'numero');

  const ordenadas = useMemo(() => {
    const base: FilaTabla[] = filas.map((f, i) => ({ ...f, __id: String(i) }));
    if (!orden) return base;
    const dir = orden.direccion === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = a[orden.campo];
      const vb = b[orden.campo];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true }) * dir;
    });
  }, [filas, orden]);

  const conTotal: FilaTabla[] = totales ? [...ordenadas, { ...totales, __id: 'total', __total: true }] : ordenadas;

  return (
    <DataTable<FilaTabla>
      etiqueta={etiqueta}
      estado={estado}
      filas={conTotal}
      obtenerId={(f) => f.__id}
      orden={orden}
      onOrdenar={(campo) => setOrden((prev) => ({ campo, direccion: prev?.campo === campo && prev.direccion === 'asc' ? 'desc' : 'asc' }))}
      virtualizar="auto"
      densidad="compacta"
      columnas={columnas.map((c) => ({
        id: c.key,
        encabezado: c.titulo,
        ordenable: true,
        variante: c.tipo === 'moneda' || c.tipo === 'numero' || c.tipo === 'porcentaje' ? 'importe' : 'texto',
        celda: (fila) => {
          const v = fila[c.key];
          const n = typeof v === 'number' ? v : null;
          const subtotal = fila.nivel === 'subtotal' || fila.__total === true;
          return (
            <span className={cn(subtotal && 'font-semibold', n !== null && n < 0 && 'text-danger-text', fila.__total === true && n !== null && n > 0 && c.key.endsWith(SUFIJO_VARIACION) && 'text-success-text')}>
              {formato.valor(v, c.tipo)}
            </span>
          );
        },
      }))}
      tarjetaMovil={(fila) => (
        <ListCard
          titulo={texto ? formato.valor(fila[texto.key], 'texto') : etiqueta}
          subtitulo={columnas.filter((c) => c.tipo === 'texto' && c.key !== texto?.key)[0] ? formato.valor(fila[columnas.find((c) => c.tipo === 'texto' && c.key !== texto?.key)!.key], 'texto') : undefined}
          valor={cifra ? formato.valor(fila[cifra.key], cifra.tipo) : undefined}
        />
      )}
    />
  );
}
