/**
 * Cuentas por defecto de la organización (y, si se quiere, de una sede).
 *
 * Los disparadores no se reescriben: al armar el asiento, el código que trae
 * la regla se cambia por la cuenta configurada solo cuando hay una fila para
 * esa clave. Sin fila, el asiento usa el código de la regla, igual que antes.
 *
 * El origen que guarda el asiento no siempre es el de la regla. La venta
 * llega como `invoice_sales` y la regla dice `sale`; la propina llega como
 * `tips` y la regla dice `tip`. Las dos formas reconocen la misma clave.
 *
 * 5105 es gastos de personal en el PUC y aquí se usa para propina, nómina y
 * también para gastos, envíos y mantenimiento. Solo propina y nómina lo
 * reemplazan. 1110 y 1105 sí se reemplazan siempre: en las reglas son banco
 * y caja. Un auxiliar distinto (111005) no entra en la clave.
 */

export const CLAVES_CONTABLES = [
  'caja',
  'bancos',
  'clientes',
  'proveedores',
  'ventas_productos',
  'ventas_servicios',
  'devoluciones',
  'descuentos',
  'costo_ventas',
  'inventario',
  'iva_generado',
  'iva_descontable',
  'retefuente',
  'reteiva',
  'reteica',
  'propinas',
  'comisiones',
  'anticipos',
  'nomina',
  'nomina_por_pagar',
  'nomina_aportes',
  'faltante_inventario',
  'gastos_extraordinarios',
  'consumo_interno',
  'manifiesto_por_pagar',
  'manifiesto_transporte',
  'saldo_inicial',
  'impuesto_consumo',
  'redondeo',
  'compra_servicio',
] as const;

export type ClaveContable = (typeof CLAVES_CONTABLES)[number];

export type LadoCuenta = 'debito' | 'credito' | 'impuesto' | 'descuento';

export interface DefinicionClave {
  clave: ClaveContable;
  nombre: string;
  grupo: string;
  ayuda: string;
}

export const DEFINICIONES_CLAVE: DefinicionClave[] = [
  { clave: 'caja', nombre: 'Caja', grupo: 'Tesorería', ayuda: 'Reemplaza el 1105 cuando la regla usa caja.' },
  { clave: 'bancos', nombre: 'Bancos', grupo: 'Tesorería', ayuda: 'Reemplaza el 1110. El auxiliar de un banco concreto no se toca.' },
  { clave: 'anticipos', nombre: 'Anticipos', grupo: 'Tesorería', ayuda: 'Reemplaza el 2805, anticipos y avances recibidos.' },
  { clave: 'clientes', nombre: 'Clientes', grupo: 'Cartera', ayuda: 'Reemplaza el 1305, salvo préstamos a trabajadores.' },
  { clave: 'proveedores', nombre: 'Proveedores', grupo: 'Cartera', ayuda: 'Reemplaza el 2205 y el 2105 que las reglas viejas usaban como proveedores.' },
  { clave: 'ventas_productos', nombre: 'Ventas de productos', grupo: 'Ventas', ayuda: 'Ingreso al crédito en 4135, 414015, 4145 o 4105.' },
  { clave: 'ventas_servicios', nombre: 'Ventas de servicios', grupo: 'Ventas', ayuda: 'Ingreso al crédito en 4235, 4115, 4140 o 4155.' },
  { clave: 'devoluciones', nombre: 'Devoluciones', grupo: 'Ventas', ayuda: 'Notas crédito, anulaciones y el débito de una cuenta de ingreso.' },
  { clave: 'descuentos', nombre: 'Descuentos', grupo: 'Ventas', ayuda: 'La línea de descuento del asiento. No reemplaza la devolución.' },
  { clave: 'inventario', nombre: 'Inventario', grupo: 'Inventario', ayuda: 'Reemplaza el 1435 y el 1405 de las reglas viejas.' },
  { clave: 'costo_ventas', nombre: 'Costo de ventas', grupo: 'Inventario', ayuda: 'Reemplaza el 6135, el 6140 y el 6105.' },
  { clave: 'iva_generado', nombre: 'IVA generado', grupo: 'Impuestos', ayuda: 'IVA de la venta. Se acredita en 240805 y no se debita en el devengo.' },
  { clave: 'iva_descontable', nombre: 'IVA descontable', grupo: 'Impuestos', ayuda: 'IVA de la compra. Se debita en 240810.' },
  { clave: 'retefuente', nombre: 'ReteFuente', grupo: 'Impuestos', ayuda: 'Reemplaza el 2365 cuando la compra no tiene una cuenta propia en el impuesto.' },
  { clave: 'reteiva', nombre: 'ReteIVA', grupo: 'Impuestos', ayuda: 'Reemplaza el 2367.' },
  { clave: 'reteica', nombre: 'ReteICA', grupo: 'Impuestos', ayuda: 'Reemplaza el 2368.' },
  { clave: 'propinas', nombre: 'Propinas', grupo: 'Personal', ayuda: 'El 5105 solo cuando el documento es una propina.' },
  { clave: 'comisiones', nombre: 'Comisiones', grupo: 'Personal', ayuda: '529505. 5235 sigue reconociéndose en reglas anteriores.' },
  { clave: 'nomina', nombre: 'Nómina', grupo: 'Personal', ayuda: 'El 5105 solo cuando el documento es nómina.' },
  { clave: 'nomina_por_pagar', nombre: 'Nómina por pagar', grupo: 'Personal', ayuda: 'El 2505 solo en la nómina.' },
  { clave: 'nomina_aportes', nombre: 'Aportes de nómina', grupo: 'Personal', ayuda: 'El 2370 solo en la nómina. Una comisión que aún usa 2370 no se mueve.' },
  { clave: 'faltante_inventario', nombre: 'Faltante de inventario', grupo: 'Inventario', ayuda: 'Débito del faltante. Por defecto 519595. El costo de ventas no se usa aquí.' },
  { clave: 'gastos_extraordinarios', nombre: 'Robo y siniestro', grupo: 'Inventario', ayuda: 'Débito cuando el ajuste trae motivo robo o siniestro. Por defecto 5315.' },
  { clave: 'consumo_interno', nombre: 'Consumo interno', grupo: 'Inventario', ayuda: 'Débito del consumo interno. Por defecto 519595. Nunca la clase 6.' },
  { clave: 'manifiesto_por_pagar', nombre: 'Manifiesto por pagar', grupo: 'Cartera', ayuda: 'Crédito del manifiesto que no es de transporte. Por defecto 2205.' },
  { clave: 'manifiesto_transporte', nombre: 'Manifiesto de transporte', grupo: 'Cartera', ayuda: 'Crédito cuando la organización es de transporte. Por defecto 2335.' },
  { clave: 'saldo_inicial', nombre: 'Saldo inicial', grupo: 'Inventario', ayuda: 'Crédito del saldo inicial de inventario. Por defecto 3105.' },
  { clave: 'impuesto_consumo', nombre: 'Impuesto al consumo', grupo: 'Impuestos', ayuda: 'Impuesto al consumo. Por defecto 2495.' },
  { clave: 'redondeo', nombre: 'Redondeo', grupo: 'Ventas', ayuda: 'Diferencia al redondear un asiento a pesos. Por defecto 4295.' },
  { clave: 'compra_servicio', nombre: 'Compra de servicio', grupo: 'Cartera', ayuda: 'Crédito de una compra de servicio o de transporte. Por defecto 2335.' },
];

const NOMBRE_POR_CLAVE = new Map(DEFINICIONES_CLAVE.map((d) => [d.clave, d.nombre]));

export function nombreClave(clave: ClaveContable): string {
  return NOMBRE_POR_CLAVE.get(clave) ?? clave;
}

export function esClaveContable(valor: string): valor is ClaveContable {
  return (CLAVES_CONTABLES as readonly string[]).includes(valor);
}

const ORIGENES_PROPINA = new Set(['tip', 'tips']);
const ORIGENES_NOMINA = new Set(['payroll', 'payroll_slips', 'payroll_period', 'payroll_periods']);
const ORIGENES_PRESTAMO = new Set([
  'loan',
  'loans',
  'employee_loans',
  'installment',
  'installments',
  'loan_installments',
  'ap_installments',
]);
const ORIGENES_COMPRA = new Set([
  'purchase',
  'purchases',
  'invoice_purchase',
  'purchase_order',
  'purchase_orders',
]);

const CODIGOS_PRODUCTOS = new Set(['4105', '4135', '4110', '414015', '4145']);
const CODIGOS_SERVICIOS = new Set(['4235', '4115', '4140', '414005', '414095', '4155']);
const CODIGOS_INGRESO = new Set([...CODIGOS_PRODUCTOS, ...CODIGOS_SERVICIOS]);

export function claveDeCuenta(
  source: string | null | undefined,
  lado: LadoCuenta,
  codigo: string | null | undefined,
): ClaveContable | null {
  const code = (codigo ?? '').trim();
  const origen = (source ?? '').trim();
  if (!code) return null;

  if (code === '240810') return 'iva_descontable';
  if (code === '240805') return 'iva_generado';
  if (lado === 'impuesto' && (code === '2408' || code === '2405')) {
    return ORIGENES_COMPRA.has(origen) ? 'iva_descontable' : 'iva_generado';
  }
  if (lado === 'descuento' && code === '4175') return 'descuentos';
  if (code === '1105') return 'caja';
  if (code === '1110') return 'bancos';
  if (code === '1305' && !ORIGENES_PRESTAMO.has(origen)) return 'clientes';
  if (code === '2105' || code === '2205') return 'proveedores';
  if (code === '1405' || code === '1435') return 'inventario';
  if (code === '6105' || code === '6135' || code === '6140') return 'costo_ventas';
  if (code === '2365') return 'retefuente';
  if (code === '2367') return 'reteiva';
  if (code === '2368') return 'reteica';
  if (code === '2805') return 'anticipos';
  if (code === '5235' || code === '529505') return 'comisiones';
  if (code === '5105' && ORIGENES_PROPINA.has(origen)) return 'propinas';
  if (code === '5105' && ORIGENES_NOMINA.has(origen)) return 'nomina';
  if (code === '2505' && ORIGENES_NOMINA.has(origen)) return 'nomina_por_pagar';
  if (code === '2370' && ORIGENES_NOMINA.has(origen)) return 'nomina_aportes';
  if (code === '4175') return 'devoluciones';
  if (lado === 'debito' && CODIGOS_INGRESO.has(code)) return 'devoluciones';
  if (CODIGOS_PRODUCTOS.has(code)) return 'ventas_productos';
  if (CODIGOS_SERVICIOS.has(code)) return 'ventas_servicios';
  return null;
}

export interface FilaConfiguracion {
  clave: ClaveContable;
  account_code: string;
  branch_id: number | null;
}

export interface CuentaContable {
  account_code: string;
  name?: string;
  es_movimiento?: boolean | null;
  is_active?: boolean | null;
}

export function cuentaDeClave(
  filas: FilaConfiguracion[],
  clave: ClaveContable,
  branchId: number | null,
): string | null {
  if (branchId != null) {
    const deSede = filas.find((f) => f.clave === clave && f.branch_id === branchId);
    if (deSede) return deSede.account_code;
  }
  const deOrg = filas.find((f) => f.clave === clave && (f.branch_id == null));
  return deOrg?.account_code ?? null;
}

export function mensajeCuentaAusente(codigo: string, nombre: string): string {
  return `La cuenta configurada ${codigo} (${nombre}) no está en el plan contable`;
}

export function mensajeCuentaTitulo(codigo: string, nombre: string): string {
  return `La cuenta configurada ${codigo} (${nombre}) no es de movimiento`;
}

export function mensajeMismaCuenta(codigo: string): string {
  return `Las cuentas configuradas de débito y crédito quedaron iguales (${codigo})`;
}

export interface LadoResuelto {
  cuenta: string | null;
  fallo: string | null;
}

export function resolverLado(input: {
  source: string | null | undefined;
  lado: LadoCuenta;
  codigo: string | null | undefined;
  branchId: number | null;
  filas: FilaConfiguracion[];
  plan: CuentaContable[];
}): LadoResuelto {
  const original = (input.codigo ?? '').trim() || null;
  const clave = claveDeCuenta(input.source, input.lado, original);
  if (!clave || !original) return { cuenta: original, fallo: null };

  const configurada = cuentaDeClave(input.filas, clave, input.branchId);
  if (!configurada) return { cuenta: original, fallo: null };

  const nombre = nombreClave(clave);
  const enPlan = input.plan.find((c) => c.account_code === configurada);
  if (!enPlan) return { cuenta: configurada, fallo: mensajeCuentaAusente(configurada, nombre) };
  if (enPlan.es_movimiento === false) return { cuenta: configurada, fallo: mensajeCuentaTitulo(configurada, nombre) };
  return { cuenta: configurada, fallo: null };
}

export interface AsientoConfigurado {
  debito: string | null;
  credito: string | null;
  impuesto: string | null;
  fallo: string | null;
}

export function aplicarConfiguracion(input: {
  source: string | null | undefined;
  branchId: number | null;
  debito: string | null | undefined;
  credito: string | null | undefined;
  impuesto?: string | null;
  filas: FilaConfiguracion[];
  plan: CuentaContable[];
}): AsientoConfigurado {
  const debito = resolverLado({ ...input, lado: 'debito', codigo: input.debito });
  if (debito.fallo) {
    return { debito: debito.cuenta, credito: (input.credito ?? '').trim() || null, impuesto: input.impuesto ?? null, fallo: debito.fallo };
  }
  const credito = resolverLado({ ...input, lado: 'credito', codigo: input.credito });
  if (credito.fallo) {
    return { debito: debito.cuenta, credito: credito.cuenta, impuesto: input.impuesto ?? null, fallo: credito.fallo };
  }
  const impuesto = resolverLado({ ...input, lado: 'impuesto', codigo: input.impuesto });
  if (impuesto.fallo) {
    return { debito: debito.cuenta, credito: credito.cuenta, impuesto: impuesto.cuenta, fallo: impuesto.fallo };
  }
  if (debito.cuenta && credito.cuenta && debito.cuenta === credito.cuenta) {
    return {
      debito: debito.cuenta,
      credito: credito.cuenta,
      impuesto: impuesto.cuenta,
      fallo: mensajeMismaCuenta(debito.cuenta),
    };
  }
  return { debito: debito.cuenta, credito: credito.cuenta, impuesto: impuesto.cuenta, fallo: null };
}

export function validarCuentaDeMovimiento(
  codigo: string | null | undefined,
  plan: CuentaContable[],
  opcional = false,
): string | null {
  const limpio = (codigo ?? '').trim();
  if (!limpio) return opcional ? null : 'Falta la cuenta';
  const cuenta = plan.find((c) => c.account_code === limpio);
  if (!cuenta) return `La cuenta ${limpio} no existe en el plan de la organización`;
  if (cuenta.is_active === false) return `La cuenta ${limpio} está inactiva`;
  if (cuenta.es_movimiento === false) return `La cuenta ${limpio} es de título y no recibe movimientos`;
  return null;
}

export function validarCuentasDeRegla(
  regla: { debito: string | null | undefined; credito: string | null | undefined; impuesto?: string | null },
  plan: CuentaContable[],
): string | null {
  return (
    validarCuentaDeMovimiento(regla.debito, plan) ||
    validarCuentaDeMovimiento(regla.credito, plan) ||
    validarCuentaDeMovimiento(regla.impuesto, plan, true)
  );
}

const COMPARTIDAS: Record<ClaveContable, string> = {
  caja: '1105',
  bancos: '1110',
  clientes: '1305',
  proveedores: '2205',
  ventas_productos: '4135',
  ventas_servicios: '4235',
  devoluciones: '4175',
  descuentos: '4175',
  costo_ventas: '6135',
  inventario: '1435',
  iva_generado: '240805',
  iva_descontable: '240810',
  retefuente: '2365',
  reteiva: '2367',
  reteica: '2368',
  propinas: '5105',
  comisiones: '529505',
  anticipos: '2805',
  nomina: '5105',
  nomina_por_pagar: '2505',
  nomina_aportes: '2370',
  faltante_inventario: '519595',
  gastos_extraordinarios: '5315',
  consumo_interno: '519595',
  manifiesto_por_pagar: '2205',
  manifiesto_transporte: '2335',
  saldo_inicial: '3105',
  impuesto_consumo: '2495',
  redondeo: '4295',
  compra_servicio: '2335',
};

/** Misma tabla que `fn_propuesta_configuracion_sector` en la migración. */
export function propuestaPorSector(typeId: number | null | undefined): Record<ClaveContable, string> {
  const propuesta = { ...COMPARTIDAS };
  switch (typeId) {
    case 1:
      propuesta.ventas_productos = '414015';
      propuesta.ventas_servicios = '414095';
      propuesta.costo_ventas = '6140';
      propuesta.inventario = '1405';
      break;
    case 2:
      propuesta.ventas_productos = '4140';
      propuesta.ventas_servicios = '4140';
      propuesta.costo_ventas = '6140';
      break;
    case 4:
      propuesta.ventas_productos = '4155';
      break;
    case 6:
      propuesta.ventas_productos = '4145';
      break;
    case 7:
      propuesta.ventas_productos = '4235';
      break;
    default:
      break;
  }
  return propuesta;
}

export function nombreSector(typeId: number | null | undefined): string {
  switch (typeId) {
    case 1: return 'Restaurante';
    case 2: return 'Hotel';
    case 3: return 'Comercio';
    case 4: return 'Servicios';
    case 5: return 'Gimnasio';
    case 6: return 'Transporte';
    case 7: return 'Parqueadero';
    default: return 'Comercio';
  }
}

export const ORIGENES_REGLA: { value: string; label: string }[] = [
  { value: 'sale', label: 'Venta' },
  { value: 'sale_payment', label: 'Cobro de venta' },
  { value: 'sale_credit_note', label: 'Nota crédito' },
  { value: 'purchase', label: 'Compra' },
  { value: 'purchase_payment', label: 'Pago a proveedor' },
  { value: 'purchase_order', label: 'Orden de compra' },
  { value: 'cash_movement', label: 'Movimiento de caja' },
  { value: 'bank', label: 'Banco' },
  { value: 'bank_transaction', label: 'Transacción bancaria' },
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'payroll_period', label: 'Periodo de nómina' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'inventory_adjustment', label: 'Ajuste de inventario' },
  { value: 'refund', label: 'Reembolso' },
  { value: 'commission', label: 'Comisión' },
  { value: 'ota_commission', label: 'Comisión de canal' },
  { value: 'folio_item', label: 'Cargo de folio' },
  { value: 'folio_payment', label: 'Pago de folio' },
  { value: 'installment', label: 'Cuota' },
  { value: 'loan', label: 'Préstamo' },
  { value: 'tip', label: 'Propina' },
  { value: 'membership', label: 'Membresía' },
  { value: 'parking', label: 'Parqueadero' },
  { value: 'parking_pass', label: 'Pase de parqueadero' },
  { value: 'parking_session', label: 'Sesión de parqueadero' },
  { value: 'reservation', label: 'Reserva' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'manifest', label: 'Manifiesto' },
  { value: 'shipment', label: 'Envío' },
  { value: 'transport_incident', label: 'Incidente de transporte' },
  { value: 'trip', label: 'Viaje' },
  { value: 'transport', label: 'Transporte' },
];

export const EVENTOS_REGLA: { value: string; label: string }[] = [
  { value: 'created', label: 'Creación' },
  { value: 'paid', label: 'Pago' },
  { value: 'partial_paid', label: 'Pago parcial' },
  { value: 'voided', label: 'Anulación' },
  { value: 'confirmed', label: 'Confirmación' },
  { value: 'cancelled', label: 'Cancelación' },
  { value: 'refunded', label: 'Reembolso' },
  { value: 'adjusted', label: 'Ajuste' },
  { value: 'accrued', label: 'Causación' },
  { value: 'received', label: 'Recepción' },
  { value: 'gain', label: 'Sobrante' },
  { value: 'loss', label: 'Faltante' },
  { value: 'completed', label: 'Completado' },
  { value: 'closed', label: 'Cierre' },
  { value: 'no_show', label: 'No se presentó' },
  { value: 'created_credit', label: 'Creación a crédito' },
  { value: 'renewed', label: 'Renovación' },
  { value: 'renewed_credit', label: 'Renovación a crédito' },
  { value: 'paid_credit', label: 'Pago a crédito' },
  { value: 'reversed', label: 'Reverso' },
  { value: 'received_cash', label: 'Recepción de contado' },
  { value: 'delivered_cod', label: 'Entrega contra pago' },
  { value: 'returned', label: 'Devolución' },
  { value: 'resolved', label: 'Resuelto' },
];

/** Nombres de lo que el asiento guarda en `source`, que a veces es la tabla. */
const ORIGENES_ASIENTO: { value: string; label: string }[] = [
  { value: 'invoice_sales', label: 'Venta' },
  { value: 'sales', label: 'Venta' },
  { value: 'invoice_purchase', label: 'Compra' },
  { value: 'payments', label: 'Pago' },
  { value: 'returns', label: 'Devolución' },
  { value: 'tips', label: 'Propina' },
  { value: 'payroll_slips', label: 'Nómina' },
  { value: 'payroll_periods', label: 'Periodo de nómina' },
  { value: 'commissions', label: 'Comisión' },
  { value: 'bank_transactions', label: 'Banco' },
  { value: 'bank_transfers', label: 'Transferencia bancaria' },
  { value: 'cash_movements', label: 'Movimiento de caja' },
  { value: 'cash_sessions', label: 'Sesión de caja' },
  { value: 'folio_items', label: 'Cargo de folio' },
  { value: 'employee_loans', label: 'Préstamo' },
  { value: 'loan_installments', label: 'Cuota' },
  { value: 'ap_installments', label: 'Cuota por pagar' },
  { value: 'accounts_payable', label: 'Cuenta por pagar' },
  { value: 'accounts_receivable', label: 'Cuenta por cobrar' },
  { value: 'sale_items', label: 'Costo de la venta' },
  { value: 'parking_passes', label: 'Pase de parqueadero' },
  { value: 'parking_sessions', label: 'Sesión de parqueadero' },
  { value: 'trip_tickets', label: 'Tiquete de viaje' },
];

const ETIQUETA_ORIGEN = new Map(
  [...ORIGENES_REGLA, ...ORIGENES_ASIENTO].map((o) => [o.value, o.label]),
);
const ETIQUETA_EVENTO = new Map(EVENTOS_REGLA.map((e) => [e.value, e.label]));

export function etiquetaOrigen(valor: string | null | undefined): string {
  if (!valor) return 'Documento';
  return ETIQUETA_ORIGEN.get(valor) ?? valor;
}

export function etiquetaEvento(valor: string | null | undefined): string {
  if (!valor) return '';
  return ETIQUETA_EVENTO.get(valor) ?? valor;
}

export const MOTIVOS_FALLO_CONTABLE: Record<string, string> = {
  amount_invalid: 'El importe es nulo o no es positivo',
  account_null: 'La regla no trae cuenta de débito o de crédito',
  same_account: 'El débito y el crédito quedaron en la misma cuenta',
  debit_account_missing: 'La cuenta de débito no está en el plan',
  credit_account_missing: 'La cuenta de crédito no está en el plan',
  tax_account_missing: 'La cuenta de impuesto no está en el plan',
  discount_account_missing: 'La cuenta de descuento no está en el plan',
  period_closed: 'El periodo contable está cerrado',
  cuenta_no_es_de_movimiento: 'La cuenta es de título y no recibe asientos',
  cuenta_no_configurada: 'La cuenta configurada no sirve para contabilizar',
  withholding_exceeds_total: 'Las retenciones igualan o superan el total',
};

export function etiquetaMotivoFallo(motivo: string | null | undefined): string {
  if (!motivo) return 'Fallo contable';
  return MOTIVOS_FALLO_CONTABLE[motivo] ?? motivo;
}
