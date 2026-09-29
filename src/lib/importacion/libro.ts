/**
 * Lectura genérica de archivos CSV / XLS / XLSX para los importadores del ERP.
 *
 * Nació dentro del importador de productos (`src/lib/inventario/importacion/lector.ts`),
 * que solo leía la PRIMERA hoja. El importador de leads necesita elegir hoja
 * (un libro de prospección trae la tanda más hojas de resumen y de fuentes),
 * así que la lectura del libro se extrajo aquí y el de productos la reutiliza
 * sin cambiar su comportamiento (`leerMatriz` = primera hoja).
 *
 * Módulo puro: sirve en navegador, servidor y tests.
 */

import * as XLSX from 'xlsx';

/** Filas × celdas de una hoja. */
export type Matriz = unknown[][];

export const EXTENSIONES_ADMITIDAS = ['.csv', '.xlsx', '.xls'] as const;

export function extensionAdmitida(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return EXTENSIONES_ADMITIDAS.some((e) => n.endsWith(e));
}

/**
 * CSV: se decodifica como UTF-8 y, si trae caracteres inválidos (Excel en
 * Windows guarda en Windows-1252), como Windows-1252. Así «Categoría» no llega
 * como «CategorÃ­a». El separador («,», «;» o tabulador) lo detecta SheetJS.
 */
export function decodificarCsv(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  const texto = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8;
  return texto.replace(/^﻿/, '');
}

export function filaVacia(fila: unknown[] | undefined): boolean {
  return !fila || fila.every((c) => c === null || c === undefined || String(c).trim() === '');
}

export interface LibroLeido {
  /** Nombres de las hojas, en el orden del archivo (un CSV trae una sola). */
  hojas: string[];
  /** Matriz de una hoja (por defecto la primera), sin filas vacías al final. `[]` si no existe. */
  matriz: (hoja?: string) => Matriz;
}

/** Lee el libro completo; las hojas se convierten a matriz solo cuando se piden. */
export function leerLibro(buffer: ArrayBuffer, nombre: string): LibroLeido {
  const esCsv = nombre.toLowerCase().endsWith('.csv');
  const libro = esCsv
    ? XLSX.read(decodificarCsv(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array' });
  return {
    hojas: [...libro.SheetNames],
    matriz: (hoja?: string) => {
      const nombreHoja = hoja ?? libro.SheetNames[0];
      const ws = nombreHoja ? libro.Sheets[nombreHoja] : undefined;
      if (!ws) return [];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: true });
      while (matriz.length && filaVacia(matriz[matriz.length - 1])) matriz.pop();
      return matriz;
    },
  };
}
