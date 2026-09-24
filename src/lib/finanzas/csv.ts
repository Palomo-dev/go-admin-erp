/**
 * CSV de los listados de Finanzas (facturas de venta, cartera): comillas cuando
 * hace falta, filas con CRLF y BOM para que Excel abra bien las tildes.
 * La descarga la hace el mismo ayudante del motor de documentos (`guardarArchivo`).
 */
import { guardarArchivo } from '@/lib/documents/cliente';

function celda(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\r\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(filas: readonly (readonly (string | number | null | undefined)[])[]): string {
  return '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n');
}

export function descargarCsv(nombre: string, contenido: string): void {
  guardarArchivo(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }), nombre);
}
