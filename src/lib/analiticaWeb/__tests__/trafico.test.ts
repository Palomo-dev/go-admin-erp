/**
 * Bloques de tráfico de la analítica web (Figma B/09-01): mapeo de la RPC
 * `fn_analitica_web_trafico` y derivados. Cifras inventadas.
 */
import { conversionPagina, embudoPedido, embudoReserva, fuentesConPorcentaje, mapearTrafico } from '../trafico';

const CRUDO = {
  fuentes: [
    { fuente: 'otros', sesiones: 332 },
    { fuente: 'google', sesiones: 4212 },
    { fuente: 'raro', sesiones: 8 },
    { fuente: 'directo', sesiones: '1330' },
  ],
  paginas: [{ ruta: '/contacto', visitas: 310, sesiones: 300, conversiones: 0 }, { ruta: '/', visitas: 5120, sesiones: 4000, conversiones: 84 }],
  conversion_pedido: { sesiones: 9000, productos: 6940, carrito: 1102, pago: 498, pagados: 212 },
  conversion_reserva: { visitas: 864, creadas: 188, confirmadas: 157 },
};

test('mapea y suma las fuentes desconocidas a «otros»', () => {
  const t = mapearTrafico(CRUDO);
  expect(t.fuentes.find((f) => f.fuente === 'otros')?.sesiones).toBe(340);
  expect(t.fuentes.find((f) => f.fuente === 'directo')?.sesiones).toBe(1330);
  expect(t.paginas[0].ruta).toBe('/');
});

test('tolera una respuesta vacía', () => {
  const t = mapearTrafico(null);
  expect(t.fuentes).toEqual([]);
  expect(t.conversionPedido.pagados).toBe(0);
});

test('porcentajes con «otros» al final', () => {
  const f = fuentesConPorcentaje(mapearTrafico(CRUDO).fuentes);
  expect(f[f.length - 1].fuente).toBe('otros');
  expect(f.reduce((n, x) => n + x.pct, 0)).toBeCloseTo(1);
});

test('embudos y conversión por página', () => {
  const t = mapearTrafico(CRUDO);
  const p = embudoPedido(t);
  expect(p.pasos.map((x) => x.clave)).toEqual(['productos', 'carrito', 'pago', 'pagados']);
  expect(p.tasa).toBeCloseTo(212 / 6940);
  expect(p.pasos[3].final).toBe(true);
  const r = embudoReserva(t);
  expect(r.tasa).toBeCloseTo(157 / 864);
  expect(conversionPagina(t.paginas[0])).toBeCloseTo(84 / 4000);
  expect(conversionPagina({ ruta: '/x', visitas: 0, sesiones: 0, conversiones: 0 })).toBeNull();
});
