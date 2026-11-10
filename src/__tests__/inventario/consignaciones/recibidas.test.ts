/**
 * Consignación en dos sentidos y entre organizaciones: lógica sin React, cuerpos
 * de las rutas y lo que las migraciones (sin aplicar) no pueden perder.
 * Criterio del Contador: docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md
 * («Ronda 2 del Contador» y «Ronda 3 del Contador»).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONDICIONES_VACIAS,
  ERRORES_DE_CONFIGURACION,
  aceptarNotaSchema,
  aceptarVinculoSchema,
  conciliarRetencionSchema,
  retencionPracticadaSchema,
  porConciliar,
  reconocerRemuneracionSchema,
  retencionesConsignacionSchema,
  retencionesPorAmbito,
  type RetencionLiquidacion,
  codigoErrorRecibida,
  cruceAnticipoSchema,
  cuentasConsignacionSchema,
  enTuPoder,
  esPendienteRecibida,
  estadoHttpErrorRecibida,
  filtrarRecibidas,
  invitarSchema,
  kpisRecibidas,
  liquidarRecibidaSchema,
  novedadSchema,
  recibirSchema,
  terminosDeCondiciones,
  terminosSchema,
  tratamientoTributario,
  validarCondiciones,
  vistaLiquidacion,
  type CondicionesContrato,
  type NotaRecibida,
} from '@/lib/inventario/consignaciones/recibidas';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { RUTA_CONSIGNACIONES } from '@/lib/finanzas/consignaciones/consignaciones';

const RAIZ = process.cwd();
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');
const UUID = '11111111-2222-4333-8444-555555555555';

const INTERMEDIACION: CondicionesContrato = {
  contrato: 'intermediacion',
  condicion: 'agente',
  valoracion: 'costo_acreditado',
  precioModo: 'fijo',
  remuneracionModo: 'porcentaje',
  baseComision: 'precio_pactado',
  reconocimiento: 'al_vender',
  obligacionPosterior: null,
  facturaRemuneracion: true,
  obligacionDueno: 'venta',
  compensacionRemuneracion: true,
  // Ronda 5 (C.Co. art. 1277): términos obligatorios de la recibida en mandato.
  ordenAplicacion: ['remuneracion', 'gastos_reembolsables', 'anticipos', 'derechos_frente_al_dueno'],
  liquidacionEscrita: { medio: 'correo_electronico', plazoDias: 5 },
  riesgos: { devoluciones: 'dueno', perdidas: 'consignatario', gastos: 'consignatario' },
};

describe('contrato (Ronda 2, punto 2: modalidad, condición contable y tratamiento tributario por separado)', () => {
  test('nada tiene valor por defecto: sin modalidad no se opera', () => {
    expect(CONDICIONES_VACIAS.contrato).toBeNull();
    expect(CONDICIONES_VACIAS.condicion).toBeNull();
    expect(CONDICIONES_VACIAS.valoracion).toBeNull();
    expect(CONDICIONES_VACIAS.reconocimiento).toBeNull();
    expect(CONDICIONES_VACIAS.facturaRemuneracion).toBeNull();
    expect(validarCondiciones(CONDICIONES_VACIAS)).toEqual(['contrato']);
    const t = terminosDeCondiciones(INTERMEDIACION);
    for (const campo of ['contrato', 'condicion', 'reconocimiento', 'factura_remuneracion']) {
      expect(terminosSchema.safeParse({ ...t, [campo]: undefined }).success).toBe(false);
    }
  });

  test('la compra real no es consignación y el estimatorio queda bloqueado (arts. 438 y 455)', () => {
    expect(validarCondiciones({ ...INTERMEDIACION, contrato: 'compra' })).toEqual(['compra_real']);
    expect(validarCondiciones({ ...INTERMEDIACION, contrato: 'estimatorio' })).toEqual(['estimatorio_bloqueado']);
  });

  test('el tratamiento tributario lo deriva la modalidad; en mandato la condición es agente', () => {
    expect(tratamientoTributario('intermediacion')).toBe('mandato');
    expect(tratamientoTributario('estimatorio')).toBe('estimatorio_438_455');
    expect(validarCondiciones({ ...INTERMEDIACION, condicion: 'principal' })).toEqual(['condicion']);
    expect(terminosSchema.safeParse({ ...terminosDeCondiciones(INTERMEDIACION), condicion: 'principal' }).success).toBe(false);
  });

  test('cada campo del contrato se exige', () => {
    expect(validarCondiciones(INTERMEDIACION)).toEqual([]);
    expect(validarCondiciones({ ...INTERMEDIACION, valoracion: null })).toEqual(['valoracion']);
    expect(validarCondiciones({ ...INTERMEDIACION, valoracion: null }, 'entregada')).toEqual([]);
    expect(validarCondiciones({ ...INTERMEDIACION, reconocimiento: null })).toEqual(['reconocimiento']);
    expect(validarCondiciones({ ...INTERMEDIACION, facturaRemuneracion: null })).toEqual(['factura_remuneracion']);
    expect(validarCondiciones({ ...INTERMEDIACION, obligacionDueno: null })).toEqual(['obligacion']);
    expect(validarCondiciones({ ...INTERMEDIACION, baseComision: null })).toEqual(['base']);
    expect(validarCondiciones({ ...INTERMEDIACION, remuneracionModo: 'precio_liquidacion', baseComision: null })).toEqual([]);
    expect(validarCondiciones({ ...INTERMEDIACION, riesgos: { ...INTERMEDIACION.riesgos, gastos: null } })).toEqual(['riesgos']);
  });

  test('IVA, retenciones y quién factura no viajan como elección', () => {
    const t = terminosDeCondiciones(INTERMEDIACION, { cuentaRecaudo: '28151001' });
    expect(t.cuenta_recaudo).toBe('28151001');
    expect(terminosSchema.safeParse(t).success).toBe(true);
    expect(terminosSchema.safeParse({ ...t, factura: 'consignante' }).success).toBe(false);
    expect(terminosSchema.safeParse({ ...t, iva_responsable: 'mandante' }).success).toBe(false);
    expect(terminosSchema.safeParse({ ...t, retenciones: [] }).success).toBe(false);
    expect(terminosSchema.safeParse({ ...t, cuenta_recaudo: '2815' }).success).toBe(false);
  });

  test('la entregada no manda valoración de custodia (es inventario propio)', () => {
    expect(terminosDeCondiciones(INTERMEDIACION, { direccion: 'entregada' })).not.toHaveProperty('valoracion');
  });

  test('ronda 4, punto 8: la recibida declara si el contrato pacta compensar la remuneración con lo debido al dueño', () => {
    expect(CONDICIONES_VACIAS.compensacionRemuneracion).toBeNull();
    expect(validarCondiciones({ ...INTERMEDIACION, compensacionRemuneracion: null })).toEqual(['compensacion_remuneracion']);
    expect(validarCondiciones({ ...INTERMEDIACION, compensacionRemuneracion: null }, 'entregada')).toEqual([]);
    expect(terminosDeCondiciones(INTERMEDIACION).compensacion_remuneracion).toBe(true);
    expect(terminosDeCondiciones({ ...INTERMEDIACION, compensacionRemuneracion: false }).compensacion_remuneracion).toBe(false);
    expect(terminosDeCondiciones(INTERMEDIACION, { direccion: 'entregada' })).not.toHaveProperty('compensacion_remuneracion');
    expect(terminosSchema.safeParse(terminosDeCondiciones(INTERMEDIACION)).success).toBe(true);
    expect(terminosSchema.safeParse({ ...terminosDeCondiciones(INTERMEDIACION), compensacion_remuneracion: 'si' }).success).toBe(false);
  });
});

describe('Ronda 3, punto 1: la comisión se reconoce cuando se devenga, nunca por la fecha de liquidación', () => {
  test('ya no existe «al liquidar»; diferirla exige documentar la obligación posterior', () => {
    const t = terminosDeCondiciones(INTERMEDIACION);
    expect(terminosSchema.safeParse({ ...t, reconocimiento: 'al_liquidar' }).success).toBe(false);
    expect(validarCondiciones({ ...INTERMEDIACION, reconocimiento: 'obligacion_posterior' })).toEqual(['obligacion_posterior']);
    expect(validarCondiciones({ ...INTERMEDIACION, reconocimiento: 'obligacion_posterior', obligacionPosterior: 'Instalar el equipo en la sede del comprador' })).toEqual([]);
    const conObligacion = terminosDeCondiciones({ ...INTERMEDIACION, reconocimiento: 'obligacion_posterior', obligacionPosterior: 'Instalar el equipo en la sede del comprador' });
    expect(conObligacion.obligacion_posterior).toBe('Instalar el equipo en la sede del comprador');
    expect(terminosSchema.safeParse(conObligacion).success).toBe(true);
    expect(terminosSchema.safeParse({ ...conObligacion, obligacion_posterior: undefined }).success).toBe(false);
  });

  test('reconocer exige evidencia', () => {
    expect(reconocerRemuneracionSchema.safeParse({ evidencia: 'corta', clave_idempotencia: 'reconocer:1' }).success).toBe(false);
    expect(reconocerRemuneracionSchema.safeParse({ evidencia: 'Acta de instalación firmada', clave_idempotencia: 'reconocer:1' }).success).toBe(true);
  });
});

describe('Ronda 3, punto 2: retenciones de la operación y de la remuneración, por separado', () => {
  const r = (over: Partial<RetencionLiquidacion>): RetencionLiquidacion => ({
    id: 'r', ambito: 'operacion', clase: 'retefuente', pagador: 'comprador', grupo: 'agente', base: 100, tarifa: null, valor: null,
    estado: 'pendiente', motivo: 'sin_regla_configurada', conciliado: null, ...over,
  });

  test('se separan por ámbito y en orden de clase', () => {
    const g = retencionesPorAmbito([
      r({ id: 'b', ambito: 'remuneracion', clase: 'reteica', pagador: 'dueno', grupo: 'dueno' }),
      r({ id: 'a', ambito: 'remuneracion', clase: 'retefuente', pagador: 'dueno', grupo: 'dueno' }),
      r({ id: 'c', clase: 'reteiva' }),
    ]);
    expect(g.operacion.map((x) => x.id)).toEqual(['c']);
    expect(g.remuneracion.map((x) => x.id)).toEqual(['a', 'b']);
  });

  test('por conciliar: lo pendiente, lo estimado y lo practicado sin certificado; nunca lo que no aplica', () => {
    const lista = [
      r({ id: 'p' }),
      r({ id: 'd', estado: 'estimada', valor: 2970, tarifa: 11, motivo: null }),
      r({ id: 'n', estado: 'no_aplica', motivo: 'venta_a_consumidor_final' }),
      r({ id: 'c', estado: 'estimada', valor: 10, tarifa: 11, conciliado: { valor: 10, soporte: 'Cert 1', fecha: '2026-11-08' } }),
      r({ id: 'x', estado: 'practicada', valor: 10, tarifa: 11, practicada: { valor: 10, base: 100, fecha: '2026-11-08', soporte: 'Comprobante 7' } }),
    ];
    expect(porConciliar(lista).map((x) => x.id)).toEqual(['p', 'd', 'x']);
  });

  test('ronda 4, punto 1: la practicada se registra con valor, base, fecha y soporte (no espera el certificado)', () => {
    const ok = { valor: 2400, base: 100000, fecha: '2026-11-09', soporte: 'Comprobante de egreso 15' };
    expect(retencionPracticadaSchema.safeParse(ok).success).toBe(true);
    expect(retencionPracticadaSchema.safeParse({ ...ok, factura_id: UUID }).success).toBe(true);
    expect(retencionPracticadaSchema.safeParse({ ...ok, valor: 0 }).success).toBe(false);
    expect(retencionPracticadaSchema.safeParse({ ...ok, fecha: '09/11/2026' }).success).toBe(false);
    expect(retencionPracticadaSchema.safeParse({ ...ok, soporte: 'x' }).success).toBe(false);
    expect(estadoHttpErrorRecibida(codigoErrorRecibida('retencion_no_reconocida'))).toBe(422);
    expect(codigoErrorRecibida('sin_cuenta_cobro_remuneracion')).toBe('sin_cuenta_cobro_remuneracion');
  });

  test('conciliar exige soporte y valor; la regla se elige por ámbito y clase', () => {
    expect(conciliarRetencionSchema.safeParse({ valor: 0, soporte: 'Certificado 12 del dueño' }).success).toBe(true);
    expect(conciliarRetencionSchema.safeParse({ valor: 10, soporte: 'x' }).success).toBe(false);
    expect(retencionesConsignacionSchema.safeParse({ operacion: { retefuente: UUID }, remuneracion: { retefuente: null } }).success).toBe(true);
    expect(retencionesConsignacionSchema.safeParse({ operacion: { tarifa: 2.5 }, remuneracion: {} }).success).toBe(false);
  });
});

describe('cuerpos de las rutas', () => {
  const linea = { product_id: 9, qty: 10, precio: 60000, costo_acreditado: 40000 };
  const base = { proveedor_id: 3, sucursal_id: 7, comision: 15, terminos: terminosDeCondiciones(INTERMEDIACION), lineas: [linea], clave_idempotencia: 'consignacion:1' };

  test('recibir es estricto: ni organización ni cuentas desde el navegador', () => {
    expect(recibirSchema.safeParse(base).success).toBe(true);
    expect(recibirSchema.safeParse({ ...base, organization_id: 9 }).success).toBe(false);
    expect(recibirSchema.safeParse({ ...base, lineas: [{ ...linea, precio: 0 }] }).success).toBe(false);
    expect(recibirSchema.safeParse({ ...base, cuenta: '911520' }).success).toBe(false);
  });

  test('valoración de la custodia (punto 1): obligatoria y, si es costo acreditado, por línea', () => {
    expect(recibirSchema.safeParse({ ...base, terminos: { ...base.terminos, valoracion: undefined } }).success).toBe(false);
    expect(recibirSchema.safeParse({ ...base, lineas: [{ ...linea, costo_acreditado: null }] }).success).toBe(false);
    const convenido = { ...base, terminos: { ...base.terminos, valoracion: 'valor_convenido' }, lineas: [{ ...linea, costo_acreditado: null }] };
    expect(recibirSchema.safeParse(convenido).success).toBe(true);
    expect(aceptarNotaSchema.safeParse({ sucursal_id: 1, mapeo: [], clave_idempotencia: 'consignacion:2' }).success).toBe(false);
    expect(aceptarNotaSchema.safeParse({ sucursal_id: 1, mapeo: [], valoracion: 'valor_convenido', clave_idempotencia: 'consignacion:2' }).success).toBe(true);
  });

  test('derechos frente al dueño (punto 7): solo se descuentan con acuerdo', () => {
    expect(liquidarRecibidaSchema.safeParse({ clave_idempotencia: 'liquidar:01' }).success).toBe(true);
    expect(liquidarRecibidaSchema.safeParse({ clave_idempotencia: 'liquidar:01', descontar_derechos: true }).success).toBe(false);
    expect(liquidarRecibidaSchema.safeParse({ clave_idempotencia: 'liquidar:01', descontar_derechos: true, acuerdo: 'ok' }).success).toBe(false);
    expect(liquidarRecibidaSchema.safeParse({ clave_idempotencia: 'liquidar:01', descontar_derechos: true, acuerdo: 'Acuerdo escrito del 7 nov' }).success).toBe(true);
  });

  test('faltante o daño (punto 7): evidencia y responsable obligatorios', () => {
    const n = { linea_id: UUID, tipo: 'faltante', cantidad: 1, responsable: 'por_determinar', evidencia: 'Conteo físico', clave_idempotencia: 'novedad:01' };
    expect(novedadSchema.safeParse(n).success).toBe(true);
    expect(novedadSchema.safeParse({ ...n, evidencia: 'x' }).success).toBe(false);
    expect(novedadSchema.safeParse({ ...n, responsable: undefined }).success).toBe(false);
    expect(novedadSchema.safeParse({ ...n, gasto: '5195' }).success).toBe(false);
  });

  test('cruce de anticipo (punto 6) y cuentas de consignación (punto 1)', () => {
    expect(cruceAnticipoSchema.safeParse({ anticipo_id: UUID, monto: 50000, clave_idempotencia: 'cruce:0001' }).success).toBe(true);
    expect(cruceAnticipoSchema.safeParse({ anticipo_id: UUID, monto: 0, clave_idempotencia: 'cruce:0001' }).success).toBe(false);
    expect(cuentasConsignacionSchema.safeParse({ contra: '9405' }).success).toBe(true);
    expect(cuentasConsignacionSchema.safeParse({ contra: '9905' }).success).toBe(false);
    expect(cuentasConsignacionSchema.safeParse({}).success).toBe(false);
    expect(cuentasConsignacionSchema.safeParse({ contra: '9405', remuneracion: '4135' }).success).toBe(false);
  });

  test('invitar y aceptar un vínculo piden un solo tercero y un token de 64 hex', () => {
    expect(invitarSchema.safeParse({ proveedor_id: 1, correo: 'gerencia@ejemplo.co' }).success).toBe(true);
    expect(invitarSchema.safeParse({ proveedor_id: 1, cliente_id: UUID, correo: 'a@b.co' }).success).toBe(false);
    expect(invitarSchema.safeParse({ correo: 'a@b.co' }).success).toBe(false);
    const token = 'a'.repeat(64);
    expect(aceptarVinculoSchema.safeParse({ token, organizacion_id: 1, proveedor_id: 2 }).success).toBe(true);
    expect(aceptarVinculoSchema.safeParse({ token: 'corto', organizacion_id: 1, proveedor_id: 2 }).success).toBe(false);
  });
});

describe('errores', () => {
  test('códigos estables y estado HTTP', () => {
    expect(codigoErrorRecibida('clasificacion_obligatoria')).toBe('clasificacion_obligatoria');
    expect(codigoErrorRecibida('estimatorio_bloqueado_438_455')).toBe('estimatorio_bloqueado_438_455');
    expect(codigoErrorRecibida('excede_obligacion_con_el_dueno')).toBe('excede_obligacion_con_el_dueno');
    expect(codigoErrorRecibida('STOCK_INSUFICIENTE: x')).toBe('stock_insuficiente');
    expect(codigoErrorRecibida('Acceso denegado a la organización 9')).toBe('sin_permiso');
    expect(codigoErrorRecibida('otra cosa')).toBe('error_desconocido');
    expect(estadoHttpErrorRecibida('sin_permiso')).toBe(403);
    expect(estadoHttpErrorRecibida('pendiente_de_activar')).toBe(501);
    expect(estadoHttpErrorRecibida('liquidacion_no_es_la_ultima')).toBe(409);
    expect(estadoHttpErrorRecibida('anticipo_no_encontrado')).toBe(404);
    expect(estadoHttpErrorRecibida('compra_real_usa_factura')).toBe(422);
  });

  test('los bloqueos por configuración (y el estimatorio) dejan pendiente contable', () => {
    expect(ERRORES_DE_CONFIGURACION).toEqual(
      expect.arrayContaining(['sin_cuenta_orden_consignacion', 'sin_cuenta_contra_orden', 'sin_cuenta_recaudo_propietario', 'sin_cuenta_remuneracion', 'estimatorio_bloqueado_438_455']),
    );
  });

  test('migración sin aplicar = pendiente de activar', () => {
    expect(esPendienteRecibida({ code: '42P01' })).toBe(true);
    expect(esPendienteRecibida({ message: 'relation "organization_links" does not exist' })).toBe(true);
    expect(esPendienteRecibida({ message: 'otra cosa' })).toBe(false);
  });
});

describe('liquidación al consignante: la MISMA fórmula que la base (prueba en seco 2026-11-07, ronda 2)', () => {
  test('mandato, 15 % sobre el pactado: 3 und × 60.000 → dueño 153.000, remuneración 27.000', () => {
    const v = vistaLiquidacion([{ cantidad: 3, venta: 180000, pactado: 180000, precioLiquidacion: null }], { remuneracionModo: 'porcentaje', baseComision: 'precio_pactado', comisionPct: 15 });
    expect(v).toEqual({ venta: 180000, pactado: 180000, dueno: 153000, remuneracion: 27000, bajoPrecio: false });
  });

  test('derecho frente al dueño descontado con acuerdo: +2 −1 → dueño 51.000', () => {
    const v = vistaLiquidacion(
      [
        { cantidad: 2, venta: 120000, pactado: 120000, precioLiquidacion: null },
        { cantidad: -1, venta: -60000, pactado: -60000, precioLiquidacion: null },
      ],
      { remuneracionModo: 'porcentaje', baseComision: 'precio_pactado', comisionPct: 15 },
    );
    expect(v.dueno).toBe(51000);
  });

  test('precio de liquidación 42.000: 2 × 50.000 → dueño 84.000, remuneración 16.000', () => {
    const v = vistaLiquidacion([{ cantidad: 2, venta: 100000, pactado: 100000, precioLiquidacion: 42000 }], { remuneracionModo: 'precio_liquidacion', baseComision: 'precio_pactado', comisionPct: 0 });
    expect(v.dueno).toBe(84000);
    expect(v.remuneracion).toBe(16000);
  });

  test('entre organizaciones, 10 % sobre la venta: 1 × 70.000 → dueño 63.000', () => {
    const v = vistaLiquidacion([{ cantidad: 1, venta: 70000, pactado: 70000, precioLiquidacion: null }], { remuneracionModo: 'porcentaje', baseComision: 'precio_venta', comisionPct: 10 });
    expect(v.dueno).toBe(63000);
  });

  test('venta por debajo del precio de liquidación: se marca', () => {
    expect(vistaLiquidacion([{ cantidad: 1, venta: 10000, pactado: 25000, precioLiquidacion: 20000 }], { remuneracionModo: 'precio_liquidacion', baseComision: 'precio_pactado', comisionPct: 0 }).bajoPrecio).toBe(true);
  });
});

describe('KPIs y búsqueda de Recibidas', () => {
  const nota = (over: Partial<NotaRecibida>): NotaRecibida => ({
    id: 'n1',
    numero: 'NCR-0001',
    proveedorId: 1,
    consignante: 'Consignante uno',
    sucursalId: 1,
    contrato: 'intermediacion',
    condicion: 'agente',
    tributario: 'mandato',
    valoracion: 'costo_acreditado',
    precioModo: 'fijo',
    remuneracionModo: 'porcentaje',
    baseComision: 'precio_pactado',
    comisionPct: 15,
    reconocimiento: 'al_vender',
    obligacionPosterior: null,
    remuneracionPorReconocer: 0,
    facturaRemuneracion: false,
    obligacionDueno: 'venta',
    riesgos: { devoluciones: 'dueno', perdidas: 'consignatario', gastos: 'consignatario' },
    estado: 'en_consignacion',
    vinculada: false,
    numeroExterno: null,
    cuentas: { orden: '911520', contra: '9405', recaudo: '28151001', remuneracion: '41351201' },
    derechosFrenteAlDueno: 0,
    fecha: '2026-11-07T10:00:00Z',
    lineas: [
      {
        id: 'l1',
        productoId: 1,
        producto: 'P',
        productoConsignante: null,
        recibido: 10,
        vendido: 2,
        devuelto: 2,
        novedades: 0,
        precioPactado: 60000,
        precioLiquidacion: null,
        costoAcreditado: 40000,
        valorCustodia: 40000,
        sinLiquidar: { cantidad: 2, venta: 120000, pactado: 120000 },
      },
    ],
    liquidaciones: [],
    vendidoSinLiquidar: 120000,
    unidadesSinLiquidar: 2,
    ...over,
  });

  test('en tu poder a precio pactado, vendido sin liquidar y remuneración estimada', () => {
    const k = kpisRecibidas([nota({})]);
    expect(k.enTuPoder).toBe(360000);
    expect(k.vendidoSinLiquidar).toBe(120000);
    expect(k.remuneracion).toBe(18000);
    expect(k.notasConVentas).toBe(1);
  });

  test('los faltantes y daños ya no están en tu poder', () => {
    expect(enTuPoder({ recibido: 10, vendido: 4, devuelto: 0, novedades: 1 })).toBe(5);
  });

  test('busca por número o consignante', () => {
    const ns = [nota({}), nota({ id: 'n2', numero: 'NCR-0002', consignante: 'Otra tienda' })];
    expect(filtrarRecibidas(ns, '0002').map((n) => n.id)).toEqual(['n2']);
    expect(filtrarRecibidas(ns, 'uno').map((n) => n.id)).toEqual(['n1']);
  });
});

describe('navegación: Consignaciones vive en Inventario', () => {
  const hrefs = CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => p.href));
  test('la página está en Inventario y ya no en Finanzas', () => {
    expect(hrefs).toContain('/app/inventario/consignaciones');
    expect(hrefs).not.toContain('/app/finanzas/consignaciones');
    expect(RUTA_CONSIGNACIONES).toBe('/app/inventario/consignaciones');
  });
  test('la ruta vieja redirige', () => {
    expect(leer('src/app/app/finanzas/consignaciones/page.tsx')).toMatch(/permanentRedirect\('\/app\/inventario\/consignaciones'\)/);
    expect(leer('src/app/app/finanzas/consignaciones/[id]/page.tsx')).toMatch(/permanentRedirect\(`\/app\/inventario\/consignaciones\//);
  });
});

describe('migraciones sin aplicar: lo que no se puede perder (Ronda 2 del Contador)', () => {
  const vinculos = sinComentarios(leer('supabase/migrations/20261108120500_organization_links.sql'));
  const consignaciones = sinComentarios(leer('supabase/migrations/20261108121000_consignaciones.sql'));
  const cuerpo = (fn: string) => {
    const inicio = consignaciones.indexOf(`create or replace function public.${fn}(`);
    expect(inicio).toBeGreaterThan(-1);
    return consignaciones.slice(inicio, consignaciones.indexOf('$function$;', inicio));
  };

  test('las dos tienen su reversión, que borra todo lo que crea la de consignaciones', () => {
    expect(leer('supabase/rollbacks/20261108120500_organization_links_rollback.sql')).toMatch(/drop table if exists public\.organization_links;/);
    const rb = leer('supabase/rollbacks/20261108121000_consignaciones_rollback.sql');
    expect(rb).toMatch(/drop trigger if exists trg_consignacion_venta/);
    for (const m of consignaciones.matchAll(/create table if not exists public\.(\w+)/g)) expect(rb).toContain(`drop table if exists public.${m[1]};`);
    for (const m of consignaciones.matchAll(/create or replace function public\.(\w+)\(/g)) expect(rb).toContain(`public.${m[1]}(`);
  });

  test('nada para anon y ninguna escritura directa desde authenticated', () => {
    for (const sql of [vinculos, consignaciones]) {
      expect(sql).not.toMatch(/grant\s+[^;]*\bto\s+[^;]*\banon\b/i);
      expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
    }
  });

  test('el token del vínculo se guarda con hash y su columna no se puede leer', () => {
    expect(vinculos).toMatch(/token_hash text not null check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(vinculos).toMatch(/revoke all on public\.organization_links from anon, authenticated/);
    const grant = /grant select \(([^)]*)\)\s+on public\.organization_links to authenticated/.exec(vinculos);
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toMatch(/token_hash/);
  });

  test('punto 2: modalidad, condición contable y tratamiento tributario separados, obligatorios y sin default', () => {
    expect(consignaciones).toMatch(/legal_modality text not null check \(legal_modality in \('intermediacion', 'estimatorio', 'compra'\)\),/);
    expect(consignaciones).toMatch(/accounting_role text not null check \(accounting_role in \('agente', 'principal'\)\),/);
    expect(consignaciones).toMatch(/tax_treatment text not null check/);
    expect(consignaciones).not.toMatch(/(legal_modality|accounting_role|tax_treatment|remuneration_recognition|fee_invoice_required) text not null default/);
    expect(consignaciones).toMatch(/raise exception 'clasificacion_obligatoria'/);
    expect(consignaciones).toMatch(/raise exception 'compra_real_usa_factura'/);
    expect(consignaciones).toMatch(/raise exception 'condicion_contable_obligatoria'/);
  });

  test('punto 2: nada de compra ni costo automáticos (ni al vender ni al liquidar)', () => {
    expect(consignaciones).not.toMatch(/lineas_compra|purchase_invoice|invoice_purchase|cost_account_code|fn_consignacion_recibida_cerrar_compra/);
  });

  test('punto 3: el estimatorio no opera hasta parametrizar los arts. 438 y 455', () => {
    expect(consignaciones).toMatch(/estimatorio_rules jsonb/);
    for (const fn of ['fn_consignacion_entregar', 'fn_consignacion_recibir_interna', 'fn_consignacion_recibida_liquidar', 'fn_consignacion_liquidar']) {
      expect(cuerpo(fn)).toMatch(/estimatorio_bloqueado_438_455/);
    }
    expect(consignaciones).not.toMatch(/create or replace function public\.fn_consignacion_\w*estimatorio_reglas|update public\.consignment_account_settings\s+set estimatorio_rules/);
  });

  test('punto 1: 911520 contra una cuenta DEFINIDA del grupo 94 (nunca 9905, sin respaldo por patrón), con valoración por contrato', () => {
    const cuentas = cuerpo('fn_consignacion_cuentas_recibida');
    expect(cuentas).toMatch(/memo_contra_account_code, '\^94\[0-9\]\{2,6\}\$'/);
    expect(cuentas).not.toMatch(/fn_consignacion_cuenta_patron\(p_org, '\^94/);
    expect(consignaciones).not.toMatch(/9905/);
    expect(consignaciones).toMatch(/memo_valuation text check \(memo_valuation in \('costo_acreditado', 'valor_convenido'\)\)/);
    expect(consignaciones).toMatch(/'\^911520\(\[0-9\]\{2\}\)\?\$'/);
    expect(consignaciones).toMatch(/'\^281510\[0-9\]\{2\}\$'/);
    expect(consignaciones).toMatch(/'\^413512\[0-9\]\{2\}\$'/);
    expect(consignaciones).not.toMatch(/4225/);
    expect(consignaciones).not.toMatch(/fn_puc_asegurar_cuenta|fn_puc_cuenta_para_asiento|insert into public\.chart_of_accounts/);
  });

  test('punto 8: la entregada sigue en el inventario propio, sin 1465 ni asiento al entregar', () => {
    expect(consignaciones).not.toMatch(/1465|fn_cuenta_inventario_consignacion/);
    const entregar = cuerpo('fn_consignacion_entregar');
    expect(entregar).toMatch(/'transfer_out'/);
    expect(entregar).not.toMatch(/fn_create_journal_entry/);
  });

  test('punto 4 y Ronda 3: remuneración al devengarse (al vender u obligación posterior con evidencia), nunca por la liquidación', () => {
    expect(consignaciones).toMatch(/remuneration_recognition text not null check \(remuneration_recognition in \('al_vender', 'obligacion_posterior'\)\)/);
    expect(consignaciones).not.toMatch(/al_liquidar/);
    expect(cuerpo('fn_consignacion_asignar_venta')).toMatch(/remuneration_recognition = 'al_vender'/);
    expect(cuerpo('fn_consignacion_recibida_liquidar')).not.toMatch(/fn_create_journal_entry/);
    expect(cuerpo('fn_consignacion_recibida_liquidar')).toMatch(/consignacion_factura_remuneracion/);
    expect(cuerpo('fn_consignacion_reconocer_remuneracion')).toMatch(/evidencia_obligatoria/);
    expect(cuerpo('fn_consignacion_terminos')).toMatch(/obligacion_posterior_obligatoria/);
  });

  test('Ronda 3, punto 2 y Ronda 4, punto 4: retenciones por ámbito con LOS MISMOS criterios que anticipos (sin copia), nunca 0 ni tarifa fija', () => {
    const ret = cuerpo('fn_consignacion_retenciones_liquidacion');
    expect(ret).toMatch(/'operacion'/);
    expect(ret).toMatch(/'remuneracion'/);
    // Regla 7: la evaluación es la de anticipos (20261108170000); consignación no tiene su propia lectura de calidades.
    expect(ret).toMatch(/fn_tributario_evaluar_retencion/);
    expect(ret).toMatch(/fn_tributario_calidades_tercero/);
    expect(ret).toMatch(/criterios_tributarios_no_instalados/);
    expect(consignaciones).not.toMatch(/fn_consignacion_aplicar_regla|fn_consignacion_tiene_resp/);
    expect(ret).not.toMatch(/\* (11|10|4|2\.5|15) \//);
    const evaluador = sinComentarios(leer('supabase/migrations/20261108170000_anticipos_proveedores_contador.sql'));
    const inicio = evaluador.indexOf('create or replace function public.fn_tributario_evaluar_retencion(');
    expect(inicio).toBeGreaterThan(-1);
    const ev = evaluador.slice(inicio, evaluador.indexOf('$function$;', inicio));
    expect(ev).toMatch(/organization_taxes/);
    expect(ev).toMatch(/sin_regla_configurada/);
    expect(ev).toMatch(/autorretencion_sin_verificar/);
    expect(ev).toMatch(/calidad_agente_reteiva_por_acreditar/);
    // Pendiente = valor NULL (nunca 0); estimada y practicada separadas.
    expect(consignaciones).toMatch(/\(status = 'pendiente' and amount is null\)/);
    expect(consignaciones).toMatch(/status in \('estimada', 'pendiente', 'no_aplica', 'practicada'\)/);
    expect(consignaciones).toMatch(/create or replace function public\.fn_consignacion_conciliar_retencion\(/);
    expect(consignaciones).not.toMatch(/\bp_retenciones\b|consignacion_retenciones_pago_abono/);
  });

  test('Ronda 4, puntos 1 y 2: la retención practicada se reconoce sin esperar el certificado; el certificado solo concilia', () => {
    const practicada = cuerpo('fn_consignacion_retencion_practicada');
    expect(practicada).toMatch(/fn_finanzas_exigir_permiso/);
    expect(practicada).toMatch(/p_debit_account := v_nota\.owner_account_code, p_credit_account := v_cuenta/);
    expect(practicada).toMatch(/p_debit_account := v_sufrida, p_credit_account := v_nota\.owner_receivable_account_code/);
    expect(practicada).toMatch(/consignacion_cartera_retencion_por_aplicar/);
    expect(cuerpo('fn_consignacion_conciliar_retencion')).toMatch(/retencion_no_reconocida/);
    expect(cuerpo('fn_consignacion_conciliar_retencion')).not.toMatch(/fn_create_journal_entry/);
  });

  test('Ronda 4, punto 3: anular la liquidación no cierra pendientes; se cierran al reliquidar o al revertir la venta', () => {
    expect(cuerpo('fn_consignacion_recibida_anular_liquidacion')).not.toMatch(/resolution = 'liquidacion_anulada'/);
    expect(cuerpo('fn_consignacion_recibida_liquidar')).toMatch(/'reliquidada:'/);
    expect(cuerpo('fn_consignacion_revertir_venta')).toMatch(/'venta_revertida'/);
  });

  test('Ronda 4, punto 5: comisión contra la 281510 solo compensable; si no, derecho por cobrar', () => {
    const rec = cuerpo('fn_consignacion_reconocer_int');
    expect(rec).toMatch(/commission_offset_agreed/);
    expect(rec).toMatch(/fn_consignacion_saldo_dueno/);
    expect(rec).toMatch(/owner_receivable_account_code/);
    expect(cuerpo('fn_consignacion_terminos')).toMatch(/compensacion_remuneracion/);
    expect(cuerpo('fn_consignacion_compensar_remuneracion')).toMatch(/compensacion_no_pactada/);
    expect(cuerpo('fn_consignacion_asignar_venta')).not.toMatch(/p_debit_account := v_l\.owner_account_code, p_credit_account := v_l\.remuneration_account_code/);
  });

  test('punto 6: el anticipo se cruza con el saldo real de 281510 del dueño, sin compra', () => {
    const cruce = cuerpo('fn_consignacion_cruzar_anticipo');
    expect(cruce).toMatch(/supplier_advances/);
    expect(cruce).toMatch(/excede_obligacion_con_el_dueno/);
    expect(cruce).toMatch(/p_debit_account := v_nota\.owner_account_code, p_credit_account := v_ant\.account_code/);
  });

  test('punto 7: faltantes y daños sin gasto automático; derechos frente al dueño solo con acuerdo', () => {
    const novedad = cuerpo('fn_consignacion_registrar_novedad');
    expect(novedad).toMatch(/evidencia_obligatoria/);
    expect(novedad).not.toMatch(/'5\d{3}|accounts_payable/);
    expect(cuerpo('fn_consignacion_revertir_venta')).toMatch(/owner_right/);
    expect(cuerpo('fn_consignacion_recibida_liquidar')).toMatch(/acuerdo_obligatorio/);
  });

  test('anular solo la última liquidación, por orden (no por created_at, que empata en una transacción)', () => {
    expect(cuerpo('fn_consignacion_recibida_anular_liquidacion')).toMatch(/s\.seq > v_liq\.seq/);
  });

  test('kardex solo por la primitiva y asientos solo por fn_create_journal_entry', () => {
    expect(consignaciones).not.toMatch(/insert into public\.(stock_movements|stock_levels|journal_entries|journal_lines|accounts_payable)\b/i);
    expect(consignaciones).toMatch(/fn_inv_int_mover/);
  });

  test('toda función que escribe exige permiso de finanzas', () => {
    const publicas = [
      'fn_consignacion_configurar_cuentas',
      'fn_consignacion_entregar',
      'fn_consignacion_recibir_interna',
      'fn_consignacion_recibida_devolver',
      'fn_consignacion_registrar_novedad',
      'fn_consignacion_recibida_liquidar',
      'fn_consignacion_recibida_anular_liquidacion',
      'fn_consignacion_cruzar_anticipo',
      'fn_consignacion_recibida_aceptar',
      'fn_consignacion_reconocer_remuneracion',
      'fn_consignacion_conciliar_retencion',
      'fn_consignacion_configurar_retenciones',
      'fn_consignacion_retencion_practicada',
      'fn_consignacion_compensar_remuneracion',
    ];
    for (const fn of publicas) expect(cuerpo(fn)).toMatch(/fn_finanzas_exigir_permiso/);
  });
});
