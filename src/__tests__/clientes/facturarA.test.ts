/**
 * «Facturar a: persona o empresa» (Figma «06 Clientes» 3201-21438, 2026-11-25), con el cambio del
 * dueño: el cobro no se bloquea. Fija:
 *   - El punto de partida: persona (con documento) o consumidor final (sin documento); ninguna empresa
 *     marcada, ni siquiera «la última vez».
 *   - Adquiriente y contacto: sin elección, exactamente como antes (sin `contact_customer_id`); con
 *     empresa, `customer_id` = la empresa y `contact_customer_id` = la persona; consumidor final con
 *     documento, sin adquiriente.
 *   - La lista de precios sale de la empresa escogida.
 *   - El sobre de `pos_checkout_v1` y el contrato de la factura manual (`empresa_no_ligada` → 403).
 *   - La migración: aditiva, con su reversión y el rechazo `empresa_no_ligada` (42501).
 *
 * Datos inventados: organización 120, persona `per-1`, empresas `emp-1` y `emp-2`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  aGuardado,
  clienteDePrecios,
  desdeGuardado,
  esFacturaHabitual,
  facturarAInicial,
  mismaEleccion,
  normalizarFacturarA,
  partesDesdeGuardado,
  partesFactura,
  sugerenciaUltimaVez,
  type EmpresaFacturable,
} from '@/lib/clientes/facturarA';
import { buildCheckoutEnvelope } from '@/lib/offline/checkoutRpc';
import { estadoHttpErrorFactura, guardarFacturaSchema, codigoErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';
import type { CheckoutData } from '@/components/pos/types';

const EMPRESAS: EmpresaFacturable[] = [
  { id: 'emp-1', nombre: 'Empresa Uno S.A.S.', documento: 'NIT 900.000.001-1', iva: '48', correoFactura: 'factura@uno.example', cargo: 'Compras', principal: true },
  { id: 'emp-2', nombre: 'Empresa Dos S.A.S.', documento: 'NIT 900.000.002-1', iva: '49', correoFactura: null, cargo: null, principal: false },
];

describe('Facturar a — punto de partida (cambio del dueño: no bloquea)', () => {
  test('con documento arranca en la persona; sin documento, en consumidor final', () => {
    expect(facturarAInicial(true)).toEqual({ modo: 'persona', empresaId: null });
    expect(facturarAInicial(false)).toEqual({ modo: 'consumidor_final', empresaId: null });
  });

  test('«La última vez» es solo sugerencia: existe si sigue ligada, pero el inicio no la marca', () => {
    expect(sugerenciaUltimaVez(EMPRESAS, 'emp-2')?.id).toBe('emp-2');
    expect(sugerenciaUltimaVez(EMPRESAS, 'emp-9')).toBeNull();
    expect(facturarAInicial(true).empresaId).toBeNull();
  });

  test('una empresa que ya no está ligada vuelve al inicio', () => {
    expect(normalizarFacturarA({ modo: 'empresa', empresaId: 'emp-9' }, EMPRESAS, true)).toEqual({ modo: 'persona', empresaId: null });
    expect(normalizarFacturarA({ modo: 'empresa', empresaId: 'emp-1' }, EMPRESAS, true)).toEqual({ modo: 'empresa', empresaId: 'emp-1' });
    expect(normalizarFacturarA({ modo: 'persona', empresaId: null }, EMPRESAS, false)).toEqual({ modo: 'consumidor_final', empresaId: null });
  });
});

describe('Facturar a — adquiriente y contacto', () => {
  test('sin tocar nada: la persona, sin contacto (igual que hoy)', () => {
    expect(partesFactura('per-1', null, true)).toEqual({ customer_id: 'per-1', contact_customer_id: null });
    expect(partesFactura('per-1', facturarAInicial(true), true)).toEqual({ customer_id: 'per-1', contact_customer_id: null });
    expect(esFacturaHabitual(facturarAInicial(true), true)).toBe(true);
  });

  test('sin documento, consumidor final también es lo de siempre', () => {
    expect(partesFactura('per-1', facturarAInicial(false), false)).toEqual({ customer_id: 'per-1', contact_customer_id: null });
  });

  test('empresa escogida: la empresa adquiriente y la persona contacto', () => {
    expect(partesFactura('per-1', { modo: 'empresa', empresaId: 'emp-2' }, true)).toEqual({ customer_id: 'emp-2', contact_customer_id: 'per-1' });
  });

  test('consumidor final con documento: sin adquiriente y la persona contacto', () => {
    expect(partesFactura('per-1', { modo: 'consumidor_final', empresaId: null }, true)).toEqual({ customer_id: null, contact_customer_id: 'per-1' });
  });

  test('sin persona no hay contacto', () => {
    expect(partesFactura(null, { modo: 'empresa', empresaId: 'emp-1' }, true)).toEqual({ customer_id: null, contact_customer_id: null });
  });

  test('la lista de precios sale de la empresa escogida', () => {
    expect(clienteDePrecios('per-1', { modo: 'empresa', empresaId: 'emp-1' })).toBe('emp-1');
    expect(clienteDePrecios('per-1', { modo: 'consumidor_final', empresaId: null })).toBe('per-1');
    expect(clienteDePrecios('per-1', null)).toBe('per-1');
  });

  test('lo guardado en el carrito: null para lo de siempre, ida y vuelta para el resto', () => {
    expect(aGuardado(facturarAInicial(true), true)).toBeNull();
    const g = aGuardado({ modo: 'empresa', empresaId: 'emp-1' }, true);
    expect(g).toEqual({ modo: 'empresa', empresa_id: 'emp-1', persona_tiene_documento: true });
    expect(desdeGuardado(g)).toEqual({ modo: 'empresa', empresaId: 'emp-1' });
    expect(mismaEleccion(g, { ...g! })).toBe(true);
    expect(mismaEleccion(g, null)).toBe(false);
    expect(partesDesdeGuardado('per-1', g)).toEqual({ customer_id: 'emp-1', contact_customer_id: 'per-1' });
    expect(partesDesdeGuardado('per-1', null)).toEqual({ customer_id: 'per-1', contact_customer_id: null });
  });
});

describe('Facturar a — sobre de pos_checkout_v1', () => {
  const checkout = (facturar_a: CheckoutData['cart']['facturar_a']): CheckoutData => ({
    cart: {
      id: 'cart-1',
      organization_id: 120,
      branch_id: 7,
      customer_id: 'per-1',
      facturar_a,
      status: 'active',
      items: [{ id: 'i1', product_id: 1001, quantity: 1, unit_price: 5000, total: 5000, tax_rate: 19, product: { id: 1001, name: 'A' } } as never],
      subtotal: 5000,
      tax_amount: 0,
      tax_total: 0,
      discount_amount: 0,
      discount_total: 0,
      total: 5000,
      created_at: '2026-11-25T15:00:00.000Z',
      updated_at: '2026-11-25T15:00:00.000Z',
    },
    payments: [{ method: 'cash', amount: 5000 }],
    change: 0,
    total_paid: 5000,
    tax_included: true,
  });
  const sobre = (facturar_a: CheckoutData['cart']['facturar_a'], mode?: 'sale' | 'settle') =>
    buildCheckoutEnvelope({
      checkout: checkout(facturar_a),
      saleId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-11-25T15:00:00.000Z',
      organizationId: 120,
      branchId: 7,
      userId: null,
      currency: 'COP',
      itemCalcs: [{ lineNet: 4201.68, taxRate: 19, taxAmount: 798.32, total: 5000, taxIncluded: true, discount: 0 }],
      subtotal: 4201.68,
      taxTotal: 798.32,
      discountTotal: 0,
      total: 5000,
      promotionIds: [],
      invoiceCommissionAmount: 0,
      ...(mode ? { mode, paymentKey: '33333333-3333-4333-8333-333333333333' } : {}),
    });

  test('sin elección: el sobre de siempre (sin contact_customer_id)', () => {
    const env = sobre(null);
    expect(env.customer_id).toBe('per-1');
    expect('contact_customer_id' in env).toBe(false);
  });

  test('empresa escogida: customer_id = empresa y contact_customer_id = persona', () => {
    const env = sobre({ modo: 'empresa', empresa_id: 'emp-1', persona_tiene_documento: true });
    expect(env.customer_id).toBe('emp-1');
    expect(env.contact_customer_id).toBe('per-1');
  });

  test('consumidor final con documento: sin adquiriente y la persona contacto', () => {
    const env = sobre({ modo: 'consumidor_final', empresa_id: null, persona_tiene_documento: true });
    expect(env.customer_id).toBeNull();
    expect(env.contact_customer_id).toBe('per-1');
  });

  test('el cobro de una venta existente no cambia el adquiriente', () => {
    const env = sobre({ modo: 'empresa', empresa_id: 'emp-1', persona_tiene_documento: true }, 'settle');
    expect(env.customer_id).toBe('per-1');
    expect('contact_customer_id' in env).toBe(false);
  });
});

describe('Facturar a — factura de venta manual', () => {
  const base = { branch_id: 7, items: [{ description: 'x', qty: 1, unit_price: 1000, total_line: 1000 }] };

  test('el contrato acepta contact_customer_id y lo deja vacío si no viene', () => {
    const conContacto = guardarFacturaSchema.parse({ ...base, customer_id: '11111111-1111-4111-8111-111111111111', contact_customer_id: '22222222-2222-4222-8222-222222222222' });
    expect(conContacto.contact_customer_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(guardarFacturaSchema.parse(base).contact_customer_id).toBeUndefined();
    expect(guardarFacturaSchema.safeParse({ ...base, contact_customer_id: 'no-es-uuid' }).success).toBe(false);
  });

  test('empresa_no_ligada es un código estable y responde 403', () => {
    expect(codigoErrorFactura('empresa_no_ligada')).toBe('empresa_no_ligada');
    expect(estadoHttpErrorFactura('empresa_no_ligada')).toBe(403);
  });
});

describe('Facturar a — migración 20261125200000', () => {
  const raiz = join(__dirname, '..', '..', '..', 'supabase');
  const migracion = readFileSync(join(raiz, 'migrations', '20261125200000_facturar_a_persona_o_empresa.sql'), 'utf8');
  const reversion = readFileSync(join(raiz, 'rollbacks', '20261125200000_facturar_a_persona_o_empresa_rollback.sql'), 'utf8');

  test('aditiva: columnas NULL-ables, sin DROP', () => {
    expect(migracion).toMatch(/alter table public\.sales\s+add column if not exists contact_customer_id uuid/);
    expect(migracion).toMatch(/alter table public\.invoice_sales\s+add column if not exists contact_customer_id uuid/);
    expect(migracion).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
  });

  test('valida el vínculo en el servidor y cierra la función nueva a anon', () => {
    expect(migracion).toMatch(/raise exception 'empresa_no_ligada' using errcode = '42501'/);
    expect(migracion).toMatch(/revoke all on function public\.fn_cliente_puede_facturar_a\(integer, uuid, uuid\) from public, anon/);
    // Reemplazos exactos, cada uno una sola vez, sobre las funciones vigentes.
    expect(migracion).toMatch(/IF v_n <> 1 THEN/);
  });

  test('la reversión deshace los mismos fragmentos y quita las columnas', () => {
    expect(reversion).toMatch(/drop function if exists public\.fn_cliente_puede_facturar_a/);
    expect(reversion).toMatch(/alter table public\.sales drop column if exists contact_customer_id/);
    expect(reversion).toMatch(/ORDER BY orden DESC/);
  });

  test('sin nombres de clientes ni credenciales', () => {
    expect(migracion).not.toMatch(/service_role_key|eyJhbGci/i);
  });
});
