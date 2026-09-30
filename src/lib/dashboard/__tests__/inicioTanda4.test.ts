/**
 * Inicio, tanda 4 (Figma 445:137185, 445:137617, 448:196680): reglas puras de
 * las series (gráfica de ventas y miniaturas de la tienda), de «Actividad
 * reciente» y de «Primeros pasos».
 *
 * Se corre con TZ=UTC y TZ=America/Bogota (`npm run test:tz-all`): las
 * etiquetas de día salen de la zona que se pasa, nunca de la del proceso.
 * Datos ficticios.
 */
import {
  compararSeries,
  conversionPorPunto,
  csvVentasPeriodo,
  etiquetaPunto,
  leerGranularidad,
  leerSerie,
  rangoSerie,
  serieConDatos,
  trazoMiniatura,
} from '../serieInicio';
import {
  TAMANO_ACTIVIDAD,
  contextoActividad,
  filtrosVisibles,
  haceCuanto,
  leerActividad,
  leerPedidoActividad,
  queryActividad,
  tituloActividad,
  type FilaActividad,
} from '../actividadInicio';
import { armarPrimerosPasos, mostrarPrimerosPasos, pasosHechos, porcentajePasos, PAGINA_PASO } from '../primerosPasos';

describe('series del inicio', () => {
  test('leerSerie: tolera filas raras, números como texto y ausencia de serie', () => {
    expect(leerSerie(undefined)).toEqual([]);
    expect(
      leerSerie([{ b: '2026-09-01', v: '1500.5' }, { b: 'basura', v: 3 }, null, { b: '2026-09-02T08', v: 7 }, { b: '2026-09-03' }]),
    ).toEqual([
      { b: '2026-09-01', v: 1500.5 },
      { b: '2026-09-02T08', v: 7 },
      { b: '2026-09-03', v: 0 },
    ]);
    expect(leerSerie([{ b: '2026-09-01', visitantes: 12 }], 'visitantes')).toEqual([{ b: '2026-09-01', v: 12 }]);
    expect(leerGranularidad('hora')).toBe('hora');
    expect(leerGranularidad(undefined)).toBe('dia');
  });

  test('compararSeries alinea por posición; al más corto le falta el punto (null, no 0)', () => {
    const actual = [{ b: '2026-09-22', v: 10 }, { b: '2026-09-23', v: 20 }, { b: '2026-09-24', v: 5 }];
    const anterior = [{ b: '2026-09-19', v: 8 }, { b: '2026-09-20', v: 0 }];
    expect(compararSeries(actual, anterior)).toEqual([
      { indice: 0, b: '2026-09-22', actual: 10, anterior: 8 },
      { indice: 1, b: '2026-09-23', actual: 20, anterior: 0 },
      { indice: 2, b: '2026-09-24', actual: 5, anterior: null },
    ]);
    expect(serieConDatos([{ v: 0 }, { v: 0 }])).toBe(false);
    expect(serieConDatos([{ v: 0 }, { v: -3 }])).toBe(true);
  });

  test('etiquetas: la hora local tal cual y el día sin correrse, con cualquier TZ del proceso', () => {
    expect(etiquetaPunto('2026-09-30T08', 'hora', 'es', 'America/Bogota')).toBe('8 h');
    // Día plano en Bogotá (UTC−5) y en Tokio (UTC+9): siempre el 1 de septiembre.
    expect(etiquetaPunto('2026-09-01', 'dia', 'es', 'America/Bogota')).toMatch(/^1 sept?$/);
    expect(etiquetaPunto('2026-09-01', 'dia', 'es', 'Asia/Tokyo')).toMatch(/^1 sept?$/);
    expect(etiquetaPunto('2026-09-01', 'dia', 'en', 'America/Bogota')).toBe('Sep 1');
    expect(etiquetaPunto('no', 'dia', 'es', 'America/Bogota')).toBe('');
    const serie = [{ b: '2026-09-01', v: 1 }, { b: '2026-09-22', v: 2 }];
    expect(rangoSerie(serie, 'dia', 'es', 'America/Bogota')).toMatch(/^1 sept? — 22 sept?$/);
    expect(rangoSerie([{ b: '2026-09-30T08', v: 1 }, { b: '2026-09-30T17', v: 1 }], 'hora', 'es', 'America/Bogota')).toBe('8 h — 17 h');
    expect(rangoSerie([], 'dia', 'es', 'America/Bogota')).toBe('');
  });

  test('trazoMiniatura: dentro del lienzo, el máximo arriba y el área cerrada abajo', () => {
    expect(trazoMiniatura([], 100, 40)).toBeNull();
    const t = trazoMiniatura([0, 10, 5], 100, 40, 2)!;
    expect(t.linea).toBe('M0,40 L50,2 L100,21');
    expect(t.area).toBe('M0,40 L50,2 L100,21 L100,40 L0,40 Z');
    // Un solo punto: línea plana de lado a lado.
    expect(trazoMiniatura([3], 100, 40, 2)!.linea).toBe('M0,2 L100,2');
  });

  test('conversión por punto: pagados / visitantes; sin visitas, 0', () => {
    expect(conversionPorPunto([100, 0, 50], [5, 2, 1])).toEqual([5, 0, 2]);
  });

  test('CSV del detalle: cabecera en el idioma de la interfaz, «;» y sin fórmulas', () => {
    const csv = csvVentasPeriodo(
      [
        { indice: 0, b: '2026-09-30T08', actual: 1500, anterior: 1200 },
        { indice: 1, b: '2026-09-30T09', actual: 0, anterior: null },
      ],
      { punto: 'Hora', actual: 'Hoy', anterior: '=Ayer' },
    );
    expect(csv.replace('﻿', '').split('\r\n')).toEqual(['Hora;Hoy;\'=Ayer', '2026-09-30T08;1500;1200', '2026-09-30T09;0;']);
  });
});

describe('actividad reciente', () => {
  const qs = (s: string) => new URLSearchParams(s);

  test('pedido: tipo, página y tamaño validados; «todo» no filtra', () => {
    expect(leerPedidoActividad(qs(''))).toEqual({ tipo: null, pagina: 1, tamano: TAMANO_ACTIVIDAD });
    expect(leerPedidoActividad(qs('tipo=todo&pagina=2'))).toEqual({ tipo: null, pagina: 2, tamano: 4 });
    expect(leerPedidoActividad(qs('tipo=stock&pagina=3&tamano=10'))).toEqual({ tipo: 'stock', pagina: 3, tamano: 10 });
    expect(leerPedidoActividad(qs('tipo=nomina'))).toBeNull();
    expect(leerPedidoActividad(qs('pagina=0'))).toBeNull();
    expect(leerPedidoActividad(qs('pagina=1.5'))).toBeNull();
    expect(leerPedidoActividad(qs('tamano=21'))).toBeNull();
    expect(queryActividad({ filtro: 'todo', pagina: 1 })).toBe('pagina=1');
    expect(queryActividad({ filtro: 'factura', pagina: 2 })).toBe('tipo=factura&pagina=2');
  });

  test('respuesta de la base: tolerante y sin tipos desconocidos', () => {
    const a = leerActividad({
      tipos: ['venta', 'cliente', 'nomina'],
      conteos: { venta: '12', cliente: 3, nomina: 9 },
      total: 15,
      filas: [
        { tipo: 'venta', id: 'v1', fecha: '2026-09-30T13:00:00Z', monto: '189900', moneda: 'COP', estado: 'paid', canal: 'pos', autor: 'Ana G.' },
        { tipo: 'nomina', id: 'x', fecha: '2026-09-30T13:00:00Z' },
        { tipo: 'stock', id: 7, fecha: '2026-09-30T13:00:00Z' },
      ],
    });
    expect(a.tipos).toEqual(['venta', 'cliente']);
    expect(a.conteos).toEqual({ venta: 12, cliente: 3 });
    expect(a.total).toBe(15);
    expect(a.filas).toHaveLength(1);
    expect(a.filas[0]).toMatchObject({ monto: 189900, autor: 'Ana G.', estado: 'paid' });
    expect(leerActividad(null)).toEqual({ tipos: [], conteos: {}, total: 0, filas: [] });
  });

  test('chips: «Todo» y los tipos visibles; «Reservas» solo si hay alguna', () => {
    expect(filtrosVisibles({ tipos: ['venta', 'factura', 'cliente', 'stock', 'reserva'], conteos: {} })).toEqual([
      'todo', 'venta', 'factura', 'cliente', 'stock',
    ]);
    expect(filtrosVisibles({ tipos: ['venta', 'reserva'], conteos: { reserva: 2 } })).toEqual(['todo', 'venta', 'reserva']);
  });

  const fila = (p: Partial<FilaActividad>): FilaActividad => ({
    tipo: 'venta', id: '1', fecha: '2026-09-30T13:00:00Z', monto: null, moneda: null, estado: null, canal: null, numero: null,
    autor: null, sucursal: null, nombre: null, producto: null, cantidad: null, direccion: null, ...p,
  });

  test('títulos y contexto como en el diseño; un estado desconocido nunca sale crudo', () => {
    expect(tituloActividad(fila({ estado: 'paid' }))).toEqual({ clave: 'titulos.venta.paid' });
    expect(tituloActividad(fila({ estado: 'raro' }))).toEqual({ clave: 'titulos.venta.otro' });
    expect(tituloActividad(fila({ tipo: 'factura', estado: 'issued', numero: 'FV-0912' }))).toEqual({
      clave: 'titulos.factura.issued', params: { numero: 'FV-0912' },
    });
    expect(tituloActividad(fila({ tipo: 'cliente', nombre: 'Cliente de prueba' }))).toEqual({ clave: 'titulos.cliente', params: { nombre: 'Cliente de prueba' } });
    expect(tituloActividad(fila({ tipo: 'cliente' }))).toEqual({ clave: 'titulos.clienteSinNombre' });
    expect(tituloActividad(fila({ tipo: 'stock', direccion: 'out', producto: 'Zapatilla 42' }))).toEqual({
      clave: 'titulos.salidaStock', params: { producto: 'Zapatilla 42' },
    });
    expect(contextoActividad(fila({ autor: 'Ana G.', sucursal: 'Principal' }))).toEqual({ clave: 'contexto.texto', params: { texto: 'Ana G.' } });
    expect(contextoActividad(fila({ tipo: 'factura', sucursal: 'Principal' }))).toEqual({ clave: 'contexto.texto', params: { texto: 'Principal' } });
    expect(contextoActividad(fila({ tipo: 'cliente' }))).toEqual({ clave: 'contexto.crm' });
    expect(contextoActividad(fila({ tipo: 'stock', direccion: 'in', cantidad: 24 }))).toEqual({ clave: 'contexto.entrada', params: { n: 24 } });
    expect(contextoActividad(fila({ tipo: 'stock', direccion: 'out', cantidad: -3 }))).toEqual({ clave: 'contexto.salida', params: { n: 3 } });
  });

  test('«hace N min»: sobre instantes, igual en cualquier zona', () => {
    const ahora = new Date('2026-09-30T13:41:00Z');
    expect(haceCuanto('2026-09-30T13:40:30Z', ahora)).toEqual({ clave: 'ahora' });
    expect(haceCuanto('2026-09-30T13:38:00Z', ahora)).toEqual({ clave: 'minutos', n: 3 });
    expect(haceCuanto('2026-09-30T11:00:00Z', ahora)).toEqual({ clave: 'horas', n: 2 });
    expect(haceCuanto('2026-09-28T11:00:00Z', ahora)).toEqual({ clave: 'fecha' });
    expect(haceCuanto('no', ahora)).toEqual({ clave: 'fecha' });
  });
});

describe('primeros pasos', () => {
  const conteos = { modulos: 3, sucursales: 1, miembros: 1, productos: 0, impuestos: 0, clientes: 0 };

  test('hechos: la organización siempre; el equipo cuando hay alguien más', () => {
    expect(pasosHechos(conteos)).toEqual({
      modulos: true, organizacion: true, sucursal: true, equipo: false, productos: false, impuestos: false, clientes: false,
    });
    expect(pasosHechos({ ...conteos, miembros: 2 }).equipo).toBe(true);
  });

  test('«Ir» y las acciones del vacío solo si la página está en el menú de la persona', () => {
    const visibles = new Set([PAGINA_PASO.productos, '/app/pos']);
    const p = armarPrimerosPasos(conteos, false, (h) => visibles.has(h));
    expect(p.hechos).toBe(3);
    expect(porcentajePasos(p)).toBe(43);
    expect(p.pasos.find((x) => x.id === 'productos')?.href).toBe('/app/inventario/productos');
    expect(p.pasos.find((x) => x.id === 'impuestos')?.href).toBeNull();
    expect(p.hrefProductos).toBe('/app/inventario/productos');
    expect(p.hrefPos).toBe('/app/pos');
  });

  test('se muestra en lugar de «Hoy» solo sin movimientos, con pasos pendientes y sin ocultar', () => {
    const p = armarPrimerosPasos(conteos, false, () => true);
    expect(mostrarPrimerosPasos(p, false)).toBe(true);
    expect(mostrarPrimerosPasos(p, true)).toBe(false);
    expect(mostrarPrimerosPasos({ ...p, hayMovimientos: true }, false)).toBe(false);
    const todo = armarPrimerosPasos({ modulos: 1, sucursales: 1, miembros: 2, productos: 1, impuestos: 1, clientes: 1 }, false, () => true);
    expect(mostrarPrimerosPasos(todo, false)).toBe(false);
    expect(mostrarPrimerosPasos(null, false)).toBe(false);
  });
});
