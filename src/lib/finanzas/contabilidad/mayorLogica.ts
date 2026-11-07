/**
 * Mayor contable, presentación (sin React). El cálculo —saldo inicial, saldo
 * corrido y totales— es de `ReportesContablesService.getLedger`, la misma
 * función que usa el reporte «Mayor por cuenta» del módulo Reportes. Aquí solo
 * se arman las filas de la tabla (saldo inicial arriba, saldo final abajo) y su
 * paginación en pantalla.
 */
import type { LedgerAccount, LedgerEntry } from '@/components/finanzas/contabilidad/ReportesContablesService';
import { naturalezaCuenta, saldoConNaturaleza, type TipoNaturaleza } from './cuadre';

export type FilaMayor =
  | { tipo: 'inicial'; id: 'inicial'; saldo: number }
  | { tipo: 'movimiento'; id: string; linea: LedgerEntry }
  | { tipo: 'final'; id: 'final'; saldo: number; debitos: number; creditos: number; movimientos: number };

/** Todas las filas: saldo inicial (si aplica), movimientos y saldo final. */
export function filasMayor(mayor: LedgerAccount): FilaMayor[] {
  const filas: FilaMayor[] = [];
  if (!mayor.filtrado) filas.push({ tipo: 'inicial', id: 'inicial', saldo: mayor.opening_balance });
  mayor.entries.forEach((linea, i) => filas.push({ tipo: 'movimiento', id: `${linea.journal_entry_id}-${i}`, linea }));
  filas.push({
    tipo: 'final',
    id: 'final',
    saldo: mayor.closing_balance,
    debitos: mayor.total_debit,
    creditos: mayor.total_credit,
    movimientos: mayor.entries.length,
  });
  return filas;
}

export function paginaDe<T>(filas: readonly T[], pagina: number, tamano: number): T[] {
  const inicio = (Math.max(1, pagina) - 1) * tamano;
  return filas.slice(inicio, inicio + tamano);
}

/**
 * El saldo de `getLedger` va en la naturaleza de la cuenta según su tipo
 * (activo y gasto: débito − crédito). Se muestra positivo con su lado.
 */
export function naturalezaMayor(mayor: Pick<LedgerAccount, 'account_code' | 'type'>): TipoNaturaleza {
  return mayor.type === 'asset' || mayor.type === 'expense' ? 'D' : mayor.type ? 'C' : naturalezaCuenta(mayor.account_code);
}

export function saldoMayor(saldo: number, mayor: Pick<LedgerAccount, 'account_code' | 'type'>) {
  return saldoConNaturaleza(saldo, naturalezaMayor(mayor));
}

/** Descripción de la línea; si no tiene, la del asiento. */
export function descripcionLinea(linea: Pick<LedgerEntry, 'description' | 'memo'>): string | null {
  return linea.description?.trim() || linea.memo?.trim() || null;
}

/** `?cuenta=` seguro (lo mismo que acepta la redirección vieja). */
export function cuentaDeUrl(valor: string | null | undefined): string | null {
  return valor && /^[\w.-]{1,30}$/.test(valor) ? valor : null;
}
