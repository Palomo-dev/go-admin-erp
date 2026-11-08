/**
 * Frente R4-B — lógica sin React de consignaciones, dinero de terceros y
 * anticipos a proveedores, y la regla «una pieza para varias páginas»: el
 * anticipo a proveedor usa LOS MISMOS diálogos del saldo a favor de clientes,
 * y su namespace trae todas las claves que esos diálogos piden.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BADGE_ESTADO_NOTA,
  codigoErrorConsignacion,
  enSuPoder,
  entregarSchema,
  estadoHttpErrorConsignacion,
  filtrarNotas,
  kpisConsignaciones,
  liquidacionValida,
  liquidarSchema,
  resumenLiquidacion,
  validarLineaLiquidacion,
  type NotaConsignacion,
} from '@/lib/finanzas/consignaciones/consignaciones';
import {
  esCuentaPasivo,
  hayCuentaPorDefinir,
  resumirPropinas,
  resumirRecaudos,
  totalPorPagar,
  type ConceptoTerceros,
} from '@/lib/finanzas/dineroTerceros/dineroTercerosLogica';
import {
  aEstadoCuentaAnticipo,
  aEvaluacionRetenciones,
  aPendienteAnticipo,
  accionesAnticipo,
  aplicarAnticipoSchema,
  excesoRetencionSchema,
  partesDevolucion,
  retencionesDelProcedimiento,
  totalComponentes,
  anticiposConRetencionPendiente,
  anularAnticipoSchema,
  codigoErrorAnticipo,
  devolverAnticipoSchema,
  evaluarRetencionesSchema,
  filasCsvConciliacion,
  crearAnticipoSchema,
  esPendienteDeActivar,
  estadoAnticipo,
  estadoHttpErrorAnticipo,
  filtrarAnticipos,
  totalesAnticipos,
  type FilaAnticipoProveedor,
} from '@/lib/finanzas/anticiposProveedor/contrato';
import { CLAVES_ETIQUETA_ESTADO } from '@/components/kit/estadoTono';

const raiz = process.cwd();
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf-8');

// ─── Consignaciones ─────────────────────────────────────────────────────────

const nota = (extra: Partial<NotaConsignacion> = {}): NotaConsignacion => ({
  id: 'n1',
  numero: 'NCO-0011',
  clienteId: 'c1',
  consignatario: 'Almacén del centro',
  sucursalId: 7,
  ubicacion: null,
  comisionPct: 10,
  estado: 'en_consignacion',
  costoTotal: 2400000,
  fecha: '2026-10-15T12:00:00Z',
  lineas: [
    { id: 'l1', productoId: 1, producto: 'Zapatilla', entregado: 40, vendido: 30, devuelto: 5, costoUnitario: 30000 },
    { id: 'l2', productoId: 2, producto: 'Camiseta', entregado: 40, vendido: 20, devuelto: 0, costoUnitario: 30000 },
  ],
  liquidaciones: [],
  ...extra,
});

describe('consignaciones', () => {
  test('en su poder = entregado − vendido − devuelto (Figma: 40 − 30 − 5 = 5)', () => {
    expect(enSuPoder(nota().lineas[0])).toBe(5);
    expect(enSuPoder({ entregado: 1, vendido: 1, devuelto: 1 })).toBe(0);
  });

  test('liquidación del Figma: venta 2.100.000, comisión 10 % = 210.000, neto 1.890.000', () => {
    const r = resumenLiquidacion(
      [
        { lineaId: 'l1', vendido: 30, precio: 60000, devuelto: 5 },
        { lineaId: 'l2', vendido: 20, precio: 15000, devuelto: 0 },
      ],
      10,
    );
    expect(r).toEqual({ venta: 2100000, comision: 210000, neto: 1890000 });
  });

  test('una fila no puede vender más de lo que tiene en su poder, y lo vendido lleva precio', () => {
    const l = { entregado: 40, vendido: 30, devuelto: 5 };
    expect(validarLineaLiquidacion({ lineaId: 'l1', vendido: 4, precio: 1, devuelto: 1 }, l)).toBeNull();
    expect(validarLineaLiquidacion({ lineaId: 'l1', vendido: 5, precio: 1, devuelto: 1 }, l)).toBe('excede');
    expect(validarLineaLiquidacion({ lineaId: 'l1', vendido: 1, precio: 0, devuelto: 0 }, l)).toBe('precio');
    expect(validarLineaLiquidacion({ lineaId: 'l1', vendido: 0, precio: 0, devuelto: 2 }, l)).toBeNull();
  });

  test('liquidar exige alguna fila con movimiento y ninguna inválida', () => {
    const mapa = new Map(nota().lineas.map((l) => [l.id, l]));
    expect(liquidacionValida([{ lineaId: 'l1', vendido: 0, precio: 0, devuelto: 0 }], mapa)).toBe(false);
    expect(liquidacionValida([{ lineaId: 'l1', vendido: 0, precio: 0, devuelto: 5 }], mapa)).toBe(true);
    expect(liquidacionValida([{ lineaId: 'zz', vendido: 0, precio: 0, devuelto: 1 }], mapa)).toBe(false);
  });

  test('KPIs: entregado a costo de lo que sigue en su poder, vendido sin liquidar, devuelto y por cobrar neto', () => {
    const k = kpisConsignaciones([
      nota({
        liquidaciones: [
          { id: 'q1', estado: 'por_facturar', venta: 2100000, comisionPct: 10, comision: 210000, neto: 1890000, costoDevuelto: 0, facturaId: null, facturaNumero: null, facturaSaldo: null, desde: null, hasta: null, creada: '2026-11-01' },
          { id: 'q0', estado: 'liquidada', venta: 500000, comisionPct: 10, comision: 50000, neto: 450000, costoDevuelto: 0, facturaId: 'f', facturaNumero: 'FV-1', facturaSaldo: 100000, desde: null, hasta: null, creada: '2026-10-20' },
        ],
      }),
    ]);
    // En su poder: 5 + 20 unidades × 30.000.
    expect(k.entregado).toBe(750000);
    expect(k.vendidoSinLiquidar).toBe(2100000);
    expect(k.devuelto).toBe(150000);
    expect(k.porCobrar).toBe(1890000 + 100000);
  });

  test('búsqueda por número o consignatario, y estado', () => {
    const notas = [nota(), nota({ id: 'n2', numero: 'NCO-0012', consignatario: 'Tienda norte', estado: 'liquidada' })];
    expect(filtrarNotas(notas, '0012', null).map((n) => n.id)).toEqual(['n2']);
    expect(filtrarNotas(notas, 'almacén', null).map((n) => n.id)).toEqual(['n1']);
    expect(filtrarNotas(notas, '', 'liquidada').map((n) => n.id)).toEqual(['n2']);
  });

  test('los estados de la nota tienen badge conocido por el kit', () => {
    const normal = (s: string) => s.toLowerCase().replace(/[\s_]/g, '');
    const conocidas = new Set([...CLAVES_ETIQUETA_ESTADO].map(normal));
    for (const v of Object.values(BADGE_ESTADO_NOTA)) expect(conocidas.has(normal(v))).toBe(true);
  });

  test('cuerpos estrictos: ni organización ni cuentas contables desde el navegador', () => {
    // Ronda 2 del Contador (2026-11-07): modalidad, condición contable, reconocimiento y factura de la
    // remuneración son obligatorios, sin default.
    const terminos = {
      contrato: 'intermediacion',
      condicion: 'agente',
      precio_modo: 'fijo',
      remuneracion_modo: 'porcentaje',
      base_comision: 'precio_pactado',
      reconocimiento: 'al_vender',
      factura_remuneracion: false,
      obligacion_dueno: 'venta',
      riesgos: { devoluciones: 'dueno', perdidas: 'consignatario', gastos: 'consignatario' },
    };
    const base = { cliente_id: '11111111-2222-4333-8444-555555555555', sucursal_id: 7, comision: 15, terminos, lineas: [{ product_id: 1, qty: 2 }], clave_idempotencia: 'consignacion:1' };
    expect(entregarSchema.safeParse(base).success).toBe(true);
    expect(entregarSchema.safeParse({ ...base, terminos: undefined }).success).toBe(false);
    expect(entregarSchema.safeParse({ ...base, cuenta: '1465' }).success).toBe(false);
    expect(entregarSchema.safeParse({ ...base, comision: 120 }).success).toBe(false);
    expect(liquidarSchema.safeParse({ lineas: [], clave_idempotencia: 'liquidar:1' }).success).toBe(false);
  });

  test('códigos de error estables y estado HTTP', () => {
    expect(codigoErrorConsignacion('excede_en_su_poder')).toBe('excede_en_su_poder');
    expect(codigoErrorConsignacion('stock_insuficiente')).toBe('stock_insuficiente');
    expect(codigoErrorConsignacion('algo raro')).toBe('error_desconocido');
    expect(estadoHttpErrorConsignacion('pendiente_de_activar')).toBe(501);
    expect(estadoHttpErrorConsignacion('liquidacion_pendiente')).toBe(409);
  });
});

// ─── Dinero de terceros ─────────────────────────────────────────────────────

describe('dinero de terceros', () => {
  test('propinas: recibido sin anuladas, liquidado = repartidas', () => {
    expect(
      resumirPropinas([
        { amount: 1000, is_distributed: true, voided_at: null },
        { amount: '500', is_distributed: false, voided_at: null },
        { amount: 900, is_distributed: false, voided_at: '2026-11-01' },
      ]),
    ).toEqual({ recibido: 1500, liquidado: 1000, porPagar: 500 });
  });

  test('recaudos por tercero desde el auxiliar: crédito recibido, débito liquidado, mayor deuda primero', () => {
    const r = resumirRecaudos([
      { tercero_nit: '900', tercero_nombre: 'Tercero A', debit: 100, credit: 300 },
      { tercero_nit: '800', tercero_nombre: 'Tercero B', debit: 0, credit: 1000 },
      { tercero_nit: '900', tercero_nombre: null, debit: '50', credit: '0' },
    ]);
    expect(r.recibido).toBe(1300);
    expect(r.liquidado).toBe(150);
    expect(r.porPagar).toBe(1150);
    expect(r.terceros.map((t) => [t.nit, t.porPagar])).toEqual([
      ['800', 1000],
      ['900', 150],
    ]);
  });

  test('la cuenta de terceros es de pasivo; si la de propinas es gasto, se avisa', () => {
    expect(esCuentaPasivo('2815')).toBe(true);
    expect(esCuentaPasivo('510506')).toBe(false);
    expect(esCuentaPasivo(null)).toBe(false);
    const c = (extra: Partial<ConceptoTerceros>): ConceptoTerceros => ({
      clave: 'recaudos', recibido: 0, liquidado: 0, porPagar: 10, cuenta: '2815', cuentaConfirmada: true, cuentaNoEsPasivo: false, terceros: [], ...extra,
    });
    expect(hayCuentaPorDefinir([c({})])).toBe(false);
    expect(hayCuentaPorDefinir([c({ clave: 'propinas', cuenta: '5105', cuentaNoEsPasivo: true, cuentaConfirmada: false })])).toBe(true);
    expect(totalPorPagar([c({}), c({ porPagar: 5.5 })])).toBe(15.5);
  });
});

// ─── Anticipos a proveedores ────────────────────────────────────────────────

const fila = (extra: Partial<FilaAnticipoProveedor> = {}): FilaAnticipoProveedor => ({
  id: 'a1', proveedorId: '45', proveedor: 'Distribuidora', proveedorNit: '900', fecha: '2026-11-10', valor: 2000000, aplicado: 1200000, devuelto: 0, saldo: 800000, estado: 'disponible', recibo: 'CE-1', sucursalId: 7, notas: null, ...extra,
});

describe('anticipos a proveedores', () => {
  test('estado vivo: disponible con saldo, aplicado sin saldo, anulado', () => {
    expect(estadoAnticipo('active', 10)).toBe('disponible');
    expect(estadoAnticipo('used', 0)).toBe('aplicado');
    expect(estadoAnticipo('cancelled', 0)).toBe('anulado');
  });

  test('acciones: aplicar con finance.create; devolver y anular con finance.void; anular solo sin usar', () => {
    const permisos = { crear: true, anular: true };
    expect(accionesAnticipo(fila(), permisos)).toEqual({ aplicar: true, devolver: true, anular: false });
    expect(accionesAnticipo(fila({ aplicado: 0, saldo: 2000000 }), permisos).anular).toBe(true);
    expect(accionesAnticipo(fila(), { crear: false, anular: false })).toEqual({ aplicar: false, devolver: false, anular: false });
    expect(accionesAnticipo(fila({ estado: 'anulado', saldo: 0 }), permisos)).toEqual({ aplicar: false, devolver: false, anular: false });
  });

  test('búsqueda, filtro y totales (los anulados no suman)', () => {
    const filas = [fila(), fila({ id: 'a2', proveedorId: '46', proveedor: 'Servicios del valle', valor: 500000, aplicado: 0, saldo: 500000 }), fila({ id: 'a3', estado: 'anulado', saldo: 0, valor: 99 })];
    expect(filtrarAnticipos(filas, { texto: 'valle' }).map((f) => f.id)).toEqual(['a2']);
    expect(filtrarAnticipos(filas, { estado: 'anulado' }).map((f) => f.id)).toEqual(['a3']);
    expect(totalesAnticipos(filas)).toEqual({ valor: 2500000, aplicado: 1200000, saldo: 1300000, proveedores: 2 });
  });

  test('pendiente de activar solo con la función o la tabla ausentes, nunca otro error', () => {
    expect(esPendienteDeActivar({ code: 'PGRST202' })).toBe(true);
    expect(esPendienteDeActivar({ code: 'PGRST205' })).toBe(true);
    expect(esPendienteDeActivar({ code: '42P01', message: 'relation "public.supplier_advances" does not exist' })).toBe(true);
    expect(esPendienteDeActivar({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(esPendienteDeActivar(null)).toBe(false);
  });

  test('códigos: los del saldo a favor más los del proveedor', () => {
    expect(codigoErrorAnticipo('monto_excede_anticipo')).toBe('monto_excede_anticipo');
    expect(codigoErrorAnticipo('sin_caja_abierta')).toBe('sin_caja_abierta');
    expect(estadoHttpErrorAnticipo('anticipo_usado')).toBe(409);
    expect(estadoHttpErrorAnticipo('sin_caja_abierta')).toBe(409);
    expect(estadoHttpErrorAnticipo('pendiente_de_activar')).toBe(501);
  });

  test('el cuerpo del anticipo no admite vencimiento ni cuenta PUC', () => {
    const base = { proveedor_id: 45, sucursal_id: 7, monto: 10, metodo: 'cash', clave_idempotencia: 'anticipo:1', naturaleza: 'financiacion' };
    expect(crearAnticipoSchema.safeParse(base).success).toBe(true);
    expect(crearAnticipoSchema.safeParse({ ...base, vence: '2026-12-31' }).success).toBe(false);
    expect(crearAnticipoSchema.safeParse({ ...base, cuenta: '1330' }).success).toBe(false);
  });
});

// ─── Correcciones del Contador (P1, P6, P7) ─────────────────────────────────

describe('anticipos a proveedores: correcciones del Contador', () => {
  const base = { proveedor_id: 45, sucursal_id: 7, monto: 10, metodo: 'cash', clave_idempotencia: 'anticipo:1' };

  test('P1: la naturaleza es obligatoria, sin valor por defecto; el pago anticipado exige la tarifa de IVA', () => {
    expect(crearAnticipoSchema.safeParse(base).success).toBe(false);
    expect(crearAnticipoSchema.safeParse({ ...base, naturaleza: 'otra' }).success).toBe(false);
    expect(crearAnticipoSchema.safeParse({ ...base, naturaleza: 'pago_anticipado_precio' }).success).toBe(false);
    expect(crearAnticipoSchema.safeParse({ ...base, naturaleza: 'pago_anticipado_precio', tarifa_iva: 0 }).success).toBe(true);
    expect(evaluarRetencionesSchema.safeParse({ proveedor_id: 45, monto: 10, naturaleza: 'financiacion' }).success).toBe(true);
    // Los valores de la retención no viajan: solo los conceptos (la base vuelve a calcular).
    expect(crearAnticipoSchema.safeParse({ ...base, naturaleza: 'financiacion', retencion: 100 }).success).toBe(false);
  });

  test('P1: la evaluación tipada no cuenta valores de clases que no se practican', () => {
    const e = aEvaluacionRetenciones({
      naturaleza: 'pago_anticipado_precio', monto: 1190000, base: 1000000, iva: 190000, total: 40000, neto: 1150000, pendiente: true,
      clases: [
        { clase: 'retefuente', estado: 'practicar', valor: 40000, tarifa: 4, base: 1000000, concepto: 'Retención 4%', cuenta: '23652501' },
        { clase: 'reteiva', estado: 'no_aplica', motivo: 'operacion_sin_iva', valor: 5 },
        { clase: 'reteica', estado: 'raro', motivo: 'norma_municipal_sin_confirmar' },
      ],
      opciones: { retefuente: [{ id: 'a', nombre: 'Retención 4%', tarifa: 4 }] },
    });
    expect(e.clases.map((c) => [c.clase, c.estado, c.valor])).toEqual([['retefuente', 'practicar', 40000], ['reteiva', 'no_aplica', 0], ['reteica', 'pendiente', 0]]);
    expect(e.opciones).toEqual({ retefuente: [{ id: 'a', nombre: 'Retención 4%', tarifa: 4, tarifaPorMil: null, norma: null }], reteica: [] });
    expect(e.pendiente).toBe(true);
  });

  test('P7: anular exige declarar que el desembolso no ocurrió, con soporte; la fecha del ajuste es un día', () => {
    const ok = { declaracion: 'desembolso_no_ocurrio', motivo: 'Transferencia rechazada', soporte: 'Extracto' };
    expect(anularAnticipoSchema.safeParse(ok).success).toBe(true);
    expect(anularAnticipoSchema.safeParse({ ...ok, fecha_ajuste: '2026-11-05' }).success).toBe(true);
    expect(anularAnticipoSchema.safeParse({ ...ok, fecha_ajuste: '05/11/2026' }).success).toBe(false);
    expect(anularAnticipoSchema.safeParse({ motivo: 'x x x', soporte: 'Extracto' }).success).toBe(false);
    expect(anularAnticipoSchema.safeParse({ ...ok, soporte: '' }).success).toBe(false);
    expect(devolverAnticipoSchema.safeParse({ monto: 1, metodo: 'cash', motivo: 'Devuelve', clave_idempotencia: 'devolver:1' }).success).toBe(false);
    expect(devolverAnticipoSchema.safeParse({ monto: 1, metodo: 'cash', motivo: 'Devuelve', referencia: 'Recibo 9', clave_idempotencia: 'devolver:1' }).success).toBe(true);
  });

  test('códigos nuevos con su estado HTTP (pendientes contables = 409, datos = 422)', () => {
    expect(codigoErrorAnticipo('cuenta_anticipos_no_configurada')).toBe('cuenta_anticipos_no_configurada');
    expect(estadoHttpErrorAnticipo('cuenta_anticipos_no_configurada')).toBe(409);
    expect(estadoHttpErrorAnticipo('cuenta_anticipos_no_detalle')).toBe(409);
    expect(estadoHttpErrorAnticipo('cxp_sin_causacion')).toBe(409);
    expect(estadoHttpErrorAnticipo('anulacion_requiere_declaracion')).toBe(409);
    expect(estadoHttpErrorAnticipo('naturaleza_obligatoria')).toBe(422);
    expect(estadoHttpErrorAnticipo('soporte_obligatorio')).toBe(422);
    expect(estadoHttpErrorAnticipo('periodo_cerrado')).toBe(409);
  });

  test('retención pendiente visible y CSV de conciliación por anticipo y por proveedor', () => {
    const filas = [fila({ retencionPendiente: true }), fila({ id: 'a2', retencionPendiente: true, estado: 'anulado', saldo: 0 }), fila({ id: 'a3' })];
    expect(anticiposConRetencionPendiente(filas)).toBe(1);
    const csv = filasCsvConciliacion(
      {
        anticipos: [{ anticipoId: 'a1', proveedor: 'P', nit: '9', cuenta: '13300501', recibo: 'CE-1', naturaleza: 'financiacion', valor: 1000, retencion: 0, girado: 1000, aplicado: 400, retencionDescontada: 0, devuelto: 0, anulado: 0, saldo: 600, saldoLibros: 600, cuadra: true, pendientesAbiertos: 2, cruzado: 0 }],
        proveedores: [{ proveedor: 'P', nit: '9', anticipos: 1, saldo: 600, saldoLibros: 600, auxiliarNit: 600 }],
      },
      { anticipos: ['A'], proveedores: ['B'] },
      (v) => (v ? 'sí' : 'no'),
    );
    expect(csv[1]).toEqual(['P', '9', 'CE-1', '13300501', 'financiacion', '1000', '0', '1000', '400', '0', '0', '0', '600', '600', 'sí', '2', '0']);
    expect(csv[csv.length - 1]).toEqual(['P', '9', '1', '600', '600', '600']);
  });
});

// ─── Ronda 2 del Contador ───────────────────────────────────────────────────

describe('anticipos a proveedores: ronda 2 del Contador', () => {
  const base = { proveedor_id: 45, sucursal_id: 7, monto: 795000, metodo: 'cash', clave_idempotencia: 'anticipo:1', naturaleza: 'pago_anticipado_precio' };

  test('ítem 3: el pago anticipado va con la tarifa general o con componentes por línea y tarifa', () => {
    const componentes = [
      { tratamiento: 'gravado', base: 500000, tarifa_iva: 19 },
      { tratamiento: 'excluido', base: 200000 },
    ];
    expect(crearAnticipoSchema.safeParse({ ...base, componentes }).success).toBe(true);
    expect(crearAnticipoSchema.safeParse({ ...base, componentes: [{ tratamiento: 'otro', base: 1 }] }).success).toBe(false);
    expect(crearAnticipoSchema.safeParse({ ...base, componentes: [] }).success).toBe(false);
    expect(totalComponentes(componentes as never)).toBe(795000);
    expect(
      totalComponentes([
        { tratamiento: 'aiu_administracion', base: 100000 },
        { tratamiento: 'aiu_imprevistos', base: 50000 },
        { tratamiento: 'aiu_utilidad', base: 50000, tarifa_iva: 19 },
      ] as never),
    ).toBe(209500);
  });

  test('ítem 4: la regla de ReteICA trae la tarifa por mil exacta (9,66 ‰ = 0,966 %); la financiación queda «diferida»', () => {
    const e = aEvaluacionRetenciones({
      naturaleza: 'financiacion',
      clases: [{ clase: 'retefuente', estado: 'diferida', motivo: 'se_evalua_al_pago_o_abono' }],
      opciones: { reteica: [{ id: 'r', nombre: 'Bogotá · consultoría', tarifa_por_mil: 9.66, norma: 'Acuerdo' }] },
    });
    expect(e.clases[0]).toMatchObject({ estado: 'diferida', valor: 0 });
    expect(e.opciones.reteica[0]).toEqual({ id: 'r', nombre: 'Bogotá · consultoría', tarifa: 0.966, tarifaPorMil: 9.66, norma: 'Acuerdo' });
    expect(Math.round((1000000 * e.opciones.reteica[0].tarifa) / 100)).toBe(9660);
  });

  test('ronda 3: la devolución va por procedimiento y causa; las retenciones salen del procedimiento', () => {
    const d = { monto: 55592, metodo: 'transfer', motivo: 'Devuelve', referencia: 'Consignación', clave_idempotencia: 'devolver:1' };
    const soportes = { documento: 'Acuerdo 12', calculo: 'Hoja de cálculo', certificado: 'Certificado corregido', norma_ica: 'Acuerdo municipal' };
    expect(devolverAnticipoSchema.safeParse({ ...d, procedimiento: null }).success).toBe(true);
    expect(
      devolverAnticipoSchema.safeParse({
        ...d,
        procedimiento: { causa: 'devolucion_parcial', soportes, base_devuelta: 50000, iva_devuelto: 9500, periodo_descuento: '2026-11', requiere_correccion: false },
      }).success,
    ).toBe(true);
    // Parcial sin el cálculo de la parte devuelta; causa inventada; sin documento: no pasan.
    expect(devolverAnticipoSchema.safeParse({ ...d, procedimiento: { causa: 'devolucion_parcial', soportes } }).success).toBe(false);
    expect(devolverAnticipoSchema.safeParse({ ...d, procedimiento: { causa: 'otra', soportes } }).success).toBe(false);
    expect(devolverAnticipoSchema.safeParse({ ...d, procedimiento: { causa: 'operacion_anulada', soportes: { documento: '' } } }).success).toBe(false);
    // Ya no se eligen retenciones a mano.
    expect(devolverAnticipoSchema.safeParse({ ...d, retenciones: [] }).success).toBe(false);
    const vigentes = [
      { clase: 'retefuente' as const, vigente: 4000, tarifa: 4 },
      { clase: 'reteiva' as const, vigente: 2850, tarifa: 15 },
      { clase: 'reteica' as const, vigente: 966, tarifa: 0.966 },
    ];
    expect(retencionesDelProcedimiento(vigentes, { causa: 'devolucion_parcial', base_devuelta: 50000, iva_devuelto: 9500 }).map((r) => r.valor)).toEqual([2000, 1425, 483]);
    expect(retencionesDelProcedimiento(vigentes, { causa: 'operacion_anulada' }).map((r) => r.valor)).toEqual([4000, 2850, 966]);
    // Ítem 11: el texto separa el dinero de las retenciones.
    expect(partesDevolucion({ dinero: 55592, retencion_revertida: 3908 })).toEqual({ dinero: 55592, retenciones: 3908 });
  });

  test('ronda 3: retención excesiva con cálculo, certificado y tratamiento en declaraciones', () => {
    const e = {
      clase: 'retefuente', base_correcta: 100000, tarifa_correcta: 2.5, metodo: 'transfer', motivo: 'Tarifa errada',
      soportes: { calculo: 'Cálculo', certificado: 'Certificado corregido' }, periodo_descuento: '2026-11', requiere_correccion: true,
      clave_idempotencia: 'exceso:prueba1',
    };
    expect(excesoRetencionSchema.safeParse(e).success).toBe(true);
    expect(excesoRetencionSchema.safeParse({ ...e, clase: 'reteica' }).success).toBe(false);
    expect(excesoRetencionSchema.safeParse({ ...e, periodo_descuento: '2026-13' }).success).toBe(false);
    expect(estadoHttpErrorAnticipo('sin_exceso')).toBe(422);
    expect(estadoHttpErrorAnticipo('anulacion_requiere_devolucion_total')).toBe(422);
  });

  test('ítem 5: la corrección de una retención repetida lleva motivo y soporte', () => {
    const a = { cuenta_id: '11111111-2222-4333-8444-555555555555', monto: 1, clave_idempotencia: 'aplicar:1' };
    expect(aplicarAnticipoSchema.safeParse(a).success).toBe(true);
    expect(aplicarAnticipoSchema.safeParse({ ...a, correccion: { motivo: 'Repetida', soporte: 'Nota 77' } }).success).toBe(true);
    expect(aplicarAnticipoSchema.safeParse({ ...a, correccion: { motivo: 'Repetida' } }).success).toBe(false);
  });

  test('ítems 9 y 10: pendientes tipados y la cuenta fuera de 133005xx', () => {
    const p = aPendienteAnticipo({
      id: 'p1', advance_id: 'a1', tipo: 'retencion_duplicada', estado: 'abierto', creado_en: '2026-11-07T10:00:00Z',
      detalle: { periodos_a_revisar: ['2026-11', '2026-11'] },
      supplier_advances: { suppliers: { name: 'Proveedor uno' }, payment_groups: { receipt_number: 'CE-1' } },
    });
    expect(p).toMatchObject({ tipo: 'retencion_duplicada', estado: 'abierto', proveedor: 'Proveedor uno', recibo: 'CE-1', periodos: ['2026-11'] });
    expect(aEstadoCuentaAnticipo({ estado: 'fuera_de_133005', configurada: '13309501' }).estado).toBe('fuera_de_133005');
    expect(aEstadoCuentaAnticipo({ estado: 'fuera_de_1330' }).estado).toBe('sin_configurar');
    expect(estadoHttpErrorAnticipo('retencion_duplicada')).toBe(409);
    expect(estadoHttpErrorAnticipo('reteica_requiere_norma')).toBe(422);
    expect(estadoHttpErrorAnticipo('pendiente_ya_resuelto')).toBe(409);
    expect(codigoErrorAnticipo('componentes_obligatorios: detalle')).toBe('componentes_obligatorios');
  });
});

// ─── Una pieza para varias páginas ──────────────────────────────────────────

describe('anticipo a proveedor = espejo del saldo a favor (mismos diálogos)', () => {
  const DIALOGOS = ['RegistrarAnticipoDialog', 'AplicarSaldoDialog', 'DevolverSaldoDialog'];

  test('la pantalla del proveedor monta los diálogos del saldo a favor con su adaptador, sin copias', () => {
    const listado = leer('src/components/finanzas/anticipos-proveedor/ListadoAnticiposProveedor.tsx');
    expect(listado).toContain("from '@/components/finanzas/saldos-a-favor'");
    for (const d of DIALOGOS) {
      expect(listado).toMatch(new RegExp(`<${d}[\\s\\S]*?adaptador=\\{ADAPTADOR_PROVEEDOR\\}`));
    }
    // Ningún otro diálogo de registrar/aplicar/devolver en la carpeta del proveedor.
    const servicio = leer('src/components/finanzas/anticipos-proveedor/anticiposProveedorService.ts');
    expect(servicio).not.toMatch(/from\(['"`](supplier_advances|payments|journal_)/);
  });

  test('el namespace del proveedor trae todas las claves que piden los diálogos compartidos', () => {
    const es = JSON.parse(leer('messages/es.json')) as Record<string, Record<string, unknown>>;
    const ns = (es.finanzasTercerosR4 as Record<string, unknown>).anticipos as Record<string, unknown>;
    const cliente = (es.finanzasDocumentosR3 as Record<string, unknown>).saldos as Record<string, unknown>;
    const existe = (obj: Record<string, unknown>, clave: string) =>
      clave.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj) !== undefined;
    const claves = new Set<string>();
    for (const d of DIALOGOS) {
      const src = leer(`src/components/finanzas/saldos-a-favor/${d}.tsx`);
      for (const m of src.matchAll(/\bt\('([a-zA-Z.]+)'/g)) claves.add(m[1]);
    }
    for (const extra of ['validacion.excede_disponible', 'validacion.excede_factura', 'devolver.quePasaEfectivo', 'devolver.quePasaBanco']) claves.add(extra);
    expect(claves.size).toBeGreaterThan(40);
    for (const c of claves) {
      expect([c, existe(ns, c)]).toEqual([c, true]);
      expect([c, existe(cliente, c)]).toEqual([c, true]);
    }
  });
});
