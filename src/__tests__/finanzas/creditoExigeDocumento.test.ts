/**
 * Venta a crédito o con saldo pendiente exige el documento del cliente (Contador, 2026-11-25, punto 1),
 * y la reasignación de tercero de las facturas a consumidor final cuyo cliente hoy tiene documento
 * (punto 2).
 *
 * Contado: igual que hoy. Con saldo y sin documento: la base rechaza con documento_requerido_credito
 * y la pantalla pide el documento con «Editar datos de facturación».
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CODIGO_DOCUMENTO_CREDITO,
  accionAnteRechazoCredito,
  accionDocumentoCredito,
  documentoValido,
  esErrorDocumentoCredito,
} from '@/lib/cartera/documentoCredito';
import { codigoErrorCobro, mensajeErrorOutbox } from '@/lib/pos/erroresCobro';
import { codigoErrorFactura, estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';

const REPO = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const PERSONA = '11111111-1111-4111-8111-111111111111';
const EMPRESA = '22222222-2222-4222-8222-222222222222';

describe('venta de contado: igual que hoy', () => {
  test('sin saldo no se pide nada, aunque sea a consumidor final o sin cliente', () => {
    expect(accionDocumentoCredito({ saldo: 0, personaId: null, facturarA: null, personaTieneDocumento: false })).toBe('ninguna');
    expect(accionDocumentoCredito({ saldo: 0, personaId: PERSONA, facturarA: { modo: 'consumidor_final', empresaId: null }, personaTieneDocumento: false })).toBe('ninguna');
  });

  test('un residuo de redondeo (≤ $1) no es crédito', () => {
    expect(accionDocumentoCredito({ saldo: 0.5, personaId: null, facturarA: null, personaTieneDocumento: false })).toBe('ninguna');
    expect(accionDocumentoCredito({ saldo: 1, personaId: PERSONA, facturarA: null, personaTieneDocumento: false })).toBe('ninguna');
  });
});

describe('venta con saldo', () => {
  test('a una persona sin documento: se le pide el documento', () => {
    expect(accionDocumentoCredito({ saldo: 50000, personaId: PERSONA, facturarA: null, personaTieneDocumento: false })).toBe('pedir_documento');
    // La persona sin documento arranca en «Consumidor final» (como hoy): también se pide.
    expect(accionDocumentoCredito({ saldo: 50000, personaId: PERSONA, facturarA: { modo: 'consumidor_final', empresaId: null }, personaTieneDocumento: false })).toBe('pedir_documento');
  });

  test('sin cliente: hay que escoger uno', () => {
    expect(accionDocumentoCredito({ saldo: 50000, personaId: null, facturarA: null, personaTieneDocumento: false })).toBe('elegir_cliente');
  });

  test('persona con documento escogida como «Consumidor final»: cambiar «Facturar a»', () => {
    expect(accionDocumentoCredito({ saldo: 50000, personaId: PERSONA, facturarA: { modo: 'consumidor_final', empresaId: null }, personaTieneDocumento: true })).toBe('cambiar_facturar_a');
  });

  test('persona con documento o empresa ligada: se guarda como siempre', () => {
    expect(accionDocumentoCredito({ saldo: 50000, personaId: PERSONA, facturarA: { modo: 'persona', empresaId: null }, personaTieneDocumento: true })).toBe('ninguna');
    expect(accionDocumentoCredito({ saldo: 50000, personaId: PERSONA, facturarA: { modo: 'empresa', empresaId: EMPRESA }, personaTieneDocumento: false })).toBe('ninguna');
  });

  test('tras el rechazo de la base nunca se queda sin hacer nada', () => {
    expect(accionAnteRechazoCredito({ personaId: PERSONA, facturarA: null, personaTieneDocumento: true })).toBe('pedir_documento');
    expect(accionAnteRechazoCredito({ personaId: null, facturarA: null, personaTieneDocumento: false })).toBe('elegir_cliente');
  });

  test('el 222222222222 no es un documento', () => {
    expect(documentoValido('222222222222')).toBe(false);
    expect(documentoValido('  ')).toBe(false);
    expect(documentoValido(null)).toBe(false);
    expect(documentoValido('900123456')).toBe(true);
    expect(documentoValido('900123456', '900123456')).toBe(false);
  });
});

describe('el rechazo de la base se reconoce en el POS y en la factura', () => {
  const rpc = { message: 'documento_requerido_credito', details: 'La factura FACT-1 deja un saldo de 50000.00 por cobrar a consumidor final.', code: 'P0001' };

  test('error de PostgREST, de la ruta de facturas y texto plano', () => {
    expect(esErrorDocumentoCredito(rpc)).toBe(true);
    expect(esErrorDocumentoCredito({ codigo: CODIGO_DOCUMENTO_CREDITO })).toBe(true);
    expect(esErrorDocumentoCredito('documento_requerido_credito: detalle')).toBe(true);
    expect(esErrorDocumentoCredito({ message: 'deuda_sin_cliente' })).toBe(false);
    expect(esErrorDocumentoCredito(null)).toBe(false);
  });

  test('código estable del cobro, de la bandeja sin conexión y de la factura (422)', () => {
    expect(codigoErrorCobro(rpc)).toBe('documento_requerido_credito');
    const t = (clave: string, v?: Record<string, string>) => `${clave}|${v?.detalle ?? ''}`;
    expect(mensajeErrorOutbox('P0001 — documento_requerido_credito — saldo', t)).toBe('errores.documento_requerido_credito|saldo');
    expect(codigoErrorFactura('documento_requerido_credito')).toBe('documento_requerido_credito');
    expect(estadoHttpErrorFactura('documento_requerido_credito')).toBe(422);
  });

  test('textos en los cuatro idiomas', () => {
    for (const l of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(leer(`messages/${l}.json`));
      expect(typeof m.posCobroServidor.errores.documento_requerido_credito).toBe('string');
      expect(typeof m.facturasVenta.errores.documento_requerido_credito).toBe('string');
      for (const k of ['guardado', 'errorCarga', 'cambiarFacturarA', 'elegirCliente']) expect(typeof m.documentoCredito[k]).toBe('string');
      expect(typeof m.documentoCredito.aviso.titulo).toBe('string');
      expect(typeof m.documentoCredito.aviso.descripcion).toBe('string');
    }
  });
});

describe('la base: 20261126011000_credito_exige_documento', () => {
  const BASE = '20261126011000_credito_exige_documento';
  const sql = leer(`supabase/migrations/${BASE}.sql`);
  const rollback = leer(`supabase/rollbacks/${BASE}_rollback.sql`);

  test('se revisa al confirmar (diferido), para no rechazar la factura que se paga en la misma transacción', () => {
    for (const disparador of [
      'zz_trg_factura_credito_exige_documento',
      'zz_trg_factura_credito_exige_documento_upd',
      'zz_trg_venta_credito_exige_documento',
      'zz_trg_cartera_credito_exige_documento',
    ]) {
      const i = sql.indexOf(`CREATE CONSTRAINT TRIGGER ${disparador}\n`);
      expect(i).toBeGreaterThan(0);
      expect(sql.slice(i, i + 200)).toContain('DEFERRABLE INITIALLY DEFERRED');
      expect(rollback).toContain(`DROP TRIGGER IF EXISTS ${disparador} ON`);
    }
    expect(sql).toContain("raise exception 'documento_requerido_credito'");
  });

  test('contado igual: solo facturas emitidas con saldo y ventas pendientes sin factura', () => {
    expect(sql).toContain("WHEN (new.status IN ('issued', 'partial')");
    expect(sql).toContain('AND coalesce(new.balance, 0) > 1)');
    // Una factura que ya estaba emitida y recibe un abono (issued → partial) no se vuelve a juzgar.
    expect(sql).toContain("coalesce(old.status, '') NOT IN ('issued', 'partial')");
  });

  test('lo que no es venta a crédito queda por fuera', () => {
    const regla = sql.slice(sql.indexOf('FUNCTION public.fn_credito_sin_documento'), sql.indexOf('FUNCTION public.fn_trg_credito_exige_documento'));
    expect(regla).toContain("current_setting('app.cobro_contraentrega', true), '') = 'cuadre'"); // faltante del domiciliario
    expect(regla).toContain("v_tipo_doc = 'credit_note'");
    expect(regla).toContain('s.table_session_id is not null'); // cuenta de mesa
    expect(regla).toContain("coalesce(v_r.source, '') = 'web'"); // pedido web
    expect(regla).toContain("p.status = 'void'"); // recibo anulado
    expect(regla).toContain('v_r.return_id is not null'); // devolución anulada
    expect(regla).toContain('fn_cliente_con_documento(v_org, v_cliente)');
  });

  test('el documento del consumidor final no cuenta como documento', () => {
    const doc = sql.slice(sql.indexOf('FUNCTION public.fn_cliente_con_documento'), sql.indexOf('FUNCTION public.fn_credito_sin_documento'));
    expect(doc).toContain("<> '222222222222'");
    expect(doc).toContain('fn_consumidor_final_contable(p_org)');
  });

  test('ningún nombre de organización ni credencial en el SQL', () => {
    expect(sql).not.toMatch(/service_role_key|eyJhbGci/);
  });
});

describe('la reasignación: 20261126010000_reasignacion_tercero_cliente_con_documento', () => {
  const BASE = '20261126010000_reasignacion_tercero_cliente_con_documento';
  const sql = leer(`supabase/migrations/${BASE}.sql`);
  const rollback = leer(`supabase/rollbacks/${BASE}_rollback.sql`);

  test('un ajuste por factura, enlazado a la factura y al recibo, con la nota del Contador', () => {
    expect(sql).toContain("'reasignacion_tercero:' || v_f.id::text");
    expect(sql).toContain("'reasignacion_tercero', v_f.id::text");
    expect(sql).toContain("v_nota constant text := 'Reasignación de tercero · cliente con documento'");
    expect(sql).toContain("' · recibo ' || v_p.recibo || ' · pago ' || v_p.id::text");
    expect(sql).toContain("'nota_contable', 'NA'");
  });

  test('no toca la factura ni los asientos originales, y no fuerza lo que no cuadra', () => {
    expect(sql).not.toMatch(/update\s+public\.invoice_sales/i);
    expect(sql).not.toMatch(/update\s+public\.journal_(entries|lines)/i);
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).toContain('abs((v_f.devengo - v_recibos) - coalesce(v_f.balance, 0)) > 1');
    expect(sql).toContain('Reasignación de tercero abortada');
  });

  test('el auxiliar sigue la reasignación para movimientos posteriores', () => {
    const factura = sql.slice(sql.indexOf('FUNCTION public.fn_tercero_cartera_factura'), sql.indexOf('FUNCTION public.fn_tercero_cartera_venta'));
    expect(factura.indexOf("'reasignacion_tercero:' || p_invoice::text")).toBeLessThan(factura.indexOf("'accrual:sale:' || v_sale::text"));
  });

  test('el rollback borra exactamente esos ajustes', () => {
    expect(rollback).toContain("e.fact_key like 'reasignacion_tercero:%'");
    expect(rollback).toContain("e.source = 'reasignacion_tercero'");
    expect(rollback).toContain('CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_factura');
  });
});
