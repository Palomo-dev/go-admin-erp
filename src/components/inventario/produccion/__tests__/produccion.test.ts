/**
 * Producción (B5): lógica pura de las pantallas y la fachada de RPC. El
 * servicio ya no escribe tablas ni tiene respaldo: si la RPC falla, la orden
 * no queda completada.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const rpc = jest.fn();
const from = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));

import {
  accionesDisponibles,
  diferenciaPlaneado,
  maximoProducible,
  ordenDeLaUrl,
  tandas,
  validarCantidadProducida,
} from '../logica';
import { aOrdenFila, ErrorProduccion, productionOrderService } from '@/lib/services/productionOrderService';

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe('cantidad producida', () => {
  it('> 0, ≤ 150 % y con los decimales del producto', () => {
    expect(validarCantidadProducida(null, 24, 0)).toBe('requerida');
    expect(validarCantidadProducida(0, 24, 0)).toBe('mayor_que_cero');
    expect(validarCantidadProducida(36, 24, 0)).toBeNull();
    expect(validarCantidadProducida(37, 24, 0)).toBe('excede');
    expect(validarCantidadProducida(2.5, 24, 0)).toBe('decimales');
  });
  it('por peso: hasta 3 decimales (kg)', () => {
    expect(validarCantidadProducida(2.4, 2.5, 3)).toBeNull();
    expect(validarCantidadProducida(2.125, 2.5, 3)).toBeNull();
    expect(validarCantidadProducida(2.1255, 2.5, 3)).toBe('decimales');
    expect(maximoProducible(2.5)).toBe(3.75);
  });
});

describe('estado → acciones', () => {
  it('borrador, confirmada, en proceso, completada, cancelada', () => {
    expect(accionesDisponibles('draft')).toEqual(['confirmar', 'eliminar']);
    expect(accionesDisponibles('confirmed')).toEqual(['iniciar', 'completar', 'cancelar']);
    expect(accionesDisponibles('in_progress')).toEqual(['completar', 'cancelar']);
    expect(accionesDisponibles('completed')).toEqual(['distribuir']);
    expect(accionesDisponibles('cancelled')).toEqual([]);
  });
});

describe('utilidades', () => {
  it('tandas, diferencia del mes y ?orden= heredado', () => {
    expect(tandas(24, 12)).toBe(2);
    expect(tandas(10, 3)).toBe(3.33);
    expect(diferenciaPlaneado(0, 5)).toBeNull();
    expect(diferenciaPlaneado(100, 97)).toBeCloseTo(-0.03);
    expect(ordenDeLaUrl('12')).toBe(12);
    expect(ordenDeLaUrl('12a')).toBeNull();
    expect(ordenDeLaUrl(null)).toBeNull();
  });
});

describe('fachada de RPC', () => {
  it('completar llama a complete_production_order con confirmación y clave, y no tiene respaldo', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'faltante_sin_confirmar', code: '23514', details: '[{"product_id":7,"nombre":"Queso","unidad":"KG","necesario":2,"disponible":1.7,"faltante":0.3}]' } });
    const e = await productionOrderService.completar(9, 24, { clave: 'k' }).catch((x) => x);
    expect(rpc).toHaveBeenCalledWith('complete_production_order', {
      p_order_id: 9,
      p_produced_qty: 24,
      p_updated_by: null,
      p_confirmar_faltante: false,
      p_clave: 'k',
    });
    expect(e).toBeInstanceOf(ErrorProduccion);
    expect((e as ErrorProduccion).clave).toBe('faltante_sin_confirmar');
    expect((e as ErrorProduccion).faltantes[0]).toMatchObject({ nombre: 'Queso', faltante: 0.3 });
    // Nada de UPDATE status = 'completed' cuando la RPC falla.
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('cambiar estado y guardar son RPC con la organización', async () => {
    rpc.mockResolvedValue({ data: { id: 3, status: 'cancelled', eliminada: false }, error: null });
    await productionOrderService.cambiarEstado(2, 3, 'cancelar', 'sin harina');
    expect(rpc).toHaveBeenCalledWith('fn_produccion_cambiar_estado', { p_org: 2, p_id: 3, p_accion: 'cancelar', p_motivo: 'sin harina' });
    rpc.mockResolvedValue({ data: { id: 4, numero: 'OP-4', status: 'draft', repetido: false }, error: null });
    const r = await productionOrderService.guardar(2, { branch_id: 2, product_id: 5, qty_to_produce: 2.5 }, 'c1');
    expect(r).toEqual({ id: 4, numero: 'OP-4', status: 'draft', repetido: false });
  });
  it('normaliza la fila (numeric como texto)', () => {
    const f = aOrdenFila({ id: 2, numero: 'OP-2', estado: 'completed', producto: { id: 1, nombre: 'Pan', unidad: 'KG ', decimales: 3 }, receta: { id: 8, version: 2, rinde: '12' }, sucursal: { id: 2, nombre: 'Sede' }, a_producir: '2.500', producido: '2.4', costo_real: '9448.30', costo_real_unidad: '3936.7917' });
    expect(f).toMatchObject({ estado: 'completed', a_producir: 2.5, producido: 2.4, costo_real: 9448.3, producto: { unidad: 'KG', decimales: 3 }, receta: { rinde: 12, version: 2 } });
  });
  it('el servicio no escribe tablas (solo RPC)', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/services/productionOrderService.ts'), 'utf8');
    expect(src).not.toMatch(/\.from\(/);
    const recetas = readFileSync(join(process.cwd(), 'src/lib/services/recipeService.ts'), 'utf8');
    expect(recetas).not.toMatch(/from\('product_recipes'\)[\s\S]{0,80}\.(update|delete|insert|upsert)\(/);
  });
});
