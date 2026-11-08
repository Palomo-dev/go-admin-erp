/**
 * Lista de Métodos de pago (Figma 1010:85721 / 1010:86844): de qué dato sale
 * cada columna y qué cuenta como «usado y sin configurar». Datos inventados.
 */
import {
  construirFilasMetodos,
  destinoDelMetodo,
  estadoListaMetodos,
  filtrarFilasMetodos,
  moverMetodo,
  resumirMetodos,
  tipoMetodoPago,
  ultimosDigitos,
  type MetodoOrganizacionLista,
} from '../metodosPagoLista';

const base = (codigo: string, extra: Partial<MetodoOrganizacionLista> = {}): MetodoOrganizacionLista => ({
  id: extra.id ?? codigo.length,
  organization_id: 7,
  payment_method_code: codigo,
  is_active: true,
  settings: {},
  show_on_website: false,
  payment_method: { name: codigo.toUpperCase(), requires_reference: false, is_system: false },
  ...extra,
});

const BANCOS = [{ id: 3, name: 'Ahorros', bank_name: 'Banco de ejemplo', account_number: '000-123-4321' }];
const CONEXIONES = [{ id: 'c-1', name: 'Wompi tienda', status: 'connected' }];

describe('tipoMetodoPago', () => {
  test.each([
    ['cash', 'efectivo'],
    ['card', 'tarjeta'],
    ['credit_card', 'tarjeta'],
    ['credit', 'credito'],
    ['credit_note', 'otro'],
    ['transfer', 'transferencia'],
    ['pse', 'transferencia'],
    ['nequi', 'billetera'],
    ['wompi', 'pasarela'],
    ['mp', 'pasarela'],
    ['bancolombia_qr', 'pasarela'],
    ['xyz', 'otro'],
  ])('%s → %s', (codigo, tipo) => expect(tipoMetodoPago(codigo)).toBe(tipo));
});

describe('destino del dinero («Entra a»)', () => {
  const bancos = new Map(BANCOS.map((b) => [b.id, b]));
  const conexiones = new Map(CONEXIONES.map((c) => [c.id, c]));

  test('banco del mapeo del formulario (settings.account_mapping.bank_account_id), con los 4 últimos dígitos', () => {
    const d = destinoDelMetodo(base('transfer', { settings: { account_mapping: { bank_account_id: '3' } } }), bancos, conexiones);
    expect(d).toEqual({ tipo: 'banco', banco: 'Banco de ejemplo', ultimos: '4321' });
  });
  test('efectivo → caja del turno', () => expect(destinoDelMetodo(base('cash'), bancos, conexiones)).toEqual({ tipo: 'caja' }));
  test('pasarela conectada por integration_connection_id', () =>
    expect(destinoDelMetodo(base('wompi', { integration_connection_id: 'c-1' }), bancos, conexiones)).toEqual({
      tipo: 'pasarela',
      conectada: true,
      conexion: 'Wompi tienda',
    }));
  test('pasarela sin conexión', () =>
    expect(destinoDelMetodo(base('mp'), bancos, conexiones)).toEqual({ tipo: 'pasarela', conectada: false, conexion: null }));
  test('crédito → cuenta por cobrar', () => expect(destinoDelMetodo(base('credit'), bancos, conexiones)).toEqual({ tipo: 'cxc' }));
  test('transferencia sin banco → sin destino', () =>
    expect(destinoDelMetodo(base('transfer'), bancos, conexiones)).toEqual({ tipo: 'sinDestino' }));
  test('ultimosDigitos', () => {
    expect(ultimosDigitos('12-34')).toBe('1234');
    expect(ultimosDigitos(null)).toBeNull();
  });
});

describe('construirFilasMetodos', () => {
  const metodos = [
    base('transfer', { id: 2, website_display_order: 1, show_on_website: true, settings: { account_mapping: { bank_account_id: 3 } } }),
    base('cash', { id: 1, website_display_order: 0, show_on_website: true, payment_method: { name: 'Efectivo', is_system: true } }),
    base('mp', { id: 3, website_display_order: 2, is_active: false, show_on_website: true }),
  ];

  test('orden del POS, canales, caja abierta de la organización y referencia', () => {
    const filas = construirFilasMetodos({ metodos, bancos: BANCOS, conexiones: CONEXIONES, exigeCaja: true, usoPorMetodo: {} });
    expect(filas.map((f) => f.codigo)).toEqual(['cash', 'transfer', 'mp']);
    const [cash, transfer, mp] = filas;
    expect(cash).toMatchObject({ nombre: 'Efectivo', esSistema: true, cajaObligatoria: true, referencia: 'noAplica', canales: { pos: true, web: true } });
    expect(transfer).toMatchObject({ cajaObligatoria: true, referencia: 'opcional', destino: { tipo: 'banco' } });
    // Inactivo: el POS no lo lee y la tienda tampoco (exige is_active Y show_on_website).
    expect(mp).toMatchObject({ activo: false, cajaObligatoria: false, canales: { pos: false, web: false }, referencia: 'automatica' });
  });

  test('sin la exigencia de caja de la organización, ninguna fila la pide', () => {
    const filas = construirFilasMetodos({ metodos, bancos: BANCOS, conexiones: [], exigeCaja: false, usoPorMetodo: {} });
    expect(filas.some((f) => f.cajaObligatoria)).toBe(false);
  });

  test('«usados y sin configurar»: códigos con pagos sin fila + filas con pagos y sin destino', () => {
    const filas = construirFilasMetodos({
      metodos,
      bancos: BANCOS,
      conexiones: [],
      exigeCaja: true,
      usoPorMetodo: { cash: 10, transfer: 4, mp: 3, nequi: 590, daviplata: 66 },
      catalogo: [{ code: 'nequi', name: 'Nequi' }],
    });
    expect(filas.map((f) => f.codigo)).toEqual(['cash', 'transfer', 'mp', 'nequi', 'daviplata']);
    expect(filas.filter((f) => f.incompleta).map((f) => f.codigo)).toEqual(['mp', 'nequi', 'daviplata']);
    const nequi = filas.find((f) => f.codigo === 'nequi')!;
    expect(nequi).toMatchObject({ nombre: 'Nequi', sinConfigurar: true, pagos: 590, original: null });
    const r = resumirMetodos(filas);
    expect(r).toMatchObject({ activos: 2, incompletos: 3, pagosIncompletos: 659 });
    expect(filtrarFilasMetodos(filas, true).map((f) => f.codigo)).toEqual(['mp', 'nequi', 'daviplata']);
    expect(filtrarFilasMetodos(filas, false)).toHaveLength(5);
  });

  test('sin conteo de pagos (null) no se inventan usos', () => {
    const filas = construirFilasMetodos({ metodos, bancos: [], conexiones: [], exigeCaja: true, usoPorMetodo: null });
    expect(filas.every((f) => f.pagos === null && !f.incompleta)).toBe(true);
  });
});

describe('moverMetodo (Subir/Bajar = el orden que lee el POS)', () => {
  const filas = construirFilasMetodos({
    metodos: [base('cash', { id: 1, website_display_order: 0 }), base('card', { id: 2, website_display_order: 1 }), base('transfer', { id: 9, website_display_order: 2 })],
    bancos: [],
    conexiones: [],
    exigeCaja: true,
    usoPorMetodo: { nequi: 1 },
  });
  test('baja el primero', () => expect(moverMetodo(filas, 'org-1', 1)).toEqual([2, 1, 9]));
  test('sube el último', () => expect(moverMetodo(filas, 'org-9', -1)).toEqual([1, 9, 2]));
  test('no sale de los bordes ni mueve las sin configurar', () => {
    expect(moverMetodo(filas, 'org-1', -1)).toBeNull();
    expect(moverMetodo(filas, 'org-9', 1)).toBeNull();
    expect(moverMetodo(filas, 'uso-nequi', -1)).toBeNull();
  });
});

test('estadoListaMetodos: error y sin permiso no son «vacío»', () => {
  const b = { cargando: false, error: false, sinPermiso: false, total: 3, visibles: 3 };
  expect(estadoListaMetodos({ ...b, sinPermiso: true, total: 0 })).toBe('sinPermiso');
  expect(estadoListaMetodos({ ...b, error: true, total: 0 })).toBe('error');
  expect(estadoListaMetodos({ ...b, cargando: true })).toBe('cargando');
  expect(estadoListaMetodos({ ...b, total: 0, visibles: 0 })).toBe('vacio');
  expect(estadoListaMetodos({ ...b, visibles: 0 })).toBe('sinResultados');
  expect(estadoListaMetodos(b)).toBe('listo');
});
