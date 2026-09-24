// Lógica pura de Cargos de servicio: sin Supabase ni React, para poder probarla.

import {
  APPLIES_TO_VALUES,
  CHARGE_TYPES,
  type AppliesTo,
  type ChargeType,
  type CreateServiceChargeData,
  type UpdateServiceChargeData,
} from './types';

/**
 * Tipo de cargo del CSV o de un dato viejo → valor que admite la base.
 * 'fixed' se acepta como alias de 'fixed_amount' (era lo que documentaba la
 * ayuda del importador).
 */
export function normalizarTipoCargo(valor: unknown): ChargeType | null {
  const v = String(valor ?? '').trim().toLowerCase();
  if (v === 'fixed') return 'fixed_amount';
  return (CHARGE_TYPES as readonly string[]).includes(v) ? (v as ChargeType) : null;
}

export function normalizarAplicaA(valor: unknown): AppliesTo | null {
  const v = String(valor ?? '').trim().toLowerCase();
  if (!v) return 'all';
  return (APPLIES_TO_VALUES as readonly string[]).includes(v) ? (v as AppliesTo) : null;
}

/** Número positivo o null («sin mínimo»). Vacío, NaN, 0 o negativo → null. */
function opcionalPositivo(valor: unknown, entero = false): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = entero ? parseInt(String(valor), 10) : Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sucursalOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '' || valor === 'global') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Fila lista para insertar: los opcionales vacíos van como null, no como undefined. */
export function filaParaInsertar(data: CreateServiceChargeData) {
  return {
    name: data.name.trim(),
    charge_type: data.charge_type,
    charge_value: data.charge_value,
    min_amount: opcionalPositivo(data.min_amount),
    min_guests: opcionalPositivo(data.min_guests, true),
    applies_to: data.applies_to,
    is_taxable: data.is_taxable,
    is_optional: data.is_optional,
    branch_id: sucursalOpcional(data.branch_id),
  };
}

/**
 * Cambios para un UPDATE. Solo viajan las claves presentes en `data`, pero una
 * clave presente con valor vacío (undefined, '', 0) se envía como null: así
 * «Global» y borrar monto mínimo o personas mínimas se guardan de verdad
 * (supabase-js descarta las claves undefined del JSON).
 */
export function cambiosParaActualizar(data: UpdateServiceChargeData): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  if ('name' in data && data.name !== undefined) cambios.name = data.name.trim();
  if ('charge_type' in data && data.charge_type !== undefined) cambios.charge_type = data.charge_type;
  if ('charge_value' in data && data.charge_value !== undefined) cambios.charge_value = data.charge_value;
  if ('min_amount' in data) cambios.min_amount = opcionalPositivo(data.min_amount);
  if ('min_guests' in data) cambios.min_guests = opcionalPositivo(data.min_guests, true);
  if ('branch_id' in data) cambios.branch_id = sucursalOpcional(data.branch_id);
  if ('applies_to' in data && data.applies_to !== undefined) cambios.applies_to = data.applies_to;
  if ('is_taxable' in data && data.is_taxable !== undefined) cambios.is_taxable = data.is_taxable;
  if ('is_optional' in data && data.is_optional !== undefined) cambios.is_optional = data.is_optional;
  if ('is_active' in data && data.is_active !== undefined) cambios.is_active = data.is_active;
  return cambios;
}

/**
 * Filtro de sucursal: los cargos de esa sucursal MÁS los globales
 * (branch_id null), que también aplican en ella. Expresión para `.or()`.
 */
export function filtroSucursalConGlobales(branchId: number): string {
  const id = Math.trunc(Number(branchId));
  return `branch_id.eq.${id},branch_id.is.null`;
}

export type CodigoErrorFilaCsv = 'CAMPOS_FALTANTES' | 'TIPO_INVALIDO' | 'VALOR_INVALIDO' | 'APLICA_A_INVALIDO';

export interface FilaCsvCargo {
  fila: number;
  datos: CreateServiceChargeData;
}

export interface ErrorFilaCsv {
  fila: number;
  codigo: CodigoErrorFilaCsv | CodigoErrorCargo;
  valor?: string;
}

export const COLUMNAS_OBLIGATORIAS_CSV = ['name', 'charge_type', 'charge_value'] as const;

/**
 * CSV del importador → filas válidas y errores por fila (numeradas como en la
 * hoja: la fila 1 es el encabezado). Si faltan columnas obligatorias devuelve
 * `columnasFaltantes` y ninguna fila.
 */
export function parsearCsvCargos(csv: string): {
  filas: FilaCsvCargo[];
  errores: ErrorFilaCsv[];
  columnasFaltantes: string[];
} {
  const lineas = csv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const encabezados = (lineas[0] || '').toLowerCase().split(',').map((h) => h.trim());
  const columnasFaltantes = COLUMNAS_OBLIGATORIAS_CSV.filter((h) => !encabezados.includes(h));
  if (columnasFaltantes.length > 0) return { filas: [], errores: [], columnasFaltantes };

  const filas: FilaCsvCargo[] = [];
  const errores: ErrorFilaCsv[] = [];

  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i].trim()) continue;
    const fila = i + 1;
    const valores = lineas[i].split(',').map((v) => v.trim());
    const r: Record<string, string> = {};
    encabezados.forEach((h, idx) => { r[h] = valores[idx] || ''; });

    if (!r.name || !r.charge_type || !r.charge_value) {
      errores.push({ fila, codigo: 'CAMPOS_FALTANTES' });
      continue;
    }
    const tipo = normalizarTipoCargo(r.charge_type);
    if (!tipo) {
      errores.push({ fila, codigo: 'TIPO_INVALIDO', valor: r.charge_type });
      continue;
    }
    const valor = Number(r.charge_value);
    if (!Number.isFinite(valor) || valor <= 0 || (tipo === 'percentage' && valor > 100)) {
      errores.push({ fila, codigo: 'VALOR_INVALIDO', valor: r.charge_value });
      continue;
    }
    const aplica = normalizarAplicaA(r.applies_to);
    if (!aplica) {
      errores.push({ fila, codigo: 'APLICA_A_INVALIDO', valor: r.applies_to });
      continue;
    }

    filas.push({
      fila,
      datos: {
        name: r.name,
        charge_type: tipo,
        charge_value: valor,
        min_amount: opcionalPositivo(r.min_amount),
        min_guests: opcionalPositivo(r.min_guests, true),
        applies_to: aplica,
        is_taxable: r.is_taxable?.toLowerCase() === 'true',
        is_optional: r.is_optional?.toLowerCase() === 'true',
      },
    });
  }

  return { filas, errores, columnasFaltantes: [] };
}

export const CODIGOS_ERROR_CARGO = ['SIN_PERMISO', 'NO_ENCONTRADO', 'TIPO_INVALIDO', 'DESCONOCIDO'] as const;
export type CodigoErrorCargo = (typeof CODIGOS_ERROR_CARGO)[number];

export class CargoServicioError extends Error {
  constructor(public readonly codigo: CodigoErrorCargo, detalle?: string) {
    super(detalle || codigo);
    this.name = 'CargoServicioError';
  }
}

/** Error de Supabase → código de la pantalla. La RLS responde 42501; el CHECK de tipo, 23514. */
export function codigoErrorCargo(error: unknown): CodigoErrorCargo {
  if (error instanceof CargoServicioError) return error.codigo;
  const e = (error ?? {}) as { code?: string; message?: string };
  const mensaje = e.message || '';
  if (e.code === '42501' || /row-level security|permission denied/i.test(mensaje)) return 'SIN_PERMISO';
  if (e.code === '23514' && /charge_type/.test(mensaje)) return 'TIPO_INVALIDO';
  if (e.code === 'PGRST116') return 'NO_ENCONTRADO';
  return 'DESCONOCIDO';
}

export function errorCargo(error: unknown): CargoServicioError {
  if (error instanceof CargoServicioError) return error;
  return new CargoServicioError(codigoErrorCargo(error), (error as { message?: string } | null)?.message);
}
