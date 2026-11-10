/**
 * Ronda 6 del Contador, consignación (docs/contador/RESPUESTAS-CONTADOR-RONDA-6-2026-11-10.md, respuestas 10, 12 y 13):
 * el abono por retención cuenta en el saldo de la factura igual que un pago (migración 20261110100000, escrita y sin
 * aplicar); la liquidación aplica lo recaudado en el orden del contrato (sin compensación pactada, la remuneración queda
 * por cobrar al dueño); el plazo de la liquidación por escrito corre desde el corte del período y su entrega deja
 * constancia. Lógica sin React, cuerpos de las rutas y lo que las migraciones (sin aplicar) no pueden perder.
 * Pruebas en seco: docs/contador/pruebas/30_consignacion_ronda6_contador.sql.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  aceptarNotaSchema,
  codigoErrorRecibida,
  entregaEscritaSchema,
  estadoHttpErrorRecibida,
  terminosSchema,
} from '@/lib/inventario/consignaciones/recibidas';

const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

describe('respuesta 13: liquidación por escrito', () => {
  const terminos = {
    contrato: 'intermediacion',
    condicion: 'agente',
    valoracion: 'costo_acreditado',
    precio_modo: 'fijo',
    remuneracion_modo: 'porcentaje',
    base_comision: 'precio_pactado',
    reconocimiento: 'al_vender',
    factura_remuneracion: false,
    obligacion_dueno: 'venta',
    compensacion_remuneracion: true,
    orden_aplicacion: ['remuneracion', 'anticipos'],
    liquidacion_escrita: { medio: 'correo_electronico', plazo_dias: 5 },
    riesgos: { devoluciones: 'dueno', perdidas: 'dueno', gastos: 'consignatario' },
  };

  test('sin «plazo_desde» vale (el plazo corre desde el corte); desde la liquidación exige la cláusula', () => {
    expect(terminosSchema.safeParse(terminos).success).toBe(true);
    const desdeCorte = { ...terminos, liquidacion_escrita: { medio: 'correo_electronico', plazo_dias: 5, plazo_desde: 'corte_del_periodo' } };
    expect(terminosSchema.safeParse(desdeCorte).success).toBe(true);
    const sinClausula = { ...terminos, liquidacion_escrita: { medio: 'correo_electronico', plazo_dias: 5, plazo_desde: 'fecha_de_liquidacion' } };
    expect(terminosSchema.safeParse(sinClausula).success).toBe(false);
    const conClausula = { ...terminos, liquidacion_escrita: { ...sinClausula.liquidacion_escrita, clausula: 'Cláusula 7: cinco días desde la liquidación' } };
    expect(terminosSchema.safeParse(conClausula).success).toBe(true);
    const ultimaVenta = { ...terminos, liquidacion_escrita: { medio: 'correo_electronico', plazo_dias: 5, plazo_desde: 'ultima_venta' } };
    expect(terminosSchema.safeParse(ultimaVenta).success).toBe(false);
  });

  test('al aceptar una nota de otra organización se admite la misma regla del plazo', () => {
    const base = { sucursal_id: 1, mapeo: [], valoracion: 'valor_convenido', clave_idempotencia: 'consignacion:9' };
    const t = { compensacion_remuneracion: false, orden_aplicacion: ['anticipos'], liquidacion_escrita: { medio: 'documento_compartido', plazo_dias: 3, plazo_desde: 'corte_del_periodo' } };
    expect(aceptarNotaSchema.safeParse({ ...base, terminos_contrato: t }).success).toBe(true);
  });

  test('la constancia de entrega exige fecha, medio escrito y soporte; nunca la organización', () => {
    const ok = { fecha: '2026-11-10', medio: 'correo_electronico', soporte: 'Correo enviado al dueño con la liquidación adjunta' };
    expect(entregaEscritaSchema.safeParse(ok).success).toBe(true);
    expect(entregaEscritaSchema.safeParse({ ...ok, medio: 'verbal' }).success).toBe(false);
    expect(entregaEscritaSchema.safeParse({ ...ok, soporte: 'ok' }).success).toBe(false);
    expect(entregaEscritaSchema.safeParse({ ...ok, organization_id: 9 }).success).toBe(false);
  });

  test('la ruta toma la organización de la sesión', () => {
    const ruta = 'src/app/api/consignaciones/recibidas/liquidaciones/[id]/entrega-escrita/route.ts';
    expect(existsSync(join(process.cwd(), ruta))).toBe(true);
    const codigo = leer(ruta);
    expect(codigo).toContain('withOrg');
    expect(codigo).not.toMatch(/organization_id/);
  });

  test('códigos estables de la base', () => {
    for (const c of ['derechos_fuera_del_orden_de_aplicacion', 'anticipos_fuera_del_orden_de_aplicacion', 'liquidacion_sin_entrega_escrita',
                     'medio_distinto_del_pactado', 'fecha_anterior_a_la_liquidacion'] as const) {
      expect(codigoErrorRecibida(c)).toBe(c);
      expect(estadoHttpErrorRecibida(c)).toBe(422);
    }
    expect(codigoErrorRecibida('entrega_ya_registrada')).toBe('entrega_ya_registrada');
    expect(estadoHttpErrorRecibida('entrega_ya_registrada')).toBe(409);
  });
});

describe('lo que 20261108121000 (sin aplicar) no puede perder', () => {
  const sql = sinComentarios(leer('supabase/migrations/20261108121000_consignaciones.sql'));

  test('respuesta 12: la liquidación aplica el orden; sin pacto la remuneración no se descuenta', () => {
    expect(sql).toContain('application jsonb');
    expect(sql).toContain("'compensacion_no_pactada'");
    expect(sql).toContain("'por_cobrar_al_dueno'");
    expect(sql).toContain("'espera_la_siguiente_liquidacion'");
    expect(sql).toContain('payable_amount = v_por_pagar');
    expect(sql).toContain('derechos_fuera_del_orden_de_aplicacion');
    expect(sql).toContain('anticipos_fuera_del_orden_de_aplicacion');
    expect(sql).toMatch(/kind text not null default 'compensacion' check \(kind in \('compensacion', 'reversion'\)\)/);
  });

  test('los libros siguen a la aplicación sin reconocer remuneración: el ajuste nunca toca el ingreso (413512)', () => {
    const ini = sql.indexOf('create or replace function public.fn_consignacion_ajustar_compensacion(');
    const ajuste = sql.slice(ini, sql.indexOf('$function$;', ini));
    expect(ini).toBeGreaterThan(0);
    expect(ajuste).toContain('owner_account_code');
    expect(ajuste).toContain('owner_receivable_account_code');
    expect(ajuste).not.toContain('remuneration_account_code');
    expect(sql).toContain('revoke all on function public.fn_consignacion_ajustar_compensacion(public.consignment_notes, uuid, numeric, text, uuid) from public, anon, authenticated;');
  });

  test('respuesta 13: el plazo corre desde el corte y la entrega deja constancia', () => {
    expect(sql).toContain("case when v_lt->>'plazo_desde' = 'fecha_de_liquidacion' then v_hoy else v_hasta end");
    expect(sql).toContain('fn_consignacion_liquidacion_entrega_registrar');
    expect(sql).toContain('fn_consignacion_vigilar_liquidaciones_escritas');
    expect(sql).toContain("'consignacion_liquidacion_escrita_por_entregar'");
    expect(sql).toContain("'consignacion_liquidacion_escrita_vencida'");
    expect(sql).toContain('written_delivery_support');
  });

  test('la cartera nunca se escribe a mano', () => {
    expect(sql).not.toMatch(/(insert\s+into|update)\s+public\.accounts_receivable/i);
  });
});

describe('respuesta 10: migración de cartera 20261110100000 (escrita, NO aplicada)', () => {
  const crudo = leer('supabase/migrations/20261110100000_cartera_abono_retencion_consignacion.sql');
  const mig = sinComentarios(crudo);
  const rb = leer('supabase/rollbacks/20261110100000_cartera_abono_retencion_consignacion_rollback.sql');

  test('sigue escrita y sin aplicar', () => {
    expect(crudo).toMatch(/ESCRITA, NO APLICADA/);
  });

  test('fn_invoice_sales_paid suma los abonos aplicados igual que un pago; el excedente de la nota crédito no', () => {
    expect(mig).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_invoice_sales_paid\(p_invoice_id uuid\)/);
    expect(mig).toContain('+ public.fn_invoice_sales_retenciones_abonadas(p_invoice_id);');
    expect(mig).toContain("x.status = 'aplicada'");
    expect(mig).toContain('v_pagado := fn_invoice_sales_paid(v_inv.id) - public.fn_invoice_sales_retenciones_abonadas(v_inv.id);');
  });

  test('el abono nace aplicado, recalcula su factura por disparador y no escribe la cartera', () => {
    expect(mig).toContain("v_valor, p_fecha, 'aplicada', v_e1, v_uid");
    expect(mig).toContain('fn_factura_venta_recalcular_saldo');
    expect(mig).not.toContain("'consignacion_cartera_retencion_por_aplicar', \n");
    expect(mig).not.toMatch(/(insert\s+into|update)\s+public\.accounts_receivable/i);
    expect(mig).not.toMatch(/insert\s+into\s+public\.payments/i);
  });

  test('la reversión restaura las definiciones exactas que reemplaza', () => {
    expect(rb).toContain('4c772ca4a7d6926ce091a7910ea4e1d7');
    expect(rb).toContain('e9cb33e070ea4c18e1912ee21455b8e6');
    expect(rb).not.toContain('fn_invoice_sales_retenciones_abonadas(p_invoice_id);');
    expect(rb).toContain('drop function if exists public.fn_invoice_sales_retenciones_abonadas(uuid);');
    const m121 = leer('supabase/migrations/20261108121000_consignaciones.sql');
    const ini = m121.indexOf('create or replace function public.fn_consignacion_retencion_practicada(');
    const fin = m121.indexOf('$function$;\n', ini) + '$function$;\n'.length;
    expect(ini).toBeGreaterThan(0);
    expect(rb).toContain(m121.slice(ini, fin));
  });
});
