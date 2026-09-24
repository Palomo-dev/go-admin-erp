/**
 * CSV para Excel en español (separador `;`, BOM para las tildes) con las celdas
 * que empiezan por `=`, `+`, `-`, `@`, tabulador o retorno neutralizadas: Excel
 * no ejecuta fórmulas que vengan en los datos (inyección de CSV).
 *
 * Utilidad única a partir de la del historial de cajas (la mejor de las copias
 * del repo, CAJAS-VENTAS-PLAN §1.4). La usan el historial de cajas y la
 * exportación de ventas; las demás copias se pueden ir pasando aquí.
 */

/** Valor de celda CSV: comillas si hace falta y sin fórmulas que Excel ejecute. */
export function celdaCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Cabecera + filas → texto CSV con BOM y fin de línea de Windows. */
export function filasACsv(cabecera: readonly string[], filas: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  const lineas = [cabecera.map(celdaCsv).join(';'), ...filas.map((f) => f.map(celdaCsv).join(';'))];
  return `﻿${lineas.join('\r\n')}`;
}
