/**
 * Bandeja de pendientes contables: de un rechazo de `journal_entry_failures` a
 * lo que la persona necesita saber (qué falló, qué falta, quién responde y dónde
 * se arregla). Los pendientes no entran al mayor: nada aquí escribe.
 *
 * Módulo hoja: sin Supabase ni React. Los textos salen de `pendientesContables`
 * en messages/*.json con las claves que devuelve este módulo.
 */

import { MOTIVO_REDONDEO, MOTIVOS_REVERSA } from './contabilidad/redondeoReversa';

export interface FilaPendiente {
  id: number;
  fecha: string | null;
  creado: string;
  dias: number;
  origen: string | null;
  origenId: string | null;
  documento: string | null;
  clave: string | null;
  debito: string | null;
  credito: string | null;
  importe: number | null;
  motivo: string;
  detalle: string | null;
  sede: string | null;
  intentos: number;
  ultimoIntento: string | null;
  periodoCerrado: boolean;
  reintentable: boolean;
}

export interface ResumenPendientes {
  pendientes: number;
  masAntiguoDias: number | null;
  bloqueanCierre: number;
  periodoInicio: string | null;
  valor: number;
  totalFiltradas: number;
  filas: FilaPendiente[];
}

export type ErrorPendiente =
  | 'redondeoSinCuenta'
  | 'reversaCuentaTitulo'
  | 'reversaLineaSinCuenta'
  | 'periodoCerrado'
  | 'terceroRequerido'
  | 'cuentaNoExiste'
  | 'sinRegla'
  | 'reglaIncompleta'
  | 'mismaCuenta'
  | 'cuentaSinConfigurar'
  | 'cuentaDeTitulo'
  | 'importeInvalido'
  | 'sinSede'
  | 'impuestoMixto'
  | 'otro';

export type AccionPendiente =
  | 'configurarRedondeo'
  | 'asignarCuenta'
  | 'reabrirPeriodo'
  | 'completarTercero'
  | 'corregirRegla'
  | 'configurar'
  | 'elegirAuxiliar'
  | 'verDetalle';

export type ResponsablePendiente = 'contador' | 'compras' | 'ventas' | 'tesoreria' | 'inventario';

export type DatoFaltante =
  | { tipo: 'cuenta'; cuenta: string }
  | { tipo: 'redondeo' | 'auxiliar' | 'periodo' | 'tercero' | 'regla' | 'configuracion' | 'importe' | 'sede' | 'impuesto' | 'revisar' };

export type TipoDocumento =
  | 'factura'
  | 'compra'
  | 'venta'
  | 'ajuste'
  | 'caja'
  | 'banco'
  | 'transferencia'
  | 'devolucion'
  | 'reversa'
  | 'otro';

const ERROR_POR_MOTIVO: Record<string, ErrorPendiente> = {
  [MOTIVO_REDONDEO]: 'redondeoSinCuenta',
  reversa_cuenta_titulo: 'reversaCuentaTitulo',
  linea_sin_cuenta: 'reversaLineaSinCuenta',
  period_closed: 'periodoCerrado',
  periodo_cerrado: 'periodoCerrado',
  tercero_requerido: 'terceroRequerido',
  retencion_sin_datos_tributarios: 'terceroRequerido',
  debit_account_missing: 'cuentaNoExiste',
  credit_account_missing: 'cuentaNoExiste',
  tax_account_missing: 'cuentaNoExiste',
  discount_account_missing: 'cuentaNoExiste',
  cuenta_no_existe: 'cuentaNoExiste',
  no_rule: 'sinRegla',
  account_null: 'reglaIncompleta',
  same_account: 'mismaCuenta',
  cuenta_no_configurada: 'cuentaSinConfigurar',
  cuenta_banco_sin_puc: 'cuentaSinConfigurar',
  sin_cuenta: 'cuentaSinConfigurar',
  cuenta_no_es_de_movimiento: 'cuentaDeTitulo',
  cuenta_de_titulo: 'cuentaDeTitulo',
  cuenta_linea: 'cuentaDeTitulo',
  amount_invalid: 'importeInvalido',
  no_branch: 'sinSede',
  impuesto_mixto_inc_iva: 'impuestoMixto',
};

const TIPO_POR_ORIGEN: Record<string, TipoDocumento> = {
  invoice_sales: 'factura',
  invoice_purchase: 'compra',
  sales: 'venta',
  stock_movements: 'ajuste',
  inventory_adjustment: 'ajuste',
  cash_movements: 'caja',
  bank_transactions: 'banco',
  bank_transfers: 'transferencia',
  returns: 'devolucion',
  reversal: 'reversa',
};

export function errorDePendiente(motivo: string): ErrorPendiente {
  return ERROR_POR_MOTIVO[motivo] ?? 'otro';
}

export function tipoDocumento(origen: string | null): TipoDocumento {
  return (origen && TIPO_POR_ORIGEN[origen]) || 'otro';
}

function areaDeOrigen(origen: string | null): ResponsablePendiente {
  switch (tipoDocumento(origen)) {
    case 'compra':
      return 'compras';
    case 'factura':
    case 'venta':
    case 'devolucion':
      return 'ventas';
    case 'caja':
    case 'banco':
    case 'transferencia':
      return 'tesoreria';
    case 'ajuste':
      return 'inventario';
    default:
      return 'contador';
  }
}

/** Reglas, plan de cuentas y periodos son del Contador. El dato del documento, de su área. */
export function responsableDe(fila: Pick<FilaPendiente, 'motivo' | 'origen'>): ResponsablePendiente {
  const error = errorDePendiente(fila.motivo);
  if (error === 'terceroRequerido' || error === 'importeInvalido' || error === 'sinSede') {
    return areaDeOrigen(fila.origen);
  }
  if (error === 'cuentaDeTitulo') {
    return areaDeOrigen(fila.origen) === 'tesoreria' ? 'tesoreria' : 'contador';
  }
  return 'contador';
}

function hrefDocumento(fila: Pick<FilaPendiente, 'origen' | 'origenId'>): string | null {
  if (!fila.origenId) return null;
  if (fila.origen === 'invoice_sales') return `/app/finanzas/facturas-venta/${fila.origenId}`;
  if (fila.origen === 'invoice_purchase') return `/app/finanzas/facturas-compra/${fila.origenId}`;
  return null;
}

export interface AccionResolver {
  accion: AccionPendiente;
  /** `null`: se resuelve dentro del panel de detalle. */
  href: string | null;
}

export function accionDe(fila: Pick<FilaPendiente, 'id' | 'motivo' | 'origen' | 'origenId'>): AccionResolver {
  // Se resuelven en su propia página: asiento propuesto o auxiliar de cada línea.
  const pagina = `/app/finanzas/contabilidad/pendientes/${fila.id}`;
  switch (errorDePendiente(fila.motivo)) {
    case 'redondeoSinCuenta':
      return { accion: 'configurarRedondeo', href: pagina };
    case 'reversaCuentaTitulo':
      return { accion: 'elegirAuxiliar', href: pagina };
    case 'reversaLineaSinCuenta':
      return { accion: 'asignarCuenta', href: pagina };
    case 'periodoCerrado':
      return { accion: 'reabrirPeriodo', href: '/app/finanzas/contabilidad/periodos-fiscales' };
    case 'terceroRequerido': {
      const href = hrefDocumento(fila);
      return href ? { accion: 'completarTercero', href } : { accion: 'verDetalle', href: null };
    }
    case 'cuentaNoExiste':
    case 'sinRegla':
    case 'reglaIncompleta':
    case 'mismaCuenta':
      return { accion: 'corregirRegla', href: '/app/finanzas/reglas-contables' };
    case 'cuentaSinConfigurar':
    case 'impuestoMixto':
      return { accion: 'configurar', href: '/app/finanzas/configuracion-contable' };
    case 'cuentaDeTitulo':
      return { accion: 'elegirAuxiliar', href: '/app/finanzas/contabilidad/plan-cuentas' };
    default:
      return { accion: 'verDetalle', href: null };
  }
}

/** Lo que falta para contabilizar: la cuenta exacta cuando se conoce. */
export function datoFaltante(fila: Pick<FilaPendiente, 'motivo' | 'debito' | 'credito'>): DatoFaltante {
  const cuenta = (codigo: string | null, tipo: 'configuracion' | 'revisar'): DatoFaltante =>
    codigo ? { tipo: 'cuenta', cuenta: codigo } : { tipo };
  switch (fila.motivo) {
    case 'debit_account_missing':
      return cuenta(fila.debito, 'revisar');
    case 'credit_account_missing':
      return cuenta(fila.credito, 'revisar');
    case 'cuenta_no_es_de_movimiento':
    case 'cuenta_de_titulo':
    case 'cuenta_linea':
      return cuenta(fila.debito ?? fila.credito, 'revisar');
    default:
      break;
  }
  switch (errorDePendiente(fila.motivo)) {
    case 'redondeoSinCuenta':
      return { tipo: 'redondeo' };
    case 'reversaCuentaTitulo':
    case 'reversaLineaSinCuenta':
      return { tipo: 'auxiliar' };
    case 'periodoCerrado':
      return { tipo: 'periodo' };
    case 'terceroRequerido':
      return { tipo: 'tercero' };
    case 'sinRegla':
    case 'reglaIncompleta':
    case 'mismaCuenta':
      return { tipo: 'regla' };
    case 'cuentaSinConfigurar':
      return { tipo: 'configuracion' };
    case 'importeInvalido':
      return { tipo: 'importe' };
    case 'sinSede':
      return { tipo: 'sede' };
    case 'impuestoMixto':
      return { tipo: 'impuesto' };
    default:
      return { tipo: 'revisar' };
  }
}

export type EstadoReintento =
  | 'resuelto'
  | 'ya_resuelto'
  | 'periodo_cerrado'
  | 'no_reintentable'
  | 'faltan_cuentas'
  | 'sigue';

/** Las reversas exigen «Revertir asientos»: el servidor lo valida al reintentar. */
export function esReversa(motivo: string): boolean {
  return (MOTIVOS_REVERSA as readonly string[]).includes(motivo);
}

/**
 * Lo que muestra un KPI. Un error nunca se muestra como cero: sin datos el valor
 * es `null` y la pantalla pinta «—».
 */
export function kpisDe(resumen: ResumenPendientes | null) {
  return {
    pendientes: resumen ? resumen.pendientes : null,
    masAntiguoDias: resumen ? resumen.masAntiguoDias : null,
    bloqueanCierre: resumen ? resumen.bloqueanCierre : null,
    valor: resumen ? resumen.valor : null,
  };
}

export const SIN_DATO = '—';

export function celdasCsv(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  // Evita que una hoja de cálculo interprete el texto como fórmula.
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return /[",\n;]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}
