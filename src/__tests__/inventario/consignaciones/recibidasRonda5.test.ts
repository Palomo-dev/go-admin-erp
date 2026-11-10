/**
 * Ronda 5 del Contador, consignación (docs/contador/RESPUESTAS-CONTADOR-RONDA-5-2026-11-09.md, respuestas 10 y 11):
 * el contrato recibido en mandato fija el orden de aplicación de lo recaudado y la liquidación por escrito
 * (C.Co. art. 1277); la retención de la operación se registra con el cobro de la factura y su abono queda en ese
 * momento, sin superar el saldo de la factura. Lógica sin React, cuerpos de las rutas y lo que la migración (sin
 * aplicar) no puede perder. Prueba en seco: docs/contador/pruebas/26_consignacion_ronda5_contador.sql.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONDICIONES_VACIAS,
  CONCEPTOS_APLICACION,
  ORDENES_APLICACION,
  aceptarNotaSchema,
  codigoErrorRecibida,
  estadoHttpErrorRecibida,
  liquidacionEscritaValida,
  ordenAplicacionValido,
  presetDeOrden,
  retencionPracticadaSchema,
  terminosDeCondiciones,
  terminosSchema,
  validarCondiciones,
  type CondicionesContrato,
} from '@/lib/inventario/consignaciones/recibidas';

const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');
const UUID = '11111111-2222-4333-8444-555555555555';

const RECIBIDA: CondicionesContrato = {
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
  ordenAplicacion: [...ORDENES_APLICACION.remuneracion_primero],
  liquidacionEscrita: { medio: 'documento_compartido', plazoDias: 10 },
  riesgos: { devoluciones: 'dueno', perdidas: 'dueno', gastos: 'consignatario' },
};

describe('respuesta 11: orden de aplicación y liquidación por escrito, términos obligatorios de la recibida', () => {
  test('sin valor por defecto: el formulario arranca vacío', () => {
    expect(CONDICIONES_VACIAS.ordenAplicacion).toBeNull();
    expect(CONDICIONES_VACIAS.liquidacionEscrita).toEqual({ medio: null, plazoDias: null });
  });

  test('la recibida los exige; la entregada (lado del mandante) no', () => {
    expect(validarCondiciones(RECIBIDA)).toEqual([]);
    expect(validarCondiciones({ ...RECIBIDA, ordenAplicacion: null })).toEqual(['orden_aplicacion']);
    expect(validarCondiciones({ ...RECIBIDA, liquidacionEscrita: { medio: null, plazoDias: 5 } })).toEqual(['liquidacion_escrita']);
    expect(validarCondiciones({ ...RECIBIDA, ordenAplicacion: null, liquidacionEscrita: { medio: null, plazoDias: null } }, 'entregada')).toEqual([]);
  });

  test('el orden: conceptos válidos, sin repetir y, con compensación pactada, la remuneración en el orden', () => {
    expect(ordenAplicacionValido(['remuneracion', 'anticipos'], true)).toBe(true);
    expect(ordenAplicacionValido(['anticipos', 'gastos_reembolsables'], true)).toBe(false);
    expect(ordenAplicacionValido(['anticipos', 'gastos_reembolsables'], false)).toBe(true);
    expect(ordenAplicacionValido(['remuneracion', 'remuneracion'], true)).toBe(false);
    expect(ordenAplicacionValido(['remuneracion', 'intereses'], true)).toBe(false);
    expect(ordenAplicacionValido([], false)).toBe(false);
    // Las tres opciones del formulario son órdenes completos y válidos.
    for (const orden of Object.values(ORDENES_APLICACION)) {
      expect([...orden].sort()).toEqual([...CONCEPTOS_APLICACION].sort());
      expect(ordenAplicacionValido(orden, true)).toBe(true);
    }
    expect(presetDeOrden(['gastos_reembolsables', 'remuneracion', 'anticipos', 'derechos_frente_al_dueno'])).toBe('gastos_primero');
    expect(presetDeOrden(['remuneracion', 'anticipos'])).toBeNull();
  });

  test('la liquidación por escrito: medio escrito y plazo entero de 1 a 90 días', () => {
    expect(liquidacionEscritaValida({ medio: 'correo_electronico', plazoDias: 1 })).toBe(true);
    expect(liquidacionEscritaValida({ medio: 'correo_electronico', plazoDias: 90 })).toBe(true);
    expect(liquidacionEscritaValida({ medio: 'correo_electronico', plazoDias: 0 })).toBe(false);
    expect(liquidacionEscritaValida({ medio: 'correo_electronico', plazoDias: 91 })).toBe(false);
    expect(liquidacionEscritaValida({ medio: 'correo_electronico', plazoDias: 2.5 })).toBe(false);
    expect(liquidacionEscritaValida({ medio: null, plazoDias: 5 })).toBe(false);
  });

  test('viajan a la base con las claves que valida fn_consignacion_terminos', () => {
    const t = terminosDeCondiciones(RECIBIDA);
    expect(t.orden_aplicacion).toEqual(ORDENES_APLICACION.remuneracion_primero);
    expect(t.liquidacion_escrita).toEqual({ medio: 'documento_compartido', plazo_dias: 10 });
    expect(terminosSchema.safeParse(t).success).toBe(true);
    expect(terminosSchema.safeParse({ ...t, orden_aplicacion: ['remuneracion', 'remuneracion'] }).success).toBe(false);
    expect(terminosSchema.safeParse({ ...t, orden_aplicacion: ['anticipos'] }).success).toBe(false);
    expect(terminosSchema.safeParse({ ...t, liquidacion_escrita: { medio: 'verbal', plazo_dias: 5 } }).success).toBe(false);
    expect(terminosSchema.safeParse({ ...t, liquidacion_escrita: { medio: 'correo_electronico', plazo_dias: 0 } }).success).toBe(false);
    expect(terminosDeCondiciones(RECIBIDA, { direccion: 'entregada' })).not.toHaveProperty('orden_aplicacion');
    expect(terminosDeCondiciones(RECIBIDA, { direccion: 'entregada' })).not.toHaveProperty('liquidacion_escrita');
  });

  test('al aceptar una nota de otra organización, quien recibe declara la compensación y los términos', () => {
    const base = { sucursal_id: 1, mapeo: [], valoracion: 'valor_convenido', clave_idempotencia: 'consignacion:9' };
    const terminos = { compensacion_remuneracion: true, orden_aplicacion: ['remuneracion', 'anticipos'], liquidacion_escrita: { medio: 'documento_compartido', plazo_dias: 3 } };
    expect(aceptarNotaSchema.safeParse({ ...base, terminos_contrato: terminos }).success).toBe(true);
    expect(aceptarNotaSchema.safeParse({ ...base, terminos_contrato: { ...terminos, orden_aplicacion: ['anticipos'] } }).success).toBe(false);
    expect(aceptarNotaSchema.safeParse({ ...base, terminos_contrato: { ...terminos, organization_id: 9 } }).success).toBe(false);
  });
});

describe('respuesta 10: la retención de la operación va con el cobro de la factura', () => {
  test('el cuerpo admite la factura y el cobro (uuid)', () => {
    const ok = { valor: 1710, base: 11400, fecha: '2026-11-09', soporte: 'Comprobante del pago de la factura', factura_id: UUID, cobro_id: UUID };
    expect(retencionPracticadaSchema.safeParse(ok).success).toBe(true);
    expect(retencionPracticadaSchema.safeParse({ ...ok, cobro_id: 'pago-1' }).success).toBe(false);
  });

  test('códigos estables de la base', () => {
    for (const c of ['cobro_obligatorio', 'cobro_de_otra_factura', 'fecha_distinta_del_cobro', 'retencion_excede_saldo_factura', 'orden_aplicacion_obligatorio', 'liquidacion_escrita_obligatoria', 'terminos_distintos_del_documento'] as const) {
      expect(codigoErrorRecibida(c)).toBe(c);
      expect(estadoHttpErrorRecibida(c)).toBe(422);
    }
  });
});

describe('lo que la migración sin aplicar no puede perder (20261108121000)', () => {
  const sql = sinComentarios(leer('supabase/migrations/20261108121000_consignaciones.sql'));

  test('la retención de la operación exige el cobro, su fecha y no abona de más', () => {
    for (const c of ['cobro_obligatorio', 'cobro_de_otra_factura', 'fecha_distinta_del_cobro', 'retencion_excede_saldo_factura']) expect(sql).toContain(c);
    expect(sql).toContain('consignment_withholding_receivable_applications');
    expect(sql).toMatch(/fn_consignacion_retencion_practicada\([^)]*p_pago uuid default null/s);
  });

  test('la cartera nunca se escribe a mano', () => {
    expect(sql).not.toMatch(/(insert\s+into|update)\s+public\.accounts_receivable/i);
  });

  test('el contrato recibido fija orden de aplicación y liquidación por escrito', () => {
    expect(sql).toContain('orden_aplicacion_obligatorio');
    expect(sql).toContain('liquidacion_escrita_obligatoria');
    expect(sql).toContain('settlement_terms');
    expect(sql).toMatch(/fn_consignacion_recibida_aceptar\([^)]*p_terminos_contrato jsonb default null/s);
  });

  test('ningún límite de seis períodos ni el decreto derogado', () => {
    const todo = leer('supabase/migrations/20261108121000_consignaciones.sql') + leer('supabase/migrations/20261108170000_anticipos_proveedores_contador.sql');
    expect(todo).not.toMatch(/271\s+de\s+2002|271\/2002/);
    expect(todo).not.toMatch(/seis\s+per[ií]odos|6\s+per[ií]odos/i);
  });
});
