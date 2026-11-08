/**
 * Lectura del CSV de importación de conexiones (Frente INT). Mismas columnas que aceptaba la
 * página anterior: `name|nombre`, `branch_id|sucursal_id`, `country_code|pais`,
 * `environment|ambiente`. Tolera BOM, CRLF, `;` como separador y campos entre comillas.
 * Puro: sin React ni red. El servidor vuelve a validar todo (sucursal, ambiente, duplicados).
 */
export interface FilaCsvConexion {
  nombre: string;
  sucursalId?: number | null;
  pais?: string | null;
  ambiente?: string | null;
}

export type ErrorCsv = 'vacio' | 'sin_columna_nombre' | 'demasiadas_filas';

export const MAX_FILAS_CSV = 200;

function separarLinea(linea: string, sep: string): string[] {
  const salida: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const ch = linea[i];
    if (ch === '"') {
      if (comillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else {
        comillas = !comillas;
      }
    } else if (ch === sep && !comillas) {
      salida.push(actual.trim());
      actual = '';
    } else {
      actual += ch;
    }
  }
  salida.push(actual.trim());
  return salida;
}

export function parsearCsvConexiones(texto: string): { filas: FilaCsvConexion[] } | { error: ErrorCsv } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) return { error: 'vacio' };
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const cabecera = separarLinea(lineas[0], sep).map((h) => h.toLowerCase());
  const col = (...nombres: string[]) => cabecera.findIndex((h) => nombres.includes(h));
  const iNombre = col('name', 'nombre');
  if (iNombre === -1) return { error: 'sin_columna_nombre' };
  const iSucursal = col('branch_id', 'sucursal_id', 'sucursal');
  const iPais = col('country_code', 'pais', 'país');
  const iAmbiente = col('environment', 'ambiente');
  if (lineas.length - 1 > MAX_FILAS_CSV) return { error: 'demasiadas_filas' };

  const filas: FilaCsvConexion[] = lineas.slice(1).map((l) => {
    const v = separarLinea(l, sep);
    const sucursal = iSucursal !== -1 ? Number.parseInt(v[iSucursal] ?? '', 10) : NaN;
    return {
      nombre: (v[iNombre] ?? '').slice(0, 200),
      sucursalId: Number.isInteger(sucursal) && sucursal > 0 ? sucursal : null,
      pais: iPais !== -1 ? v[iPais] || null : null,
      ambiente: iAmbiente !== -1 ? (v[iAmbiente] || '').toLowerCase() || null : null,
    };
  });
  return { filas };
}

/** Plantilla descargable. */
export const PLANTILLA_CSV = 'nombre,sucursal_id,pais,ambiente\nTienda principal,,CO,production\n';
