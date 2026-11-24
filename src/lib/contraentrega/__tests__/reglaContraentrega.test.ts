/**
 * Regla pura de la contraentrega con condiciones (copia byte a byte en la tienda:
 * lib/contraentrega/reglaContraentrega.ts, vigilada por verify-copias-erp y verify-contraentrega).
 * Pedido del Figma: WO-000415 = productos 142.000 + envío 9.000 = 151.000.
 */
import {
  CONDICIONES_POR_DEFECTO,
  cobroEnPuerta,
  conCondicionesDeSede,
  condicionesDeSede,
  evaluarContraentrega,
  montoAnticipo,
  normalizarCondiciones,
  type CondicionesContraentrega,
  type EntradaContraentrega,
} from '../reglaContraentrega';

const base: Omit<EntradaContraentrega, 'condiciones'> = {
  tipoEntrega: 'delivery_own',
  subtotalProductos: 142000,
  envio: 9000,
  total: 151000,
  zonaId: 'z1',
  lineas: [{ productoId: 1, categoriaId: 10 }, { productoId: 2, categoriaId: 11 }],
  cliente: null,
  pasarelasActivas: ['wompi_co'],
};
const cond = (extra: Partial<CondicionesContraentrega> = {}) => normalizarCondiciones({ ...CONDICIONES_POR_DEFECTO, ...extra });
const conAnticipo = (a: Partial<CondicionesContraentrega['anticipo']>) => cond({ anticipo: { ...CONDICIONES_POR_DEFECTO.anticipo, ...a } });

describe('sin condiciones: exactamente como hoy', () => {
  it.each(['delivery_own', 'delivery_third_party', 'pickup', 'dine_in'] as const)('%s', (tipoEntrega) => {
    const r = evaluarContraentrega({ ...base, tipoEntrega, condiciones: null });
    expect([r.conCondiciones, r.disponible, r.anticipo, r.alRecibir]).toEqual([false, true, null, 151000]);
  });
  it('la sede sin condiciones no hereda las de otra', () => {
    expect(condicionesDeSede({ contraentrega: { version: 1, sedes: { 7: cond() } } }, 5)).toBeNull();
    expect(condicionesDeSede({}, 5)).toBeNull();
  });
  it('recoger nunca lleva condiciones', () => {
    expect(evaluarContraentrega({ ...base, tipoEntrega: 'pickup', condiciones: cond({ montoMinimo: 1e9 }) }).disponible).toBe(true);
  });
  it('por defecto: «quién puede usarla» apagadas, transportadora encendida, plazo 30', () => {
    expect(CONDICIONES_POR_DEFECTO).toMatchObject({ soloClientesConEntregas: false, noOfrecerARechazados: false, transportadora: true });
    expect(CONDICIONES_POR_DEFECTO.anticipo.plazoMinutos).toBe(30);
  });
});

describe('pantalla 09', () => {
  it('A · disponible sin anticipo', () => {
    expect(evaluarContraentrega({ ...base, condiciones: cond() })).toMatchObject({ disponible: true, anticipo: null, alRecibir: 151000 });
  });
  it('B · anticipo del envío: hoy 9.000 y 142.000 al recibir', () => {
    const r = evaluarContraentrega({ ...base, condiciones: conAnticipo({ tipo: 'envio' }) });
    expect(r.anticipo).toMatchObject({ monto: 9000, base: 'envio', plazoMinutos: 30, pasarelas: ['wompi_co'] });
    expect(r.alRecibir).toBe(142000);
  });
  it('C · mínimo: faltan 12.000', () => {
    const r = evaluarContraentrega({ ...base, subtotalProductos: 68000, total: 77000, condiciones: cond({ montoMinimo: 80000 }) });
    expect(r.motivos[0]).toEqual({ codigo: 'monto_minimo', minimo: 80000, faltan: 12000 });
  });
  it('D · máximo', () => {
    expect(evaluarContraentrega({ ...base, subtotalProductos: 742000, condiciones: cond({ montoMaximo: 600000 }) }).motivos[0].codigo).toBe('monto_maximo');
  });
  it('E · productos excluidos por categoría', () => {
    const r = evaluarContraentrega({ ...base, condiciones: cond({ productos: { modo: 'excepto', categorias: [11], productos: [] } }) });
    expect(r.motivos[0]).toEqual({ codigo: 'productos', productoIds: [2] });
  });
  it('F · zona sin cobertura; la transportadora no mira zonas', () => {
    const c = cond({ zonas: { modo: 'algunas', ids: ['z2'] } });
    expect(evaluarContraentrega({ ...base, condiciones: c }).motivos[0].codigo).toBe('zona');
    expect(evaluarContraentrega({ ...base, tipoEntrega: 'delivery_third_party', condiciones: c }).disponible).toBe(true);
  });
  it('G · solo clientes con entregas', () => {
    const c = cond({ soloClientesConEntregas: true });
    expect(evaluarContraentrega({ ...base, condiciones: c }).motivos[0].codigo).toBe('primera_compra');
    expect(evaluarContraentrega({ ...base, condiciones: c, cliente: { pedidosEntregados: 1, rechazosEnPuerta: 0 } }).disponible).toBe(true);
  });
  it('I · rechazó en la puerta', () => {
    const r = evaluarContraentrega({ ...base, condiciones: cond({ noOfrecerARechazados: true }), cliente: { pedidosEntregados: 2, rechazosEnPuerta: 1 } });
    expect(r.motivos[0].codigo).toBe('rechazo_previo');
  });
  it('orden de motivos: monto → productos → dirección', () => {
    const c = cond({ montoMinimo: 1e9, productos: { modo: 'excepto', categorias: [10], productos: [] }, zonas: { modo: 'algunas', ids: ['x'] } });
    expect(evaluarContraentrega({ ...base, condiciones: c }).motivos.map((m) => m.codigo)).toEqual(['monto_minimo', 'productos', 'zona']);
  });
});

describe('anticipo', () => {
  it('porcentaje, fijo con tope y envío gratis', () => {
    expect(montoAnticipo(conAnticipo({ tipo: 'porcentaje', porcentaje: 20 }), 9000, 151000)).toEqual({ monto: 30200, base: 'porcentaje' });
    expect(montoAnticipo(conAnticipo({ tipo: 'fijo', valorFijo: 500000 }), 9000, 151000)?.monto).toBe(151000);
    expect(montoAnticipo(conAnticipo({ tipo: 'envio' }), 0, 151000)).toBeNull();
    expect(montoAnticipo(conAnticipo({ tipo: 'envio', siEnvioGratis: 'valor_fijo', valorEnvioGratis: 9000 }), 0, 151000)).toEqual({ monto: 9000, base: 'envio_gratis_fijo' });
  });
  it('sin pasarela con que cobrarlo no se ofrece', () => {
    expect(evaluarContraentrega({ ...base, pasarelasActivas: [], condiciones: conAnticipo({ tipo: 'envio' }) }).motivos[0].codigo).toBe('sin_pasarela');
  });
});

describe('cobro en la puerta y guardado', () => {
  it('solo descuenta el anticipo pagado', () => {
    expect(cobroEnPuerta(151000, { monto: 9000, estado: 'paid' })).toBe(142000);
    expect(cobroEnPuerta(151000, { monto: 9000, estado: 'pending' })).toBe(151000);
    expect(cobroEnPuerta(151000, { monto: null, estado: null })).toBe(151000);
  });
  it('guardar una sede no pisa las demás claves', () => {
    const s = conCondicionesDeSede({ otra: 1, contraentrega: { version: 1, sedes: { 3: cond() } } }, 5, cond()) as any;
    expect(s.otra).toBe(1);
    expect(Object.keys(s.contraentrega.sedes).sort()).toEqual(['3', '5']);
  });
});
