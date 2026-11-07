/**
 * Cuadre de un asiento: Σ débitos frente a Σ créditos. Sin React.
 *
 * La tolerancia es medio centavo: los importes llegan de `numeric` y el
 * navegador los suma en coma flotante.
 */
export const TOLERANCIA_CUADRE = 0.005;

export interface LineaImporte {
  debit?: number | string | null;
  credit?: number | string | null;
}

export interface Cuadre {
  debitos: number;
  creditos: number;
  /** Débitos − créditos; positivo: sobran débitos. */
  diferencia: number;
  cuadra: boolean;
  /** Sin importes: ni cuadra ni descuadra (formulario vacío). */
  vacio: boolean;
}

function numero(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Redondea a centavos para no arrastrar 0,1 + 0,2. */
function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cuadreDe(lineas: readonly LineaImporte[]): Cuadre {
  let debitos = 0;
  let creditos = 0;
  for (const l of lineas) {
    debitos += numero(l.debit);
    creditos += numero(l.credit);
  }
  debitos = centavos(debitos);
  creditos = centavos(creditos);
  const diferencia = centavos(debitos - creditos);
  const vacio = debitos === 0 && creditos === 0;
  return { debitos, creditos, diferencia, cuadra: !vacio && Math.abs(diferencia) < TOLERANCIA_CUADRE, vacio };
}

export type TipoNaturaleza = 'D' | 'C';

/**
 * Naturaleza de una cuenta por su clase PUC (1, 5, 6, 7 débito; 2, 3, 4
 * crédito) o por su tipo cuando el código no lo dice.
 */
export function naturalezaCuenta(codigo: string, tipo?: string | null): TipoNaturaleza {
  const clase = codigo.trim().charAt(0);
  if (['1', '5', '6', '7'].includes(clase)) return 'D';
  if (['2', '3', '4'].includes(clase)) return 'C';
  return tipo === 'liability' || tipo === 'equity' || tipo === 'income' ? 'C' : 'D';
}

/**
 * Saldo con su naturaleza para mostrar «$ 4.230.000 D». Un saldo negativo en
 * su naturaleza se muestra positivo en la contraria.
 */
export function saldoConNaturaleza(saldo: number, naturaleza: TipoNaturaleza): { valor: number; lado: TipoNaturaleza | null } {
  if (Math.abs(saldo) < TOLERANCIA_CUADRE) return { valor: 0, lado: null };
  if (saldo > 0) return { valor: saldo, lado: naturaleza };
  return { valor: -saldo, lado: naturaleza === 'D' ? 'C' : 'D' };
}
