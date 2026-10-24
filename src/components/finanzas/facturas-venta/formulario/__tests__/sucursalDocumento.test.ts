import { aplicarSucursalGlobal } from '../sucursalDocumento';

describe('sucursal del documento de venta', () => {
  test('un documento nuevo toma el selector global una sola vez', () => {
    const primera = aplicarSucursalGlobal({
      documentoNuevo: true,
      yaAplicada: false,
      sucursal: null,
      selectorGlobal: 115,
    });
    expect(primera).toEqual({ sucursal: 115, yaAplicada: true });
    const despues = aplicarSucursalGlobal({
      documentoNuevo: true,
      yaAplicada: primera.yaAplicada,
      sucursal: 200,
      selectorGlobal: 116,
    });
    expect(despues).toEqual({ sucursal: 200, yaAplicada: true });
  });

  test('sin selector todavía no se da por aplicada', () => {
    expect(
      aplicarSucursalGlobal({ documentoNuevo: true, yaAplicada: false, sucursal: null, selectorGlobal: null }),
    ).toEqual({ sucursal: null, yaAplicada: false });
  });

  test('un borrador no toma el selector global', () => {
    expect(
      aplicarSucursalGlobal({ documentoNuevo: false, yaAplicada: false, sucursal: 115, selectorGlobal: 200 }),
    ).toEqual({ sucursal: 115, yaAplicada: true });
  });
});
