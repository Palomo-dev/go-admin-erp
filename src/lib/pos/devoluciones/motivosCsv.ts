/**
 * «Importar CSV» de Motivos de devolución (Figma `874:579636`). Lee por
 * posición, como lo exporta la pantalla: código, nombre, descripción, requiere
 * foto, afecta inventario, activo, orden. La fila 0 son los encabezados (van
 * traducidos y no se leen).
 *
 * Corrige D16 de la spec: antes se partía por «,» sin respetar comillas, y una
 * descripción con coma corría las columnas. Las celdas se parten con
 * `partirLinea` (la misma del importador de empleados) y se admite «;» como
 * separador (Excel en español). El código se normaliza a MAYÚSCULAS. Módulo hoja.
 */
import { partirLinea } from '@/lib/hrm/personas/importar';
import type { CreateReturnReasonData } from '@/components/pos/devoluciones/types';

const SI = new Set(['si', 'sí', 'yes', 'oui', 'sim', 'true', '1', 'x']);
const NO = new Set(['no', 'não', 'nao', 'non', 'false', '0']);

function booleano(valor: string | undefined, defecto: boolean): boolean {
  const v = (valor ?? '').trim().toLowerCase();
  if (SI.has(v)) return true;
  if (NO.has(v)) return false;
  return defecto;
}

/** Código del motivo como se guarda: sin espacios en los bordes y en MAYÚSCULAS. */
export function normalizarCodigoMotivo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

export function filasCsvMotivos(texto: string): CreateReturnReasonData[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length < 2) return [];
  const sep = (lineas[0].match(/;/g)?.length ?? 0) > (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas: CreateReturnReasonData[] = [];
  for (const linea of lineas.slice(1)) {
    const v = partirLinea(linea, sep);
    const codigo = normalizarCodigoMotivo(v[0] ?? '');
    const nombre = (v[1] ?? '').trim();
    if (!codigo || !nombre) continue;
    const orden = Number.parseInt(v[6] ?? '', 10);
    filas.push({
      code: codigo,
      name: nombre,
      description: (v[2] ?? '').trim() || undefined,
      requires_photo: booleano(v[3], false),
      affects_inventory: booleano(v[4], true),
      is_active: booleano(v[5], true),
      display_order: Number.isFinite(orden) && orden >= 0 ? orden : 0,
    });
  }
  return filas;
}
