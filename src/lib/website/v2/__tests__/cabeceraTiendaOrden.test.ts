/**
 * Orden de los íconos de la cabecera (Figma «16 Sitio web» 3261:99475): lector puro que comparten
 * el editor y la tienda (copia idéntica en goadmin-websites, verify-copias-erp).
 */
import {
  ACCIONES_ORDEN,
  ORDEN_ACCIONES_HOY,
  ordenAcciones,
  ordenAccionesPantalla,
  ordenCelularPropio,
  ordenGuardado,
  opcionesIconos,
} from '../cabeceraTienda';

describe('ordenAcciones', () => {
  test('sin nada guardado: el orden de hoy, con Favoritos antes del Carrito', () => {
    expect(ORDEN_ACCIONES_HOY).toEqual(['search', 'currency', 'cart', 'auth']);
    for (const v of [undefined, null, [], '', 'no-json', 42, {}, '[]']) {
      expect(ordenAcciones(v)).toEqual(['search', 'currency', 'favorites', 'cart', 'auth']);
    }
  });

  test('el de las 45 tiendas y el de la tienda con la moneda primero', () => {
    expect(ordenAcciones(['search', 'currency', 'cart', 'auth'])).toEqual(['search', 'currency', 'favorites', 'cart', 'auth']);
    expect(ordenAcciones(['currency', 'search', 'cart', 'auth'])).toEqual(['currency', 'search', 'favorites', 'cart', 'auth']);
  });

  test('texto JSON de filas viejas', () => {
    expect(ordenAcciones('["cart","auth","search","currency"]')).toEqual(['favorites', 'cart', 'auth', 'search', 'currency']);
  });

  test('sin repetidos ni valores desconocidos', () => {
    expect(ordenGuardado(['cart', 'cart', 'wishlist', 7, 'auth', 'search'])).toEqual(['cart', 'auth', 'search']);
    expect(ordenGuardado(['x', 'y'])).toBeNull();
  });

  test('los que faltan van en su lugar de siempre (antes del siguiente que sí está)', () => {
    expect(ordenAcciones(['auth', 'cart'])).toEqual(['auth', 'search', 'currency', 'favorites', 'cart']);
    expect(ordenAcciones(['cart'])).toEqual(['search', 'currency', 'favorites', 'cart', 'auth']);
    expect(ordenAcciones(['auth'])).toEqual(['search', 'currency', 'favorites', 'cart', 'auth']);
    // Favoritos guardado en su puesto se respeta.
    expect(ordenAcciones(['currency', 'search', 'auth', 'favorites', 'cart'])).toEqual(['currency', 'search', 'auth', 'favorites', 'cart']);
  });

  test('siempre devuelve los cinco una sola vez', () => {
    const r = ordenAcciones(['auth', 'search']);
    expect([...r].sort()).toEqual([...ACCIONES_ORDEN].sort());
  });
});

describe('orden del celular', () => {
  test('sin `header_iconos.ordenCelular`: igual que en el computador', () => {
    const a = { actions_order: ['currency', 'search', 'cart', 'auth'] };
    expect(ordenCelularPropio(a)).toBeNull();
    expect(ordenAccionesPantalla(a, true)).toEqual(ordenAccionesPantalla(a, false));
    expect(ordenCelularPropio({ header_iconos: { ordenCelular: ['nada'] } })).toBeNull();
  });

  test('con orden propio: el celular lo usa y el computador no cambia', () => {
    const a = { actions_order: ['search', 'currency', 'cart', 'auth'], header_iconos: { ordenCelular: ['cart', 'search', 'auth'] } };
    expect(ordenAccionesPantalla(a, true)).toEqual(['currency', 'favorites', 'cart', 'search', 'auth']);
    expect(ordenAccionesPantalla(a, false)).toEqual(['search', 'currency', 'favorites', 'cart', 'auth']);
  });

  test('el orden propio solo no activa la presentación nueva de los íconos', () => {
    expect(opcionesIconos({ header_iconos: { ordenCelular: ['cart', 'search'] } }).configurado).toBe(false);
  });
});
