/**
 * Categorías de tesorería: catálogo predefinido, vista previa del asiento
 * y reporte por mes y sede. Módulo hoja, sin Supabase ni React.
 *
 * La vista previa de la pantalla la calcula la RPC
 * `fn_vista_previa_asiento_tesoreria` (la caja real puede ser 110505 y no
 * 1105). Estas funciones fijan los mismos textos y las mismas reglas para
 * las pruebas.
 */
import { plainDateToInstant, toPlainDate } from '@/lib/utils/dateCore';

export type TipoCategoria = 'ingreso' | 'egreso';

export interface CategoriaPredefinida {
  tipo: TipoCategoria;
  clave: string;
  nombre: string;
  icono: string;
  /** Código PUC sugerido. Puede ser de título: al contabilizar se pide un auxiliar. */
  cuenta: string;
  orden: number;
  /** Alternativa o el motivo del código, cuando el catálogo ofrece más de uno. */
  ayuda: string;
}

/**
 * 38 categorías. Donde había dos códigos se guarda el primero; la ayuda
 * nombra el otro. Tres no traían código: devolución de proveedores (2205),
 * domicilios (5135) y retiros de socios (3105).
 */
export const PREDEFINIDAS: readonly CategoriaPredefinida[] = [
  { tipo: 'ingreso', clave: 'ventas_productos', nombre: 'Ventas de productos', icono: 'shopping-bag', cuenta: '4135', orden: 10, ayuda: 'Comercio al por mayor y al por menor.' },
  { tipo: 'ingreso', clave: 'servicios', nombre: 'Servicios', icono: 'wrench', cuenta: '4155', orden: 20, ayuda: 'Si el sector usa otra cuenta de actividad, cámbiela por esa.' },
  { tipo: 'ingreso', clave: 'arriendos_recibidos', nombre: 'Arriendos recibidos', icono: 'home', cuenta: '4220', orden: 30, ayuda: 'Arrendamientos.' },
  { tipo: 'ingreso', clave: 'intereses_recibidos', nombre: 'Intereses', icono: 'percent', cuenta: '421005', orden: 40, ayuda: 'Intereses recibidos.' },
  { tipo: 'ingreso', clave: 'comisiones_recibidas', nombre: 'Comisiones recibidas', icono: 'badge-percent', cuenta: '4235', orden: 50, ayuda: 'Comisiones.' },
  { tipo: 'ingreso', clave: 'reintegros', nombre: 'Reintegros y recuperaciones', icono: 'rotate-ccw', cuenta: '4250', orden: 60, ayuda: 'Reintegros y recuperaciones.' },
  { tipo: 'ingreso', clave: 'aportes_socios', nombre: 'Aportes de socios', icono: 'users', cuenta: '3105', orden: 70, ayuda: 'Capital social. No es un ingreso del estado de resultados.' },
  { tipo: 'ingreso', clave: 'prestamos_recibidos', nombre: 'Préstamos recibidos', icono: 'landmark', cuenta: '2105', orden: 80, ayuda: 'Bancos nacionales. La alternativa es 2195, otros préstamos.' },
  { tipo: 'ingreso', clave: 'anticipos_clientes', nombre: 'Anticipos de clientes', icono: 'wallet', cuenta: '2805', orden: 90, ayuda: 'Anticipos y avances recibidos.' },
  { tipo: 'ingreso', clave: 'cobro_cartera', nombre: 'Cobro de cartera', icono: 'receipt', cuenta: '1305', orden: 100, ayuda: 'Clientes. El cobro no es un ingreso nuevo.' },
  { tipo: 'ingreso', clave: 'devolucion_proveedores', nombre: 'Devolución de proveedores', icono: 'undo-2', cuenta: '2205', orden: 110, ayuda: 'El catálogo no traía código: se sugiere proveedores nacionales, 2205.' },
  { tipo: 'ingreso', clave: 'otros_ingresos', nombre: 'Otros ingresos', icono: 'circle-plus', cuenta: '4295', orden: 120, ayuda: 'Diversos.' },
  { tipo: 'egreso', clave: 'proveedores', nombre: 'Proveedores y compras', icono: 'truck', cuenta: '2205', orden: 10, ayuda: 'Proveedores nacionales. La alternativa es 1435, mercancías no fabricadas.' },
  { tipo: 'egreso', clave: 'nomina', nombre: 'Nómina', icono: 'users', cuenta: '5105', orden: 20, ayuda: 'Gastos de personal.' },
  { tipo: 'egreso', clave: 'seguridad_social', nombre: 'Seguridad social y parafiscales', icono: 'shield', cuenta: '5105', orden: 30, ayuda: 'Aportes sobre la nómina. El auxiliar se elige al guardar.' },
  { tipo: 'egreso', clave: 'arriendo', nombre: 'Arriendo', icono: 'home', cuenta: '5120', orden: 40, ayuda: 'Arrendamientos.' },
  { tipo: 'egreso', clave: 'energia', nombre: 'Energía', icono: 'zap', cuenta: '513530', orden: 50, ayuda: 'Energía eléctrica.' },
  { tipo: 'egreso', clave: 'agua', nombre: 'Agua', icono: 'droplet', cuenta: '513525', orden: 60, ayuda: 'Acueducto y alcantarillado.' },
  { tipo: 'egreso', clave: 'internet', nombre: 'Internet y telefonía', icono: 'wifi', cuenta: '513535', orden: 70, ayuda: 'La alternativa es 513540, transmisión y comunicaciones.' },
  { tipo: 'egreso', clave: 'transporte', nombre: 'Transporte y fletes', icono: 'truck', cuenta: '5135', orden: 80, ayuda: 'Servicios. La alternativa de ventas es 5235.' },
  { tipo: 'egreso', clave: 'publicidad', nombre: 'Publicidad', icono: 'megaphone', cuenta: '523560', orden: 90, ayuda: 'Publicidad y propaganda de ventas.' },
  { tipo: 'egreso', clave: 'mantenimiento', nombre: 'Mantenimiento', icono: 'wrench', cuenta: '5145', orden: 100, ayuda: 'Mantenimiento y reparaciones.' },
  { tipo: 'egreso', clave: 'papeleria', nombre: 'Papelería', icono: 'file-text', cuenta: '5195', orden: 110, ayuda: 'Diversos. Elija el auxiliar de papelería si existe.' },
  { tipo: 'egreso', clave: 'aseo', nombre: 'Aseo y cafetería', icono: 'coffee', cuenta: '5195', orden: 120, ayuda: 'Diversos. Elija el auxiliar de aseo si existe.' },
  { tipo: 'egreso', clave: 'honorarios', nombre: 'Honorarios', icono: 'briefcase', cuenta: '5110', orden: 130, ayuda: 'Honorarios.' },
  { tipo: 'egreso', clave: 'seguros', nombre: 'Seguros', icono: 'shield-check', cuenta: '5130', orden: 140, ayuda: 'Seguros.' },
  { tipo: 'egreso', clave: 'impuestos', nombre: 'Impuestos', icono: 'landmark', cuenta: '5115', orden: 150, ayuda: 'Gasto. Según el caso use 2408 (IVA) o 2365 (retención en la fuente).' },
  { tipo: 'egreso', clave: 'comisiones_bancarias', nombre: 'Comisiones bancarias', icono: 'landmark', cuenta: '530515', orden: 160, ayuda: 'Comisiones bancarias.' },
  { tipo: 'egreso', clave: 'gmf', nombre: 'GMF 4x1000', icono: 'banknote', cuenta: '511595', orden: 170, ayuda: 'Gravamen a los movimientos financieros.' },
  { tipo: 'egreso', clave: 'intereses_pagados', nombre: 'Intereses', icono: 'percent', cuenta: '530520', orden: 180, ayuda: 'Intereses pagados.' },
  { tipo: 'egreso', clave: 'software', nombre: 'Software y suscripciones', icono: 'monitor', cuenta: '5165', orden: 190, ayuda: 'La alternativa es 5195, diversos.' },
  { tipo: 'egreso', clave: 'combustible', nombre: 'Combustible', icono: 'fuel', cuenta: '5195', orden: 200, ayuda: 'Diversos. Elija el auxiliar de combustible si existe.' },
  { tipo: 'egreso', clave: 'viaticos', nombre: 'Viáticos', icono: 'plane', cuenta: '5155', orden: 210, ayuda: 'Gastos de viaje.' },
  { tipo: 'egreso', clave: 'domicilios', nombre: 'Domicilios', icono: 'bike', cuenta: '5135', orden: 220, ayuda: 'El catálogo no traía código: se sugiere servicios, 5135.' },
  { tipo: 'egreso', clave: 'pago_prestamos', nombre: 'Pago de préstamos', icono: 'landmark', cuenta: '2105', orden: 230, ayuda: 'Abono a bancos nacionales. No es un gasto.' },
  { tipo: 'egreso', clave: 'retiros_socios', nombre: 'Retiros de socios', icono: 'log-out', cuenta: '3105', orden: 240, ayuda: 'El catálogo no traía código: se sugiere capital social, 3105.' },
  { tipo: 'egreso', clave: 'devoluciones_clientes', nombre: 'Devoluciones a clientes', icono: 'undo-2', cuenta: '4175', orden: 250, ayuda: 'Devoluciones en ventas. Se debita contra el ingreso.' },
  { tipo: 'egreso', clave: 'otros_gastos', nombre: 'Otros gastos', icono: 'circle-minus', cuenta: '5195', orden: 260, ayuda: 'Diversos.' },
];

export const MENSAJE_ELIGE_CUENTA = 'Elige una cuenta de movimiento';
export const MENSAJE_SIN_TESORERIA = 'No hay cuenta de caja o banco para este movimiento';

export function mensajeCuentaAusente(codigo: string): string {
  return `La cuenta ${codigo} no está en el plan contable`;
}

export function mensajeCuentaNoMovimiento(codigo: string): string {
  return `La cuenta ${codigo} no es de movimiento`;
}

export function mensajeCuentasIguales(codigo: string): string {
  return `Las cuentas de débito y crédito quedaron iguales (${codigo})`;
}

export function mensajeEgresoContraIngreso(codigo: string): string {
  return `Un egreso no se debita contra una cuenta de ingreso (${codigo})`;
}

export function mensajeIngresoContraGasto(codigo: string): string {
  return `Un ingreso no se acredita contra una cuenta de gasto (${codigo})`;
}

export interface CuentaConocida {
  existe: boolean;
  /** false si es título o si `es_movimiento` es false. */
  esMovimiento: boolean;
}

export interface VistaPreviaAsiento {
  debito: string | null;
  credito: string | null;
  fallo: string | null;
}

function falloCuenta(codigo: string, cuentas: ReadonlyMap<string, CuentaConocida>): string | null {
  const cuenta = cuentas.get(codigo);
  if (!cuenta?.existe) return mensajeCuentaAusente(codigo);
  if (!cuenta.esMovimiento) return mensajeCuentaNoMovimiento(codigo);
  return null;
}

/**
 * Misma decisión que `fn_asiento_tesoreria_elegido`. `cuentas` describe el
 * plan ya resuelto (existencia y si se puede mover).
 */
export function vistaPreviaAsiento(args: {
  tipo: string;
  cuentaMovimiento: string | null | undefined;
  cuentaTesoreria: string | null | undefined;
  cuentas: ReadonlyMap<string, CuentaConocida>;
}): VistaPreviaAsiento {
  const movimiento = args.cuentaMovimiento?.trim() ?? '';
  const tesoreria = args.cuentaTesoreria?.trim() ?? '';
  if (!movimiento) return { debito: null, credito: null, fallo: MENSAJE_ELIGE_CUENTA };
  if (!tesoreria) return { debito: null, credito: null, fallo: MENSAJE_SIN_TESORERIA };

  const falloMovimiento = falloCuenta(movimiento, args.cuentas);
  if (falloMovimiento) return { debito: null, credito: null, fallo: falloMovimiento };
  const falloTesoreria = falloCuenta(tesoreria, args.cuentas);
  if (falloTesoreria) return { debito: null, credito: null, fallo: falloTesoreria };

  if (movimiento === tesoreria) {
    return { debito: null, credito: null, fallo: mensajeCuentasIguales(movimiento) };
  }
  if (args.tipo === 'out') {
    // 4175 es la devolución en ventas: el egreso sí se debita contra esa cuenta.
    if (movimiento.startsWith('4') && !movimiento.startsWith('4175')) {
      return { debito: null, credito: null, fallo: mensajeEgresoContraIngreso(movimiento) };
    }
    return { debito: movimiento, credito: tesoreria, fallo: null };
  }
  if (args.tipo === 'in') {
    if (movimiento.startsWith('5')) {
      return { debito: null, credito: null, fallo: mensajeIngresoContraGasto(movimiento) };
    }
    return { debito: tesoreria, credito: movimiento, fallo: null };
  }
  return { debito: null, credito: null, fallo: MENSAJE_ELIGE_CUENTA };
}

/**
 * Código que se puede sugerir. Un título (`es_movimiento` null) se conserva
 * para precargarlo; el usuario lo cambia por un auxiliar antes de guardar.
 * Una cuenta inactiva o con `es_movimiento` false no se sugiere.
 */
export function cuentaParaContabilizar(
  cuenta: { account_code?: string | null; is_active?: boolean | null; es_movimiento?: boolean | null } | null | undefined,
): string {
  if (!cuenta?.account_code) return '';
  if (cuenta.is_active === false) return '';
  if (cuenta.es_movimiento === false) return '';
  return cuenta.account_code;
}

export function padresValidos<T extends { id: number; padreId: number | null }>(
  categorias: readonly T[],
  idActual: number | null,
): T[] {
  if (idActual == null) return [...categorias];
  const bloqueados = new Set<number>([idActual]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const categoria of categorias) {
      if (categoria.padreId != null && bloqueados.has(categoria.padreId) && !bloqueados.has(categoria.id)) {
        bloqueados.add(categoria.id);
        cambio = true;
      }
    }
  }
  return categorias.filter((categoria) => !bloqueados.has(categoria.id));
}

/** Límites [desde, hasta) del mes calendario en la zona de la organización. */
export function limitesMes(mes: string, timezone: string): { desde: string; hasta: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('mes_invalido');
  const anio = Number(mes.slice(0, 4));
  const numero = Number(mes.slice(5, 7));
  const siguiente = numero === 12 ? `${anio + 1}-01-01` : `${anio}-${String(numero + 1).padStart(2, '0')}-01`;
  return {
    desde: plainDateToInstant(`${mes}-01`, timezone, '00:00'),
    hasta: plainDateToInstant(siguiente, timezone, '00:00'),
  };
}

export interface FilaCategoria {
  tipo: TipoCategoria;
  categoriaId: number | null;
  categoriaNombre: string | null;
  branchId: number | null;
  instante: string;
  monto: number;
}

export interface ResumenCategoria {
  categoriaId: number | null;
  nombre: string;
  tipo: TipoCategoria;
  movimientos: number;
  total: number;
}

const SIN_CATEGORIA = 'Sin categoría';

/**
 * Agrupa por categoría y tipo. `mes` es YYYY-MM en la zona indicada: un
 * movimiento de las 03:00 UTC del día 1 sigue siendo el mes anterior en
 * America/Bogota. `branchId` null incluye todas las sedes.
 */
export function resumirCategorias(
  filas: readonly FilaCategoria[],
  mes: string,
  timezone: string,
  branchId: number | null,
): ResumenCategoria[] {
  const grupos = new Map<string, ResumenCategoria>();
  for (const fila of filas) {
    if (branchId != null && fila.branchId !== branchId) continue;
    const dia = toPlainDate(new Date(fila.instante), timezone);
    if (!dia.startsWith(`${mes}-`)) continue;
    const clave = `${fila.tipo}:${fila.categoriaId ?? ''}`;
    const actual = grupos.get(clave) ?? {
      categoriaId: fila.categoriaId,
      nombre: fila.categoriaNombre?.trim() || SIN_CATEGORIA,
      tipo: fila.tipo,
      movimientos: 0,
      total: 0,
    };
    actual.movimientos += 1;
    actual.total += Math.abs(Number(fila.monto) || 0);
    grupos.set(clave, actual);
  }
  return [...grupos.values()].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'ingreso' ? -1 : 1;
    return b.total - a.total || a.nombre.localeCompare(b.nombre, 'es');
  });
}
