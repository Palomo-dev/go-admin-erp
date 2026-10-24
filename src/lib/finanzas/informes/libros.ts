import { movimientosContabilizados, type CuentaInforme, type MovimientoInforme } from './estados';
import { codigoNormalizado, cuentasBajoPrefijo } from '@/lib/finanzas/pucPrefijo';
import { codigoEnNivel, type NivelPuc } from '@/lib/finanzas/reportes/nivelesPuc';

export interface MovimientoLibro extends MovimientoInforme {
  branch_id?: number | null;
  cost_center_id?: string | number | null;
  cost_center_name?: string | null;
  tercero_id?: string | number | null;
  tercero_nit?: string | null;
  tercero_nombre?: string | null;
  memo?: string | null;
  source_id?: string | null;
}

export interface EntradaLibros {
  cuentas: CuentaInforme[];
  movimientos: MovimientoLibro[];
  desde: string;
  hasta: string;
  /** Longitud PUC: 1, 2, 4, 6; 99 conserva las cuentas de movimiento. */
  nivel?: number;
}

export interface FilaMayor {
  codigo: string;
  nombre: string;
  clase: string;
  saldoInicial: number;
  debitos: number;
  creditos: number;
  saldoFinal: number;
  /** Efecto de anulaciones posteriores al saldo inicial, sin inventar asientos. */
  ajusteAnulaciones: number;
}

export interface FilaAuxiliar {
  id: string;
  asiento: string | number;
  fecha: string;
  documento: string;
  codigo: string;
  nombre: string;
  centro: string;
  centroId: string | number | null;
  tercero: string;
  terceroDocumento: string;
  debito: number;
  credito: number;
  saldoInicial: number;
  saldo: number;
  ajusteAnulaciones: number;
  tipo: 'saldo_inicial' | 'movimiento' | 'ajuste_anulacion';
}

/** Esquema stock_movements verificado por MCP; nunca se usa stock_levels para un corte pasado. */
export interface MovimientoStockInforme {
  id: number;
  organization_id: number;
  branch_id: number;
  product_id: number;
  direction: string;
  qty: number;
  unit_cost: number;
  source: string;
  source_id: string | null;
  created_at: string;
  avg_cost_after?: number | null;
  /** Se calcula con la zona de la organización en el servidor. */
  fecha?: string;
}

export interface FilaKardex {
  id: number;
  productoId: number;
  sedeId: number;
  fecha: string;
  documento: string;
  tipo: 'entrada' | 'salida' | 'ajuste' | 'traslado';
  cantidad: number;
  costoUnitario: number;
  saldoCantidad: number;
  costoPromedio: number;
  saldoValorizado: number;
  advertencia?: string;
}

export interface SaldoInventarioSede {
  sedeId: number;
  valorKardex: number;
  saldo1435: number;
  diferencia: number;
}

const valor = (n: number): number => {
  if (!Number.isFinite(n)) throw new Error('El libro contiene un importe no finito.');
  return n;
};

/** Un saldo deudor en 3610 representa pérdida; las demás cuentas siguen su naturaleza PUC. */
const signo = (codigo: string): number => {
  const normalizado = codigoNormalizado(codigo);
  return /^[1567]/.test(normalizado) || normalizado.startsWith('3610') ? 1 : -1;
};
const neto = (m: MovimientoInforme): number => valor(m.debit) - valor(m.credit);
const vigente = (m: MovimientoInforme, corte: string, estricto = false): boolean =>
  movimientosContabilizados([m], corte, estricto).length === 1;
const codigoOriginal = (cuenta: { account_code: string; account_code_original?: string }): string => cuenta.account_code_original ?? cuenta.account_code;

function validarPeriodo(desde: string, hasta: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    throw new Error('El rango del libro no es válido.');
  }
}

/** Agrupa exclusivamente saldos propios; no duplica títulos PUC con sus auxiliares. */
export function mayorConsolidado(entrada: EntradaLibros): FilaMayor[] {
  validarPeriodo(entrada.desde, entrada.hasta);
  const { cuentas, movimientos, desde, hasta, nivel = 99 } = entrada;
  if (![1, 2, 4, 6, 99].includes(nivel)) throw new Error('El nivel PUC no es válido.');
  const nivelPuc = ({ 1: 'clase', 2: 'grupo', 4: 'cuenta', 6: 'subcuenta', 99: 'auxiliar' } as Record<number, NivelPuc>)[nivel];
  const nombres = new Map(cuentas.map((c) => [nivel === 99 ? codigoOriginal(c) : codigoNormalizado(c.account_code), c.name]));
  const filas = new Map<string, FilaMayor>();
  const obtener = (codigo: string) => {
    // La FK conserva el código histórico con guion; el nivel PUC usa dígitos.
    const clave = codigoEnNivel(codigo, nivelPuc);
    let fila = filas.get(clave);
    if (!fila) {
      fila = { codigo: clave, nombre: nombres.get(clave) ?? clave, clase: clave.charAt(0), saldoInicial: 0, debitos: 0, creditos: 0, saldoFinal: 0, ajusteAnulaciones: 0 };
      filas.set(clave, fila);
    }
    return fila;
  };
  for (const cuenta of cuentas) obtener(codigoOriginal(cuenta));
  for (const m of movimientos) {
    if (m.entry_date > hasta || !m.posted || m.voided) continue;
    const fila = obtener(codigoOriginal(m));
    // Al agrupar pérdidas en 36 o patrimonio, su débito disminuye el grupo.
    const s = signo(fila.codigo);
    if (m.entry_date < desde && vigente(m, desde, true)) fila.saldoInicial += neto(m) * s;
    if (!vigente(m, hasta)) continue;
    fila.saldoFinal += neto(m) * s;
    if (m.entry_date >= desde) {
      fila.debitos += valor(m.debit);
      fila.creditos += valor(m.credit);
    }
  }
  for (const fila of filas.values()) {
    fila.ajusteAnulaciones = fila.saldoFinal - fila.saldoInicial - (fila.debitos - fila.creditos) * signo(fila.codigo);
  }
  return [...filas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Saldo corrido por cuenta; en modo costo, por cuenta × centro × tercero. */
export function auxiliarContable(entrada: EntradaLibros, porCentro = false, cuenta?: string): FilaAuxiliar[] {
  validarPeriodo(entrada.desde, entrada.hasta);
  const { desde, hasta } = entrada;
  const nombres = new Map(entrada.cuentas.map((c) => [codigoOriginal(c), c.name]));
  const codigos = [...new Set(entrada.movimientos.map(codigoOriginal))];
  const bajoPrefijo = new Set(cuenta ? cuentasBajoPrefijo(cuenta, codigos) : codigos);
  const seleccion = entrada.movimientos.filter((m) => bajoPrefijo.has(codigoOriginal(m)));
  const clave = (m: MovimientoLibro) => JSON.stringify([codigoOriginal(m), ...(porCentro ? [m.cost_center_id ?? null, m.tercero_id ?? m.tercero_nit ?? null] : [])]);
  const iniciales = new Map<string, number>();
  const referencias = new Map<string, MovimientoLibro>();
  for (const m of seleccion) {
    referencias.set(clave(m), m);
    if (m.entry_date < desde && vigente(m, desde, true)) iniciales.set(clave(m), (iniciales.get(clave(m)) ?? 0) + neto(m) * signo(m.account_code));
  }
  const saldos = new Map(iniciales);
  const filas: FilaAuxiliar[] = [];
  const crearFila = (m: MovimientoLibro, tipo: FilaAuxiliar['tipo'], fecha: string, documento: string, debito: number, credito: number, ajuste = 0): FilaAuxiliar => {
    const k = clave(m);
    const codigo = codigoOriginal(m);
    return { id: `${tipo}-${m.id ?? `${m.entry_id}-${filas.length}`}-${fecha}`, asiento: m.entry_id, fecha, documento, codigo, nombre: nombres.get(codigo) ?? codigo, centro: m.cost_center_name ?? String(m.cost_center_id ?? 'Sin centro'), centroId: m.cost_center_id ?? null, tercero: m.tercero_nombre ?? 'Sin tercero', terceroDocumento: m.tercero_nit ?? '', debito, credito, saldoInicial: iniciales.get(k) ?? 0, saldo: saldos.get(k) ?? 0, ajusteAnulaciones: ajuste, tipo };
  };
  for (const [k, saldo] of iniciales) {
    if (saldo === 0) continue;
    filas.push(crearFila(referencias.get(k)!, 'saldo_inicial', desde, 'Saldo inicial', 0, 0));
  }
  const movimientosPeriodo = (movimientosContabilizados(seleccion, hasta) as MovimientoLibro[])
    .filter((m) => m.entry_date >= desde && m.entry_date <= hasta)
    .map((m) => ({ m, fecha: m.entry_date, ajuste: 0 }));
  // Una anulación que ocurre en el rango puede retirar un saldo anterior.
  // Su efecto se identifica aparte: no se fabrica un débito/crédito contabilizado.
  const anulaciones = seleccion.filter((m) => m.entry_date < desde).flatMap((m) =>
    [...new Set([m.anulado_desde, m.anulado_hasta])].filter((fecha): fecha is string => Boolean(fecha) && fecha! >= desde && fecha! <= hasta)
      .map((fecha) => ({ m, fecha, ajuste: (Number(vigente(m, fecha)) - Number(vigente(m, fecha, true))) * neto(m) * signo(m.account_code) }))
      .filter((evento) => evento.ajuste !== 0));
  const ordenados = [...movimientosPeriodo, ...anulaciones].sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.m.entry_id).localeCompare(String(b.m.entry_id), undefined, { numeric: true }) || String(a.m.id ?? '').localeCompare(String(b.m.id ?? ''), undefined, { numeric: true }));
  for (const { m, fecha, ajuste } of ordenados) {
    const k = clave(m);
    const saldo = (saldos.get(k) ?? 0) + (ajuste || neto(m) * signo(m.account_code));
    saldos.set(k, saldo);
    filas.push(crearFila(m, ajuste ? 'ajuste_anulacion' : 'movimiento', fecha, ajuste ? `Efecto de anulación/restauración del asiento ${m.entry_id}; no es un asiento nuevo` : m.memo ?? `${m.source ?? 'Asiento'} ${m.source_id ?? m.entry_id}`, ajuste ? 0 : m.debit, ajuste ? 0 : m.credit, ajuste));
  }
  return filas.sort((a, b) => a.codigo.localeCompare(b.codigo) || (porCentro ? a.centro.localeCompare(b.centro) || a.terceroDocumento.localeCompare(b.terceroDocumento) : 0) || a.fecha.localeCompare(b.fecha) || (a.tipo === 'saldo_inicial' ? -1 : b.tipo === 'saldo_inicial' ? 1 : 0));
}

/** Promedio ponderado por producto y sede, sin redondear costos intermedios. */
export function kardexValorizado(movimientos: MovimientoStockInforme[], hasta?: string): FilaKardex[] {
  const saldos = new Map<string, { cantidad: number; valor: number; promedio: number }>();
  const filas: FilaKardex[] = [];
  for (const m of [...movimientos].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)) {
    if (hasta && !m.fecha) throw new Error('El kárdex al corte requiere la fecha contable en la zona de la organización.');
    const fecha = m.fecha ?? m.created_at;
    if (hasta && fecha > hasta) continue;
    const k = `${m.branch_id}:${m.product_id}`;
    const saldo = saldos.get(k) ?? { cantidad: 0, valor: 0, promedio: 0 };
    const cantidad = Math.abs(valor(Number(m.qty)));
    const entrada = m.direction === 'in' || m.direction === 'entrada';
    if (!entrada && m.direction !== 'out' && m.direction !== 'salida') throw new Error('El movimiento de inventario tiene una dirección desconocida.');
    const costo = entrada ? valor(Number(m.unit_cost)) : saldo.promedio;
    if (costo < 0) throw new Error('El costo de inventario no puede ser negativo.');
    saldo.cantidad += entrada ? cantidad : -cantidad;
    saldo.valor += (entrada ? 1 : -1) * cantidad * costo;
    if (saldo.cantidad > 0) saldo.promedio = saldo.valor / saldo.cantidad;
    if (Math.abs(saldo.cantidad) < 1e-9) { saldo.cantidad = 0; saldo.valor = 0; }
    saldos.set(k, saldo);
    filas.push({ id: m.id, productoId: m.product_id, sedeId: m.branch_id, fecha, documento: `${m.source}${m.source_id ? ` ${m.source_id}` : ''}`, tipo: /transfer|traslado/.test(m.source) ? 'traslado' : /adjust|ajuste|count|conteo/.test(m.source) ? 'ajuste' : entrada ? 'entrada' : 'salida', cantidad: entrada ? cantidad : -cantidad, costoUnitario: costo, saldoCantidad: saldo.cantidad, costoPromedio: saldo.promedio, saldoValorizado: saldo.valor, ...(saldo.cantidad < 0 ? { advertencia: `Producto ${m.product_id}, sede ${m.branch_id}: saldo negativo; revise el historial y el costo antes de presentar el informe.` } : {}) });
  }
  return filas;
}

/** Último saldo histórico de cada par producto/sede frente al auxiliar 1435 de esa sede. */
export function conciliarInventario1435(kardex: FilaKardex[], movimientos: MovimientoLibro[], hasta: string): SaldoInventarioSede[] {
  const productos = new Map<string, FilaKardex>();
  for (const fila of [...kardex].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)) {
    if (fila.fecha <= hasta) productos.set(`${fila.sedeId}:${fila.productoId}`, fila);
  }
  const sedes = new Map<number, SaldoInventarioSede>();
  const obtener = (sedeId: number) => {
    let fila = sedes.get(sedeId);
    if (!fila) { fila = { sedeId, valorKardex: 0, saldo1435: 0, diferencia: 0 }; sedes.set(sedeId, fila); }
    return fila;
  };
  for (const p of productos.values()) obtener(p.sedeId).valorKardex += p.saldoValorizado;
  const cuentas1435 = new Set(cuentasBajoPrefijo('1435', [...new Set(movimientos.map((m) => m.account_code))]).map(codigoNormalizado));
  for (const m of movimientosContabilizados(movimientos, hasta) as MovimientoLibro[]) {
    if (!cuentas1435.has(m.account_code) || m.entry_date > hasta) continue;
    obtener(m.branch_id ?? 0).saldo1435 += neto(m);
  }
  for (const fila of sedes.values()) fila.diferencia = fila.valorKardex - fila.saldo1435;
  return [...sedes.values()].sort((a, b) => a.sedeId - b.sedeId);
}

export function libroInventariosBalances(entrada: EntradaLibros): FilaMayor[] {
  return mayorConsolidado(entrada).filter((f) => /^[123]/.test(f.codigo));
}
