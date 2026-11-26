import { USOS_TIENDA, claveErrorMetodoPago, usoTienda } from '@/lib/finanzas/metodosPagoOrganizacion';

describe('«Usar en la tienda para» (website_usage, 20261126120000)', () => {
  test('sin valor o desconocido = ambos (lo de siempre)', () => {
    expect(usoTienda(undefined)).toBe('ambos');
    expect(usoTienda(null)).toBe('ambos');
    expect(usoTienda('otro')).toBe('ambos');
  });

  test('los tres usos se conservan', () => {
    for (const u of USOS_TIENDA) expect(usoTienda(u)).toBe(u);
    expect(USOS_TIENDA).toEqual(['ambos', 'solo_anticipo', 'solo_pago_completo']);
  });

  test('el rechazo del trigger se traduce a su clave', () => {
    expect(claveErrorMetodoPago({ code: 'P0001', message: 'La contraentrega con anticipo está activa…', hint: 'uso_tienda_sin_anticipo' })).toBe('usoSinAnticipo');
    expect(claveErrorMetodoPago({ code: 'P0001', message: 'otra cosa' })).toBeNull();
  });
});
