/**
 * Cobro en caja sin doble cobro y con el total de la base (migración 20261125195945):
 * - «Cobrar» (sin entregar) con la contraentrega del envío viva lo rechaza la base
 *   (CONTRAENTREGA_EN_ENVIO / CONTRAENTREGA_EN_CUADRE); la pantalla lo anticipa con la misma regla y
 *   ofrece «Cobrar y entregar» solo si el paquete sigue en la sede.
 * - Los rechazos por total (TOTAL_PEDIDO_INCONSISTENTE, FACTURA_NO_COINCIDE, MONTO_NO_COINCIDE)
 *   llegan con su código a la caja, a «Cobrar y entregar» y al cuadre del domiciliario.
 * - La migración deja la regla en la base: la contraentrega se lee con SECURITY DEFINER, la cabecera
 *   del navegador no se inserta y solo los dos caminos que cierran el recaudo marcan la transacción.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'America/Bogota') }));

import { claveAvisoCobro, codigoErrorCobro } from '../webOrderConfirmationService';
import { codigoErrorCuadre } from '../logistica/cuadresDomiciliarioService';
import { bloqueoCobroSimple, envioSinSalir } from '@/lib/pos/pedidosWeb/entregaEnvio';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const MIGRACION = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '20261125195945_pos_cobro_caja_contraentrega_y_total_en_base.sql'),
  'utf8',
);
const REVERSION = readFileSync(
  join(RAIZ, 'supabase', 'rollbacks', '20261125195945_pos_cobro_caja_contraentrega_y_total_en_base_rollback.sql'),
  'utf8',
);

describe('«Cobrar» sin entregar frente a la contraentrega del envío', () => {
  it('pendiente en un envío vivo: la cobra el domiciliario', () => {
    expect(bloqueoCobroSimple({ status: 'out_for_delivery', cod_amount: 17800, cod_status: 'pending' })).toBe('en_envio');
    expect(bloqueoCobroSimple({ status: 'ready', cod_amount: '17800.00', cod_status: null })).toBe('en_envio');
  });

  it('cobrada sin cuadrar (también ya entregado): entra con el cuadre', () => {
    expect(bloqueoCobroSimple({ status: 'delivered', cod_amount: 17800, cod_status: 'collected' })).toBe('en_cuadre');
  });

  it('sin bloqueo: sin envío, sin contraentrega, ya girada a caja o envío cancelado/devuelto/fallido', () => {
    expect(bloqueoCobroSimple(null)).toBeNull();
    expect(bloqueoCobroSimple({ status: 'ready', cod_amount: 0, cod_status: 'pending' })).toBeNull();
    expect(bloqueoCobroSimple({ status: 'delivered', cod_amount: 17800, cod_status: 'remitted' })).toBeNull();
    for (const status of ['cancelled', 'returned', 'failed']) {
      expect(bloqueoCobroSimple({ status, cod_amount: 17800, cod_status: 'pending' })).toBeNull();
    }
  });

  it('«Cobrar y entregar» se ofrece solo con el paquete en la sede', () => {
    for (const s of ['pending', 'ready', 'ready_for_pickup', 'assigned']) expect(envioSinSalir(s)).toBe(true);
    for (const s of ['picked', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', null]) expect(envioSinSalir(s)).toBe(false);
  });
});

describe('códigos de la base hasta la pantalla', () => {
  it('caja: cada rechazo nuevo tiene su aviso', () => {
    expect(codigoErrorCobro({ message: 'CONTRAENTREGA_EN_ENVIO' })).toBe('CONTRAENTREGA_EN_ENVIO');
    expect(codigoErrorCobro({ message: 'CONTRAENTREGA_EN_CUADRE' })).toBe('CONTRAENTREGA_EN_CUADRE');
    expect(claveAvisoCobro('CONTRAENTREGA_EN_ENVIO')).toBe('contraentregaEnEnvio');
    expect(claveAvisoCobro('CONTRAENTREGA_EN_CUADRE')).toBe('contraentregaEnCuadre');
    for (const c of ['TOTAL_PEDIDO_INCONSISTENTE', 'FACTURA_NO_COINCIDE', 'MONTO_NO_COINCIDE'] as const) {
      expect(codigoErrorCobro({ message: c })).toBe(c);
      expect(claveAvisoCobro(c)).toBe('totalNoCoincide');
    }
  });

  it('cuadre del domiciliario: los rechazos por total no caen en el error genérico', () => {
    expect(codigoErrorCuadre('FACTURA_NO_COINCIDE')).toBe('FACTURA_NO_COINCIDE');
    expect(codigoErrorCuadre('MONTO_NO_COINCIDE')).toBe('MONTO_NO_COINCIDE');
    expect(codigoErrorCuadre('TOTAL_PEDIDO_INCONSISTENTE')).toBe('TOTAL_PEDIDO_INCONSISTENTE');
  });

  it('los textos existen en los cuatro idiomas', () => {
    for (const l of ['es', 'en', 'fr', 'pt']) {
      const m = JSON.parse(readFileSync(join(RAIZ, 'messages', `${l}.json`), 'utf8'));
      for (const k of ['contraentregaEnEnvio', 'contraentregaEnCuadre', 'totalNoCoincide']) {
        expect(typeof m.pedidoWeb.cobro[k]).toBe('string');
      }
      for (const k of ['TOTAL_PEDIDO_INCONSISTENTE', 'FACTURA_NO_COINCIDE', 'MONTO_NO_COINCIDE']) {
        expect(typeof m.logistica.envio.errores[k]).toBe('string');
        expect(typeof m.logistica.cuadres.errores[k]).toBe('string');
      }
    }
  });
});

describe('la regla vive en la base', () => {
  it('la contraentrega se lee con SECURITY DEFINER, cerrada a anon', () => {
    expect(MIGRACION).toMatch(/fn_cobro_caja_contraentrega_envio\(p_order_id uuid\)[\s\S]*security definer/);
    expect(MIGRACION).toContain('revoke all on function public.fn_cobro_caja_contraentrega_envio(uuid) from public, anon;');
  });

  it('solo «Cobrar y entregar» y el cuadre pasan con la contraentrega viva', () => {
    expect(MIGRACION).toContain("v_via not in ('entrega', 'cuadre')");
    expect(MIGRACION).toContain("set_config(''app.cobro_contraentrega'', ''entrega'', true)");
    expect(MIGRACION).toContain("set_config(''app.cobro_contraentrega'', ''cuadre'', true)");
  });

  it('la cabecera del navegador no se inserta: subtotal, impuestos y total salen del pedido', () => {
    const insercion = MIGRACION.slice(MIGRACION.indexOf('insert into public.invoice_sales'), MIGRACION.indexOf('returning * into v_inv'));
    expect(insercion).not.toContain("p_factura->>'total'");
    expect(insercion).not.toContain("p_factura->>'subtotal'");
    expect(insercion).toContain('v_total');
    expect(MIGRACION).toContain('COBRO_CAJA_TOTAL_CLIENTE_DESCARTADO');
  });

  it('la reversión restaura el cobro anterior y quita la función auxiliar', () => {
    expect(REVERSION).toContain("coalesce((p_factura->>'total')::numeric, v_wo.total, 0)");
    expect(REVERSION).toContain('drop function if exists public.fn_cobro_caja_contraentrega_envio(uuid);');
  });
});
