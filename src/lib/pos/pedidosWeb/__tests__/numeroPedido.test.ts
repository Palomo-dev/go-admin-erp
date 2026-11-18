/**
 * Número del pedido web configurable: validación del prefijo, formatos y de qué tienda es una
 * referencia de pago (número nuevo y viejo). Puro, sin base.
 */
import {
  ALFABETO_CORTO,
  PREFIJOS_RESERVADOS,
  codigoCorto,
  ejemploNumero,
  esNumeroDelPrefijo,
  normalizarAjustesNumero,
  numeroConsecutivo,
  numeroLegado,
  organizacionLegado,
  prefijosCandidatos,
  resolverOrganizacionReferencia,
  validarPrefijo,
} from '../numeroPedido';

describe('prefijo del número de pedido', () => {
  test.each(['PED', 'AB', 'TIENDA-1', 'MI-TIENDA', 'A1B2C3D4E5', 'SPA', 'WOK', 'RESTO'])('%s sirve', (p) => {
    expect(validarPrefijo(p)).toBeNull();
  });
  test.each(['A', 'ABCDEFGHIJK', '-PED', 'PED-', 'PE--D', 'PE D', 'pe', 'PÉD', 'PED_1'])('%s no tiene la forma', (p) => {
    expect(validarPrefijo(p)).toBe('formato');
  });
  test('reservados: el primer tramo ya significa otra cosa en las referencias de pago', () => {
    for (const p of PREFIJOS_RESERVADOS) expect(validarPrefijo(p)).toBe('reservado');
    // `WO-5-0001` se leería como un pedido viejo de la organización 5.
    expect(validarPrefijo('WO-5')).toBe('reservado');
    expect(validarPrefijo('RES-1')).toBe('reservado');
    expect(validarPrefijo('INV-A')).toBe('reservado');
  });
  test('ajustes: se normaliza a mayúsculas; el formato actual no guarda prefijo', () => {
    expect(normalizarAjustesNumero({ formato: 'consecutivo', prefijo: ' ped ' })).toEqual({ ok: true, ajustes: { formato: 'consecutivo', prefijo: 'PED' } });
    expect(normalizarAjustesNumero({ formato: 'actual', prefijo: 'PED' })).toEqual({ ok: true, ajustes: { formato: 'actual', prefijo: null } });
    expect(normalizarAjustesNumero({ formato: 'corto', prefijo: '' })).toEqual({ ok: false, error: 'sin_prefijo' });
    expect(normalizarAjustesNumero({ formato: 'corto', prefijo: 'RES' })).toEqual({ ok: false, error: 'reservado' });
    expect(normalizarAjustesNumero({ formato: 'otro', prefijo: 'PED' })).toEqual({ ok: false, error: 'formato_desconocido' });
  });
});

describe('generación con prefijo', () => {
  test('consecutivo con cuatro cifras y sin recortar desde el 10000 (igual que el RPC)', () => {
    expect(numeroConsecutivo('PED', 1)).toBe('PED-0001');
    expect(numeroConsecutivo('PED', 42)).toBe('PED-0042');
    expect(numeroConsecutivo('PED', 9999)).toBe('PED-9999');
    expect(numeroConsecutivo('PED', 10000)).toBe('PED-10000');
    expect(() => numeroConsecutivo('PED', 0)).toThrow();
  });
  test('código corto: seis caracteres del alfabeto sin 0/O ni 1/I', () => {
    let i = 0;
    const azar = () => [0, 0.99, 0.5, 0.25, 0.75, 0.1][i++ % 6];
    const c = codigoCorto(azar);
    expect(c).toHaveLength(6);
    for (const ch of c) expect(ALFABETO_CORTO).toContain(ch);
    expect(ALFABETO_CORTO).not.toMatch(/[01OI]/);
    expect(esNumeroDelPrefijo(`PED-${c}`, 'PED')).toBe(true);
  });
  test('formato actual: WO-{org}-{ts36}-{rand4}, el de siempre', () => {
    expect(numeroLegado(333, 1793979846000, () => 0.5)).toBe(`WO-333-${(1793979846000).toString(36).toUpperCase()}-I000`);
  });
  test('ejemplo de la pantalla', () => {
    expect(ejemploNumero({ formato: 'consecutivo', prefijo: 'PED' }, 333)).toBe('PED-0001');
    expect(ejemploNumero({ formato: 'corto', prefijo: 'PED' }, 333)).toMatch(/^PED-[A-Z2-9]{6}$/);
    expect(ejemploNumero({ formato: 'actual', prefijo: null }, 333)).toMatch(/^WO-333-/);
  });
});

describe('de qué tienda es una referencia de pago', () => {
  const pedidos = [
    { organization_id: 333, order_number: 'PED-0007' },
    { organization_id: 339, order_number: 'WO-339-MW434LF5-3KDP' },
  ];
  const prefijos = [
    { organization_id: 333, prefix: 'PED' },
    { organization_id: 339, prefix: 'MI-TIENDA' },
  ];

  test('número nuevo con pedido: la organización del pedido', () => {
    expect(resolverOrganizacionReferencia({ referencia: 'PED-0007', pedidos, prefijos })).toEqual({ organizacion: 333, fuente: 'pedido', numeroDeTienda: true });
    expect(resolverOrganizacionReferencia({ referencia: 'ped-0007', pedidos })).toMatchObject({ organizacion: 333, fuente: 'pedido' });
  });
  test('número viejo con pedido: la organización del pedido', () => {
    expect(resolverOrganizacionReferencia({ referencia: 'WO-339-MW434LF5-3KDP', pedidos })).toMatchObject({ organizacion: 339, fuente: 'pedido' });
  });
  test('número viejo sin pedido (la tienda lo perdió): el prefijo WO-{org}- sigue valiendo', () => {
    expect(resolverOrganizacionReferencia({ referencia: 'WO-333-MW556LJG-HD58', pedidos: [] })).toEqual({ organizacion: 333, fuente: 'legado', numeroDeTienda: true });
    expect(organizacionLegado('WO-339-X')).toBe(339);
  });
  test('número nuevo sin pedido: la tienda dueña del prefijo, si tiene su forma', () => {
    expect(resolverOrganizacionReferencia({ referencia: 'PED-0099', pedidos: [], prefijos })).toEqual({ organizacion: 333, fuente: 'prefijo', numeroDeTienda: true });
    expect(resolverOrganizacionReferencia({ referencia: 'MI-TIENDA-K7M2QX', prefijos })).toMatchObject({ organizacion: 339, fuente: 'prefijo' });
    // Empieza por PED- pero no es ni consecutivo ni código corto: no se sabe.
    expect(resolverOrganizacionReferencia({ referencia: 'PED-OTRA-COSA', prefijos }).organizacion).toBeNull();
  });
  test('referencia ajena o vacía: no se sabe', () => {
    expect(resolverOrganizacionReferencia({ referencia: 'LINK_123', pedidos, prefijos })).toEqual({ organizacion: null, fuente: null, numeroDeTienda: false });
    expect(resolverOrganizacionReferencia({ referencia: null }).organizacion).toBeNull();
  });
  test('el mismo número en dos organizaciones (no debería pasar): no se elige ninguna', () => {
    const dobles = [{ organization_id: 333, order_number: 'X-0001' }, { organization_id: 339, order_number: 'X-0001' }];
    expect(resolverOrganizacionReferencia({ referencia: 'X-0001', pedidos: dobles }).organizacion).toBeNull();
  });
  test('prefijos candidatos de una referencia', () => {
    expect(prefijosCandidatos('MI-TIENDA-0001')).toEqual(['MI', 'MI-TIENDA']);
    expect(prefijosCandidatos('PED-0001')).toEqual(['PED']);
    // RES y WO están reservados: nunca son de una tienda.
    expect(prefijosCandidatos('RES-ABC')).toEqual([]);
    expect(prefijosCandidatos('sin guion')).toEqual([]);
  });
});
