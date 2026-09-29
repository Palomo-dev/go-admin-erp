/**
 * Bloque «Hoy» del inicio (Figma 445:137185): de las cifras del servidor a las
 * casillas `TarjetaHoy`. Reglas de docs/design/SHELL-FIGMA-A-CODIGO.md §4 y
 * AUDITORIA-DASHBOARD-INICIO.md §P2.
 */
import {
  casillasHoy,
  cosasPorAtender,
  diasDesde,
  enteroNoNegativo,
  MAX_CASILLAS_HOY,
  type DatosHoy,
} from '../bloqueHoy';

const VACIO: DatosHoy = {
  porCobrar: null,
  stock: null,
  pedidosWeb: null,
  cajasAnteriores: null,
  tareas: null,
  unaSucursal: true,
};

const TODO_URGENTE: DatosHoy = {
  porCobrar: { vencido: 3_480_000, cuentas: 7, diasMasVieja: 42, monedas: ['COP'] },
  stock: { bajoMinimo: 7, agotados: 2 },
  pedidosWeb: { pendientes: 12 },
  cajasAnteriores: { cantidad: 1, diasMasVieja: 3 },
  tareas: { abiertas: 4, vencenHoy: 1, vencidas: 0 },
  unaSucursal: true,
};

describe('casillasHoy', () => {
  test('sin módulos ni datos no pinta nada', () => {
    expect(casillasHoy(VACIO)).toEqual([]);
  });

  test('ordena por urgencia (peligro → advertencia → neutro) y respeta el tope de cinco', () => {
    const c = casillasHoy(TODO_URGENTE);
    expect(c.map((x) => x.id)).toEqual(['porCobrar', 'stockCritico', 'pedidosWeb', 'cajasAnteriores', 'misTareas']);
    expect(c.map((x) => x.tono)).toEqual(['peligro', 'peligro', 'advertencia', 'advertencia', 'advertencia']);
    expect(c.length).toBeLessThanOrEqual(MAX_CASILLAS_HOY);
    expect(cosasPorAtender(c)).toBe(5);
  });

  test('una casilla al día baja al final, en neutro, con su acción de consulta (nunca un callejón sin salida)', () => {
    const c = casillasHoy({ ...TODO_URGENTE, porCobrar: { vencido: 0, cuentas: 0, diasMasVieja: 0, monedas: ['COP'] } });
    const cartera = c.find((x) => x.id === 'porCobrar')!;
    expect(cartera).toMatchObject({ tono: 'neutro', estado: 'alDia', accion: { etiqueta: { clave: 'acciones.verCartera' } } });
    expect(c[c.length - 1].id).toBe('porCobrar');
    expect(cosasPorAtender(c)).toBe(4);
  });

  test('cartera en una moneda: cifra en dinero con su moneda y detalle con cuentas y antigüedad', () => {
    const [cartera] = casillasHoy({ ...VACIO, porCobrar: TODO_URGENTE.porCobrar });
    expect(cartera.cifra).toEqual({ tipo: 'moneda', valor: 3_480_000, moneda: 'COP' });
    expect(cartera.detalle).toEqual({ clave: 'detalles.cuentasVencidas', params: { n: 7, dias: 42 } });
    expect(cartera.accion.href).toBe('/app/finanzas/cuentas-por-cobrar');
  });

  test('cartera en varias monedas: nunca se suman, la cifra pasa a ser el número de cuentas', () => {
    const [cartera] = casillasHoy({ ...VACIO, porCobrar: { vencido: 99, cuentas: 3, diasMasVieja: 10, monedas: ['COP', 'USD'] } });
    expect(cartera.cifra).toEqual({ tipo: 'texto', texto: { clave: 'cifras.cuentas', params: { n: 3 } } });
    expect(cartera.detalle.clave).toBe('detalles.variasMonedas');
  });

  test('stock: el texto dice el ámbito (esta sucursal / tus sucursales) y la acción filtra el listado', () => {
    const una = casillasHoy({ ...VACIO, stock: { bajoMinimo: 3, agotados: 1 } })[0];
    expect(una.cifra).toEqual({ tipo: 'texto', texto: { clave: 'cifras.productos', params: { n: 4 } } });
    expect(una.detalle).toEqual({ clave: 'detalles.stockBajo.estaSucursal', params: { agotados: 1 } });
    expect(una.accion.href).toBe('/app/inventario/stock?estado=bajo_minimo,agotado');
    const todas = casillasHoy({ ...VACIO, unaSucursal: false, stock: { bajoMinimo: 0, agotados: 0 } })[0];
    expect(todas).toMatchObject({ tono: 'neutro', detalle: { clave: 'detalles.stockAlDia.tusSucursales' } });
  });

  test('cajas de días anteriores: solo aparecen si las hay', () => {
    expect(casillasHoy({ ...VACIO, cajasAnteriores: { cantidad: 0, diasMasVieja: 0 } })).toEqual([]);
    const [cajas] = casillasHoy({ ...VACIO, cajasAnteriores: { cantidad: 2, diasMasVieja: 5 } });
    expect(cajas).toMatchObject({ tono: 'advertencia', estado: 'revisar', detalle: { params: { dias: 5 } } });
  });

  test('tareas: vencidas o para hoy en advertencia; si no, neutro «Ninguna vence hoy»', () => {
    expect(casillasHoy({ ...VACIO, tareas: { abiertas: 2, vencenHoy: 0, vencidas: 1 } })[0]).toMatchObject({
      tono: 'advertencia',
      detalle: { clave: 'detalles.tareasVencidas', params: { n: 1, hoy: 0 } },
    });
    expect(casillasHoy({ ...VACIO, tareas: { abiertas: 2, vencenHoy: 0, vencidas: 0 } })[0]).toMatchObject({
      tono: 'neutro',
      estado: 'alDia',
      detalle: { clave: 'detalles.tareasSinVencer' },
    });
  });

  test('pedidos web sin pendientes: neutro con «Ver pedidos»', () => {
    expect(casillasHoy({ ...VACIO, pedidosWeb: { pendientes: 0 } })[0]).toMatchObject({
      tono: 'neutro',
      accion: { etiqueta: { clave: 'acciones.verPedidos' }, href: '/app/pos/pedidos-online' },
    });
  });
});

describe('auxiliares', () => {
  test('enteroNoNegativo acepta numeric como texto y descarta basura', () => {
    expect(enteroNoNegativo('12')).toBe(12);
    expect(enteroNoNegativo(3.9)).toBe(3);
    expect(enteroNoNegativo(null)).toBe(0);
    expect(enteroNoNegativo(-4)).toBe(0);
    expect(enteroNoNegativo('abc')).toBe(0);
  });

  test('diasDesde cuenta días completos y nunca negativos', () => {
    const ahora = new Date('2026-09-29T15:00:00Z');
    expect(diasDesde('2026-09-26T14:00:00Z', ahora)).toBe(3);
    expect(diasDesde('2026-09-30T00:00:00Z', ahora)).toBe(0);
    expect(diasDesde(null, ahora)).toBe(0);
    expect(diasDesde('no es fecha', ahora)).toBe(0);
  });
});
