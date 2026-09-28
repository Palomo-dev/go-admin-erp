/**
 * L1-L2 (docs/implementacion/POS-PLAN.md §2.1): al entrar al POS.
 * `inicializarCarritos` y `crearCarrito` son la extracción literal de
 * `initializePOS` y `createNewCart` de `src/app/app/pos/page.tsx`.
 *
 * Datos inventados: sucursal 7.
 */
import { crearCarrito, inicializarCarritos } from '@/lib/pos/venta/carritos';
import type { Cart } from '@/components/pos/types';

const cart = (id: string) => ({ id, status: 'active', items: [] }) as unknown as Cart;

function diferido<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => { resolver = r; });
  return { promesa, resolver };
}

function deps(getActiveCarts: () => Promise<Cart[]>) {
  const eventos: string[] = [];
  const d = {
    servicio: { getActiveCarts: jest.fn(getActiveCarts) },
    branchId: 7 as number | null,
    cerrojo: { current: false },
    empezar: jest.fn(() => { eventos.push('empezar'); }),
    terminar: jest.fn(() => { eventos.push('terminar'); }),
    mostrar: jest.fn((c: Cart[]) => { eventos.push(`mostrar:${c.map((x) => x.id).join(',')}`); }),
    crearCarrito: jest.fn(async () => { eventos.push('crear'); }),
  };
  return { d, eventos };
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('inicializarCarritos (L1)', () => {
  it('sin carritos guardados crea uno; con carritos los muestra (el primero queda activo) y no crea', async () => {
    const vacio = deps(async () => []);
    await inicializarCarritos(vacio.d);
    expect(vacio.eventos).toEqual(['empezar', 'crear', 'terminar']);

    const lleno = deps(async () => [cart('a'), cart('b')]);
    await inicializarCarritos(lleno.d);
    expect(lleno.eventos).toEqual(['empezar', 'mostrar:a,b', 'terminar']);
    expect(lleno.d.crearCarrito).not.toHaveBeenCalled();
  });

  it('dos inicializaciones solapadas crean UN carrito: la segunda sale sin hacer nada', async () => {
    const lectura = diferido<Cart[]>();
    const { d } = deps(() => lectura.promesa);
    const primera = inicializarCarritos(d);
    const segunda = inicializarCarritos(d);
    lectura.resolver([]);
    await Promise.all([primera, segunda]);
    expect(d.servicio.getActiveCarts).toHaveBeenCalledTimes(1);
    expect(d.crearCarrito).toHaveBeenCalledTimes(1);
    expect(d.cerrojo.current).toBe(false);
  });

  it('si la lectura falla crea un carrito por defecto y siempre suelta el cerrojo', async () => {
    const { d, eventos } = deps(async () => { throw new Error('storage roto'); });
    await inicializarCarritos(d);
    expect(eventos).toEqual(['empezar', 'crear', 'terminar']);
    expect(d.cerrojo.current).toBe(false);
  });
});

describe('crearCarrito (L2)', () => {
  const base = () => ({
    servicio: { createCart: jest.fn(async (b: number) => ({ id: `nuevo-${b}` }) as unknown as Cart) },
    avisarSinSucursal: jest.fn(),
    agregar: jest.fn(),
    avisarError: jest.fn(),
  });

  it('sin sucursal concreta («Todas») no llama a createCart y avisa', async () => {
    const d = base();
    expect(await crearCarrito({ ...d, branchId: null })).toBe('sin_sucursal');
    expect(d.servicio.createCart).not.toHaveBeenCalled();
    expect(d.avisarSinSucursal).toHaveBeenCalledTimes(1);
    expect(d.agregar).not.toHaveBeenCalled();
  });

  it('con sucursal crea el carrito en ESA sucursal y lo agrega; si falla, avisa el error', async () => {
    const d = base();
    expect(await crearCarrito({ ...d, branchId: 7 })).toBe('creado');
    expect(d.servicio.createCart).toHaveBeenCalledWith(7);
    expect(d.agregar).toHaveBeenCalledWith({ id: 'nuevo-7' });

    const falla = base();
    falla.servicio.createCart.mockRejectedValueOnce(new Error('sin espacio'));
    expect(await crearCarrito({ ...falla, branchId: 7 })).toBe('error');
    expect(falla.avisarError).toHaveBeenCalledTimes(1);
    expect(falla.agregar).not.toHaveBeenCalled();
  });
});
