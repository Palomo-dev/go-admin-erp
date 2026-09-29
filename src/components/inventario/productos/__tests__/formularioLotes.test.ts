/**
 * B7 — manejo de lotes desde el formulario del producto (INVENTARIO-PLAN §5.8;
 * anexo B1: «ningún formulario lo activa»).
 *
 * - El formulario envía `producto.track_lots` y, al crear, el lote y el
 *   vencimiento de cada entrada inicial.
 * - Sin control de existencias (o servicio) nunca viaja `track_lots = true`.
 * - Editar no manda cantidades ni lotes (la existencia cambia por ajuste).
 * - Contrato de las migraciones inv_b7_3 / inv_b7_4.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { construirPayload, estadoDesdeDatos, estadoInicial, type EstadoFormularioProducto } from '../logica/formularioProducto';
import type { DatosFormularioProducto } from '@/lib/services/productoService';

function estado(extra: Partial<EstadoFormularioProducto> = {}): EstadoFormularioProducto {
  return {
    ...estadoInicial([
      { branch_id: 10, nombre: 'Principal', principal: true },
      { branch_id: 11, nombre: 'Norte', principal: false },
    ]),
    sku: 'LEC-01',
    name: 'Leche entera',
    price: 5200,
    cost: 3900,
    ...extra,
  };
}

describe('payload con lotes', () => {
  it('crear con lotes: el lote y el vencimiento viajan solo en las filas con cantidad', () => {
    const e = estado({ track_lots: true });
    e.stock[0].qty = 24;
    e.stock[0].lot_code = ' L-0925 ';
    e.stock[0].expiry_date = '2026-10-15';
    e.stock[1].lot_code = 'ignorado';
    const p = construirPayload(e, 'crear');
    expect(p.producto.track_lots).toBe(true);
    expect(p.stock).toEqual([
      { branch_id: 10, qty: 24, unit_cost: 3900, lot_code: 'L-0925', expiry_date: '2026-10-15', min_level: 0 },
      { branch_id: 11, min_level: 0 },
    ]);
  });

  it('sin código ni vencimiento: el servidor propone el lote', () => {
    const e = estado({ track_lots: true });
    e.stock[0].qty = 5;
    const p = construirPayload(e, 'crear');
    expect(p.stock?.[0]).toEqual({ branch_id: 10, qty: 5, unit_cost: 3900, lot_code: '', expiry_date: null, min_level: 0 });
  });

  it('sin lotes no se manda lote aunque haya texto', () => {
    const e = estado();
    e.stock[0].qty = 5;
    e.stock[0].lot_code = 'X';
    const p = construirPayload(e, 'crear');
    expect(p.producto.track_lots).toBe(false);
    expect(p.stock?.[0]).toEqual({ branch_id: 10, qty: 5, unit_cost: 3900, min_level: 0 });
  });

  it('sin control de existencias o servicio: track_lots siempre false', () => {
    expect(construirPayload(estado({ track_lots: true, track_stock: false }), 'crear').producto.track_lots).toBe(false);
    expect(construirPayload(estado({ track_lots: true, product_type: 'service' }), 'crear').producto.track_lots).toBe(false);
  });

  it('editar: manda track_lots pero ni cantidades ni lotes', () => {
    const e = estado({ track_lots: true });
    e.stock[0].qty = 9;
    e.stock[0].lot_code = 'L-1';
    const p = construirPayload(e, 'editar', { productId: 4 });
    expect(p.producto.track_lots).toBe(true);
    expect(p.stock?.[0]).toEqual({ branch_id: 10, min_level: 0 });
  });

  it('el estado lee track_lots del producto guardado', () => {
    const datos = {
      producto: { sku: 'A', name: 'A', track_stock: true, track_lots: true, status: 'active', product_type: 'product' },
      precio: null,
      costo: null,
      impuestos: [],
      categorias_adicionales: [],
      etiquetas: [],
      proveedores: [],
      stock: [{ branch_id: 10, nombre: 'Principal', principal: true, qty_on_hand: 3, min_level: 1 }],
      variantes: [],
      modificadores: [],
      imagenes: [],
    } as unknown as DatosFormularioProducto;
    const e = estadoDesdeDatos(datos, 'editar', { urlPublica: (r) => r });
    expect(e.track_lots).toBe(true);
    expect(e.stock[0]).toMatchObject({ lot_code: '', expiry_date: null, qty_actual: 3 });
  });
});

describe('migraciones inv_b7_3 / inv_b7_4', () => {
  const raiz = process.cwd();
  const b73 = readFileSync(join(raiz, 'supabase', 'migrations', '20260929160200_inv_b7_3_lotes_desde_el_producto.sql'), 'utf8');
  const b74 = readFileSync(join(raiz, 'supabase', 'migrations', '20260929160300_inv_b7_4_lotes_al_crear.sql'), 'utf8');

  it('parche con ancla única y marcador (la función la editan otros bloques)', () => {
    expect(b73).toContain("position('inv_b7_3 track_lots' in v_def) > 0");
    expect(b73).toContain('no aparece exactamente una vez');
    expect(b74).toContain("position('inv_b7_4 track_lots' in v_def) > 0");
    expect(b74).toContain('v_track and coalesce');
  });

  it('el stock inicial con lote va por la primitiva y crea el lote con fn_lote_guardar', () => {
    expect(b73).toContain('public.fn_lote_guardar(p_org');
    expect(b73).toMatch(/public\.fn_inv_int_mover\(p_org, v_branch, p_product_id, v_lot, 'in'/);
    expect(b73).toContain("array['crear', 'editar_catalogo', 'ajustar']");
    expect(b73).not.toMatch(/insert\s+into\s+public\.stock_movements/i);
  });

  it('las variantes heredan del padre y las internas no se exponen', () => {
    expect(b73).toContain('before insert or update of parent_product_id on public.products');
    expect(b73).toContain('after update of track_lots on public.products');
    expect(b73).toMatch(/revoke all on function public\.fn_producto_int_stock_inicial\([^)]*\) from public, anon, authenticated;/);
  });
});
