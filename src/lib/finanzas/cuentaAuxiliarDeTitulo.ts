/**
 * Equivalente TS de `public.fn_cuenta_auxiliar_de_titulo` (migración 20261025134030).
 * Orden: 1) mapeo por clave/sede, 2) auxiliar estándar del título. Una cuenta de
 * grupo que pasa a título (4295, 3705, 6135, 530515, 5395, 2408, 240805, 240810)
 * nunca se devuelve: se publica siempre al auxiliar de movimiento.
 */
export type LadoIva = 'descontable' | 'generado';

export interface OpcionesResolucion {
  /** Mapeo de la sede (branch_account_mappings) o de la clave configurada: código de grupo → auxiliar. */
  mapeoSede?: Readonly<Partial<Record<string, string | null | undefined>>>;
  /** Tarifa de IVA; 5 elige el auxiliar 02 de 240805/240810. */
  tarifa?: number | null;
  lado?: LadoIva | 'compra' | 'purchase' | null;
}

const AUXILIAR: Readonly<Record<string, string>> = {
  '4295': '42959501',
  '3705': '37050502',
  '6135': '61350501',
  '530515': '53051501',
  '5395': '53959501',
};

export const CUENTAS_TITULO_P1 = ['3705', '6135', '4295', '530515', '5395', '2408', '240805', '240810'] as const;

export function cuentaAuxiliarDeTitulo(codigo: string, op: OpcionesResolucion = {}): string {
  const code = codigo.trim();
  const mapeado = op.mapeoSede?.[code]?.trim();
  if (mapeado && !(CUENTAS_TITULO_P1 as readonly string[]).includes(mapeado)) return mapeado;
  if (AUXILIAR[code]) return AUXILIAR[code];
  const t5 = op.tarifa === 5;
  if (code === '240805') return t5 ? '24080502' : '24080501';
  if (code === '240810') return t5 ? '24081002' : '24081001';
  if (code === '2408') {
    const descontable = op.lado === 'descontable' || op.lado === 'compra' || op.lado === 'purchase';
    return descontable ? (t5 ? '24081002' : '24081001') : (t5 ? '24080502' : '24080501');
  }
  return code;
}
