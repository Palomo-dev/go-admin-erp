/**
 * Cuentas de dinero (Tesorería v2, frames `1007:*`): cajas abiertas del POS +
 * cuentas bancarias. Presentación y cifras sin React ni Supabase.
 *
 * El saldo de una caja es el efectivo esperado que da el servidor
 * (`cajasComoCuentasDeDinero`): `null` cuando el cierre ciego lo oculta a
 * quien mira. Aquí nunca se recalcula.
 */

export const HORAS_CAJA_VENCIDA = 24;

export interface CajaDinero {
  sesion_id: number;
  uuid: string;
  alcance: 'sucursal' | 'todas' | 'usuario';
  sucursal: { id: number; nombre: string | null } | null;
  responsable: { id: string; nombre: string | null };
  abierta_desde: string;
  saldo: number | null;
  href: string;
}

export interface BancoDinero {
  id: number;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  account_type: string | null;
  currency: string | null;
  balance: number | string | null;
  is_active: boolean;
  account_code?: string | null;
  branch_id?: number | null;
}

/** «··4321»: nunca se muestra el número completo en listas. */
export function mascaraCuenta(numero: string | null | undefined): string {
  const digitos = (numero ?? '').replace(/\s+/g, '');
  if (!digitos) return '';
  return `··${digitos.slice(-4)}`;
}

/** Abierta hace más de 24 h: el turno quedó sin cerrar. */
export function cajaVencida(abiertaDesde: string, ahora: number = Date.now()): boolean {
  const t = Date.parse(abiertaDesde);
  if (!Number.isFinite(t)) return false;
  return ahora - t > HORAS_CAJA_VENCIDA * 3_600_000;
}

/** Horas que lleva abierta (entero, para «Vencida 26 h»). */
export function horasAbierta(abiertaDesde: string, ahora: number = Date.now()): number {
  const t = Date.parse(abiertaDesde);
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora - t) / 3_600_000)) : 0;
}

function n(v: number | string | null | undefined): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export interface ResumenCuentasDinero {
  /** Bancos activos en la moneda base + cajas visibles. */
  disponible: number;
  enBancos: number;
  /** `null`: alguna caja tiene el saldo oculto por cierre ciego. */
  enCajas: number | null;
  cajasAbiertas: number;
  cajasVencidas: number;
  cajasOcultas: number;
  bancos: number;
  bancosActivos: number;
  sinCuentaContable: number;
  /** Bancos activos en otra moneda: no se suman al total en la moneda base. */
  bancosOtraMoneda: number;
}

export function resumirCuentasDinero(
  bancos: readonly BancoDinero[],
  cajas: readonly CajaDinero[],
  monedaBase: string,
  ahora: number = Date.now(),
): ResumenCuentasDinero {
  const activos = bancos.filter((b) => b.is_active);
  const base = monedaBase.toUpperCase();
  const enBase = activos.filter((b) => !b.currency || b.currency.toUpperCase() === base);
  const enBancos = enBase.reduce((s, b) => s + n(b.balance), 0);
  const ocultas = cajas.filter((c) => c.saldo === null).length;
  const sumaCajas = cajas.reduce((s, c) => s + (c.saldo ?? 0), 0);
  return {
    disponible: enBancos + sumaCajas,
    enBancos,
    enCajas: ocultas > 0 ? null : sumaCajas,
    cajasAbiertas: cajas.length,
    cajasVencidas: cajas.filter((c) => cajaVencida(c.abierta_desde, ahora)).length,
    cajasOcultas: ocultas,
    bancos: bancos.length,
    bancosActivos: activos.length,
    sinCuentaContable: activos.filter((b) => !b.account_code).length,
    bancosOtraMoneda: activos.length - enBase.length,
  };
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Buscador de «Cuentas de dinero»: caja (sucursal, responsable) o banco (nombre, banco, últimos dígitos). */
export function filtrarCuentas<C extends CajaDinero, B extends BancoDinero>(
  cajas: readonly C[],
  bancos: readonly B[],
  termino: string,
): { cajas: C[]; bancos: B[] } {
  const q = normalizar(termino);
  if (!q) return { cajas: [...cajas], bancos: [...bancos] };
  const tiene = (...v: Array<string | null | undefined>) => v.some((x) => !!x && normalizar(x).includes(q));
  return {
    cajas: cajas.filter((c) => tiene(c.sucursal?.nombre, c.responsable.nombre, String(c.sesion_id))),
    bancos: bancos.filter((b) => tiene(b.name, b.bank_name, (b.account_number ?? '').slice(-4))),
  };
}

export type TipoCuentaBancaria = 'checking' | 'savings' | 'credit' | 'investment';
/** Tipos que ofrecía el formulario viejo (se conservan los cuatro). */
export const TIPOS_CUENTA_BANCARIA: readonly TipoCuentaBancaria[] = ['checking', 'savings', 'credit', 'investment'];

/** Catálogo de bancos del formulario viejo (Colombia) + «Otro». */
export const BANCOS_COMUNES: readonly string[] = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Banco Popular',
  'Banco Caja Social',
  'Scotiabank Colpatria',
  'Banco Agrario',
  'Banco AV Villas',
  'Banco Falabella',
  'Banco Pichincha',
  'Banco Itaú',
  'Otro',
];

export interface FormCuentaBancaria {
  name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  currency: string;
  account_code: string;
  initial_balance: number | null;
}

export type ErrorFormCuenta = 'nombre' | 'banco' | 'cuentaContable' | 'saldoInicial';

/** Las mismas reglas del formulario viejo: nombre, banco y PUC obligatorios; saldo inicial ≥ 0. */
export function validarCuentaBancaria(f: FormCuentaBancaria): ErrorFormCuenta[] {
  const errores: ErrorFormCuenta[] = [];
  if (!f.name.trim()) errores.push('nombre');
  if (!f.bank_name.trim()) errores.push('banco');
  if (!f.account_code) errores.push('cuentaContable');
  if (f.initial_balance !== null && (!Number.isFinite(f.initial_balance) || f.initial_balance < 0)) errores.push('saldoInicial');
  return errores;
}

export interface MovimientoBancoResumen {
  amount: number | string;
  status: string | null;
  trans_date: string | null;
  created_at: string;
}

export type FiltroConciliacion = 'todos' | 'pendientes' | 'conciliados';

/** Conciliado = `matched` o `reconciled` (como `estaConciliado`); pendiente = el resto. */
export function estaConciliadoBanco(status: string | null | undefined): boolean {
  return status === 'matched' || status === 'reconciled';
}

/**
 * Cifras del detalle de una cuenta bancaria (`1009:85377`): por conciliar
 * (conteo e importe absoluto) y movimientos del mes de la organización.
 */
export function resumirMovimientosBanco(
  txs: readonly MovimientoBancoResumen[],
  hoy: string,
  diaDe: (iso: string) => string,
): { porConciliar: number; importePorConciliar: number; mes: number; entradasMes: number; salidasMes: number } {
  const mes = hoy.slice(0, 7);
  const r = { porConciliar: 0, importePorConciliar: 0, mes: 0, entradasMes: 0, salidasMes: 0 };
  for (const tx of txs) {
    const monto = n(tx.amount);
    if (!estaConciliadoBanco(tx.status)) {
      r.porConciliar += 1;
      r.importePorConciliar += Math.abs(monto);
    }
    if (hoy && diaDe(tx.trans_date ?? tx.created_at).slice(0, 7) === mes) {
      r.mes += 1;
      if (monto >= 0) r.entradasMes += monto;
      else r.salidasMes += -monto;
    }
  }
  return r;
}

export function filtrarMovimientosBanco<T extends MovimientoBancoResumen & { description: string | null; reference: string | null }>(
  txs: readonly T[],
  filtro: FiltroConciliacion,
  termino: string,
): T[] {
  const q = normalizar(termino);
  return txs.filter((tx) => {
    if (filtro === 'pendientes' && estaConciliadoBanco(tx.status)) return false;
    if (filtro === 'conciliados' && !estaConciliadoBanco(tx.status)) return false;
    if (!q) return true;
    return [tx.description, tx.reference].some((v) => !!v && normalizar(v).includes(q));
  });
}

/** Resumen de un extracto importado: líneas, emparejadas, creadas desde el extracto y pendientes. */
export function resumirExtracto(lineas: readonly { estado: string; valor: number }[]): {
  lineas: number;
  emparejadas: number;
  creadas: number;
  pendientes: number;
  entradas: number;
  salidas: number;
} {
  const r = { lineas: lineas.length, emparejadas: 0, creadas: 0, pendientes: 0, entradas: 0, salidas: 0 };
  for (const l of lineas) {
    if (l.estado === 'emparejada') r.emparejadas += 1;
    else if (l.estado === 'creada') r.creadas += 1;
    else r.pendientes += 1;
    if (l.valor >= 0) r.entradas += l.valor;
    else r.salidas += -l.valor;
  }
  return r;
}
