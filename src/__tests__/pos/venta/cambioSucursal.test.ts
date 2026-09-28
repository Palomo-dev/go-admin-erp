/**
 * L38 (docs/implementacion/POS-PLAN.md §2.5): cambio de sucursal. La página
 * vuelve a llamar a `initializePOS` (extraído a `inicializarCarritos`) con la
 * sucursal nueva, marcada «refrescando» (opacidad 60 % y sin clics) mientras
 * lee. El catálogo se recarga aparte, porque `branchFilter` está entre las
 * dependencias de la búsqueda (ver `busquedaCatalogo.test.ts`).
 *
 * Datos inventados: sucursales 7 y 9.
 */
import { crearCarrito, inicializarCarritos } from '@/lib/pos/venta/carritos';
import type { Cart } from '@/components/pos/types';

const cart = (id: string, branch_id: number) => ({ id, branch_id, status: 'active', items: [] }) as unknown as Cart;

describe('cambio de sucursal (L38)', () => {
  it('lee los carritos de la sucursal NUEVA y la página queda bloqueada solo durante la lectura', async () => {
    const eventos: string[] = [];
    const getActiveCarts = jest.fn(async (b?: number | null) => {
      eventos.push(`leer:${b}`);
      return b === 9 ? [cart('c9', 9)] : [cart('c7', 7)];
    });
    const comun = {
      servicio: { getActiveCarts },
      cerrojo: { current: false },
      empezar: () => { eventos.push('bloquear'); },
      terminar: () => { eventos.push('desbloquear'); },
      mostrar: (c: Cart[]) => { eventos.push(`mostrar:${c[0].id}`); },
      crearCarrito: async () => { eventos.push('crear'); },
    };
    await inicializarCarritos({ ...comun, branchId: 7 });
    await inicializarCarritos({ ...comun, branchId: 9 });
    expect(eventos).toEqual([
      'bloquear', 'leer:7', 'mostrar:c7', 'desbloquear',
      'bloquear', 'leer:9', 'mostrar:c9', 'desbloquear',
    ]);
  });

  it('HOY: un cambio de sucursal mientras la carga anterior sigue en curso se descarta (cerrojo)', async () => {
    let soltar!: (c: Cart[]) => void;
    const getActiveCarts = jest.fn((b?: number | null) =>
      b === 7 ? new Promise<Cart[]>((r) => { soltar = r; }) : Promise.resolve([cart('c9', 9)]));
    const mostrar = jest.fn();
    const comun = {
      servicio: { getActiveCarts },
      cerrojo: { current: false },
      empezar: () => undefined,
      terminar: () => undefined,
      mostrar,
      crearCarrito: async () => undefined,
    };
    const primera = inicializarCarritos({ ...comun, branchId: 7 });
    await inicializarCarritos({ ...comun, branchId: 9 });
    soltar([cart('c7', 7)]);
    await primera;
    expect(getActiveCarts.mock.calls.map((c) => c[0])).toEqual([7]);
    expect(mostrar).toHaveBeenCalledTimes(1);
    expect(mostrar.mock.calls[0][0][0].id).toBe('c7');
  });

  it('en la sucursal nueva sin carritos, el carrito nuevo nace en esa sucursal', async () => {
    const createCart = jest.fn(async (b: number) => cart('nuevo', b));
    const agregar = jest.fn();
    await crearCarrito({ servicio: { createCart }, branchId: 9, avisarSinSucursal: jest.fn(), agregar, avisarError: jest.fn() });
    expect(createCart).toHaveBeenCalledWith(9);
    expect(agregar.mock.calls[0][0]).toMatchObject({ branch_id: 9 });
  });
});
