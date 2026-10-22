'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  ETIQUETA_NIVEL,
  NIVELES_PUC,
  colapsarImportes,
  type FilaImporte,
  type NivelPuc,
  type NodoImporte,
} from '@/lib/finanzas/reportes/nivelesPuc';
import { descargarExcel, descargarPdf } from '@/lib/finanzas/reportes/exportarReporte';

export function SelectorNivel({
  valor,
  onChange,
}: {
  valor: NivelPuc;
  onChange: (nivel: NivelPuc) => void;
}) {
  return (
    <label className="space-y-2 block">
      <span className="text-sm text-gray-700 dark:text-gray-300">Nivel PUC</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as NivelPuc)}
        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-white"
      >
        {NIVELES_PUC.map((nivel) => (
          <option key={nivel} value={nivel}>{ETIQUETA_NIVEL[nivel]}</option>
        ))}
      </select>
    </label>
  );
}

/** Árbol en auxiliar; en los demás niveles, suma que conserva el total. */
export function filasEnNivel(nodos: NodoImporte[], nivel: NivelPuc): FilaImporte[] | null {
  if (nivel === 'auxiliar') return null;
  const resultado = nodos.filter((nodo) => nodo.account_code === 'RESULTADO');
  const reales = nodos.filter((nodo) => nodo.account_code !== 'RESULTADO');
  return [
    ...colapsarImportes(reales, nivel),
    ...resultado.map((nodo) => ({ codigo: nodo.account_code, nombre: nodo.name, importe: nodo.amount })),
  ];
}

export function FilasNivel({
  filas,
  formatCifra,
}: {
  filas: FilaImporte[];
  formatCifra: (valor: number) => string;
}) {
  return (
    <>
      {filas.map((fila) => (
        <tr key={fila.codigo} className="border-b dark:border-gray-700/50">
          <td className="py-2 px-3">
            <span className="font-mono text-xs text-gray-500 mr-2">{fila.codigo}</span>
            <span className="text-gray-900 dark:text-white">{fila.nombre}</span>
          </td>
          <td className="py-2 px-3 text-right font-mono text-gray-900 dark:text-white">{formatCifra(fila.importe)}</td>
        </tr>
      ))}
    </>
  );
}

export function BotonesExportar({
  nombre,
  titulo,
  columnas,
  filas,
}: {
  nombre: string;
  titulo: string;
  columnas: string[];
  filas: (string | number)[][];
}) {
  const objetos = filas.map((fila) => {
    const objeto: Record<string, string | number> = {};
    columnas.forEach((columna, i) => {
      objeto[columna] = fila[i] ?? '';
    });
    return objeto;
  });

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="dark:border-gray-600"
        onClick={() => { void descargarExcel(nombre, objetos); }}
      >
        Excel
      </Button>
      <Button
        type="button"
        variant="outline"
        className="dark:border-gray-600"
        onClick={() => { void descargarPdf(nombre, titulo, columnas, filas); }}
      >
        PDF
      </Button>
    </div>
  );
}
