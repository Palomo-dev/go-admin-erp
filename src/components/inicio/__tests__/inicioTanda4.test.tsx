/**
 * @jest-environment jsdom
 */
/**
 * Inicio igual al Figma (tanda 4, 2026-09-30): «Ventas del periodo» con su
 * gráfica y su detalle (445:137185, 448:196680), «Actividad reciente» con
 * filtros y paginación en el servidor, «Tienda web» con miniaturas,
 * «Primeros pasos» (445:137617) y el selector de periodo (445:195599 /
 * 448:196736). Render real con next-intl en los cuatro idiomas: una clave que
 * falte saldría cruda («home.actividad…»). Cifras y nombres ficticios.
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    timezone: 'America/Bogota',
    formatTime: () => '8:05 a. m.',
    getToday: () => '2026-09-30',
    toDate: () => '2026-09-30',
  }),
}));
jest.mock('@/components/inicio/LiveVisitorsBadge', () => ({ LiveVisitorsBadge: () => null }));

import { act, fireEvent, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { TarjetaVentas } from '../TarjetaVentas';
import { ActividadReciente } from '../ActividadReciente';
import { TarjetaTiendaWeb } from '../TarjetaTiendaWeb';
import { PrimerosPasos, SinMovimientos } from '../PrimerosPasos';
import { SelectorPeriodoInicio } from '../SelectorPeriodoInicio';
import { armarPrimerosPasos } from '@/lib/dashboard/primerosPasos';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const sinClavesCrudas = (texto: string | null) => expect(texto ?? '').not.toMatch(/\bhome\.[a-zA-Z]/);

let respuestas: Record<string, { status: number; json: unknown }> = {};
let pedidos: Array<{ url: string; org: string | null }> = [];

beforeEach(() => {
  simularAncho(1440);
  pedidos = [];
  respuestas = {};
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({ url, org: (init?.headers as Record<string, string> | undefined)?.['X-Organization-Id'] ?? null });
    const clave = Object.keys(respuestas).find((k) => url.startsWith(k));
    const r = clave ? respuestas[clave] : { status: 500, json: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.json } as Response;
  });
});

const VENTAS = {
  desde: 'a', hasta: 'b', moneda_base: 'COP', monedas: ['COP'], unaSucursal: true, sucursales: {}, hrefVentas: '/app/pos/ventas',
  actual: {
    cobrado: 1482900, reintegros: 0, neto: 1482900, num_cobros: 50, ventas_cobradas: 48, ticket_promedio: 30893,
    por_canal: { pos: 1104400, web: 378500 }, por_sucursal: { '7': 1482900 },
    granularidad: 'hora',
    serie: [{ b: '2026-09-30T08', v: 100000 }, { b: '2026-09-30T09', v: 400000 }, { b: '2026-09-30T17', v: 982900 }],
  },
  anterior: {
    cobrado: 1319100, reintegros: 0, neto: 1319100, num_cobros: 40, ventas_cobradas: 40,
    granularidad: 'hora', serie: [{ b: '2026-09-29T08', v: 90000 }, { b: '2026-09-29T09', v: 300000 }],
  },
};

describe('TarjetaVentas (gráfica dentro de la tarjeta)', () => {
  test('subtítulo del diseño, leyenda con el rango y detalle con desglose, «Ver ventas» y una lectura al abrir', async () => {
    respuestas['/api/inicio/ventas'] = { status: 200, json: VENTAS };
    const { container } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="hoy" sucursal={7} alcance="Sucursal Principal" />);
    await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
    expect(container.querySelector('[data-subtitulo="ventas"]')?.textContent).toBe('POS + Tienda web · frente a ayer a esta misma hora · COP');
    expect(container.textContent).toContain('+12,4 %');
    // Leyenda y rango (primer y último punto de la serie, en horas locales).
    expect(container.textContent).toContain('Ayer a la misma hora');
    expect(container.textContent).toContain('8 h — 17 h');
    expect(container.querySelector('[role="img"]')).not.toBeNull();

    fireEvent.click(container.querySelector('#inicio-ventas-titulo button') as HTMLElement);
    const detalle = document.body.querySelector('[data-detalle="ventas"]') as HTMLElement;
    expect(detalle).not.toBeNull();
    const dialogo = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialogo.textContent).toContain('Hoy · Sucursal Principal · COP');
    expect(detalle.textContent).toContain('POS');
    expect(detalle.textContent).toContain('Tienda web');
    expect(detalle.textContent).toContain('Transacciones48');
    expect(detalle.textContent).toContain('frente a ayer a esta misma hora');
    expect(within(dialogo).getByText('Exportar CSV')).not.toBeNull();
    expect(within(dialogo).getByText('Ver ventas').closest('a')?.getAttribute('href')).toBe('/app/pos/ventas');
    // «Se actualiza al abrirse»: una lectura más, sin intervalo.
    await waitFor(() => expect(pedidos.filter((p) => p.url.startsWith('/api/inicio/ventas'))).toHaveLength(2));
  });

  test('con varias monedas no hay total ni gráfica', async () => {
    respuestas['/api/inicio/ventas'] = { status: 200, json: { ...VENTAS, monedas: ['COP', 'USD'] } };
    const { container } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="30d" sucursal={null} />);
    await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')?.textContent).toBe('Cobros en varias monedas'));
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  test('«Actualizar» silencioso: si falla, conserva la cifra y avisa una vez', async () => {
    respuestas['/api/inicio/ventas'] = { status: 200, json: VENTAS };
    const fallo = jest.fn();
    const { container, rerender } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="hoy" sucursal={7} refresco={0} onFalloRefresco={fallo} />);
    await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
    respuestas['/api/inicio/ventas'] = { status: 500, json: {} };
    rerender(<TarjetaVentas organizationId={120} periodo="hoy" sucursal={7} refresco={1} onFalloRefresco={fallo} />);
    await waitFor(() => expect(fallo).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[data-cifra="neto"]')?.textContent).toMatch(/1\.482\.900/);
  });

  test.each(IDIOMAS)('%s: sin claves crudas en la tarjeta ni en el detalle', async (idioma) => {
    respuestas['/api/inicio/ventas'] = { status: 200, json: VENTAS };
    const { container } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="7d" sucursal={7} />, { idioma });
    await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
    sinClavesCrudas(container.textContent);
    fireEvent.click(container.querySelector('#inicio-ventas-titulo button') as HTMLElement);
    sinClavesCrudas(document.body.querySelector('[role="dialog"]')?.textContent ?? '');
  });
});

const ACTIVIDAD = {
  tipos: ['venta', 'factura', 'cliente', 'stock'],
  conteos: { venta: 6, factura: 4, cliente: 3, stock: 2 },
  total: 15,
  pagina: 1,
  tamano: 4,
  filas: [
    { tipo: 'venta', id: 'v1', fecha: new Date(Date.now() - 3 * 60_000).toISOString(), monto: 189900, moneda: 'COP', estado: 'paid', autor: 'Ana G.' },
    { tipo: 'factura', id: 'f1', fecha: new Date(Date.now() - 11 * 60_000).toISOString(), monto: 1240000, moneda: 'COP', estado: 'issued', numero: 'FV-2026-0912', sucursal: 'Sucursal Principal' },
    { tipo: 'cliente', id: 'c1', fecha: new Date(Date.now() - 26 * 60_000).toISOString(), nombre: 'Cliente de prueba' },
    { tipo: 'stock', id: '9', fecha: new Date(Date.now() - 41 * 60_000).toISOString(), direccion: 'in', cantidad: 24, producto: 'Zapatilla 42' },
  ],
};

describe('ActividadReciente', () => {
  test('lista del diseño con importes; filtro y página van al servidor con el periodo y la sucursal', async () => {
    respuestas['/api/inicio/actividad'] = { status: 200, json: ACTIVIDAD };
    const { container, getByText } = renderConIdioma(
      <ActividadReciente organizationId={120} periodo="hoy" sucursal={7} contexto="Sucursal Principal · Hoy" />,
    );
    await waitFor(() => expect(container.querySelectorAll('[data-actividad]')).toHaveLength(4));
    expect(pedidos[0]).toEqual({ url: '/api/inicio/actividad?periodo=hoy&sucursal=7&pagina=1', org: '120' });
    const filas = Array.from(container.querySelectorAll('[data-actividad]')).map((f) => f.textContent);
    expect(filas[0]).toContain('Venta pagada');
    expect(filas[0]).toContain('hace 3 min · Ana G.');
    expect(filas[0]).toMatch(/189\.900/);
    expect(filas[1]).toContain('Factura FV-2026-0912 emitida');
    expect(filas[2]).toContain('Cliente nuevo: Cliente de prueba');
    expect(filas[2]).toContain('CRM');
    expect(filas[3]).toContain('Entrada de stock · Zapatilla 42');
    expect(filas[3]).toContain('+24 unidades');
    expect(container.textContent).toContain('Sucursal Principal · Hoy');
    // Chips: Todo + los cuatro tipos que la base dice que la persona ve.
    const chips = Array.from(container.querySelectorAll('[role="group"] button')).map((b) => b.textContent);
    expect(chips).toEqual(['Todo', 'Ventas', 'Facturas', 'Clientes', 'Inventario']);
    // Paginación compacta «1–4 de 15».
    expect(container.textContent).toMatch(/1[–-]4 de 15/);

    fireEvent.click(getByText('Facturas'));
    await waitFor(() => expect(pedidos.at(-1)?.url).toBe('/api/inicio/actividad?periodo=hoy&sucursal=7&tipo=factura&pagina=1'));
    await waitFor(() => expect(container.querySelectorAll('[data-actividad]').length).toBeGreaterThan(0));
    fireEvent.click(container.querySelector('nav button[aria-label]:last-of-type') as HTMLElement);
    await waitFor(() => expect(pedidos.at(-1)?.url).toBe('/api/inicio/actividad?periodo=hoy&sucursal=7&tipo=factura&pagina=2'));
  });

  test('sin movimientos: estado vacío; sin permiso: no se pinta', async () => {
    respuestas['/api/inicio/actividad'] = { status: 200, json: { ...ACTIVIDAD, total: 0, filas: [] } };
    const { container } = renderConIdioma(<ActividadReciente organizationId={120} periodo="30d" sucursal={null} />);
    await waitFor(() => expect(container.textContent).toContain('Sin movimientos en el periodo'));
    respuestas['/api/inicio/actividad'] = { status: 403, json: {} };
    const otro = renderConIdioma(<ActividadReciente organizationId={120} periodo="hoy" sucursal={null} />);
    await waitFor(() => expect(otro.container.textContent).toBe(''));
  });

  test.each(IDIOMAS)('%s: sin claves crudas', async (idioma) => {
    respuestas['/api/inicio/actividad'] = { status: 200, json: ACTIVIDAD };
    const { container } = renderConIdioma(<ActividadReciente organizationId={120} periodo="hoy" sucursal={7} />, { idioma });
    await waitFor(() => expect(container.querySelectorAll('[data-actividad]')).toHaveLength(4));
    sinClavesCrudas(container.textContent);
  });
});

describe('TarjetaTiendaWeb (miniaturas)', () => {
  const TIENDA = {
    activa: true,
    actual: { visitantes: 4812, sesiones: 3104, sesiones_nuevas: 1924, pedidos: 164, pedidos_pagados: 150 },
    anterior: { visitantes: 4070, sesiones: 2900, pedidos: 150, pedidos_pagados: 140 },
    pendientes: 12, por_expirar: 1, expiran_hoy: 3, granularidad: 'dia',
    serie: [
      { b: '2026-09-28', visitantes: 150, pedidos: 5, pagados: 4 },
      { b: '2026-09-29', visitantes: 170, pedidos: 6, pagados: 6 },
      { b: '2026-09-30', visitantes: 160, pedidos: 4, pagados: 3 },
    ],
    hrefPedidos: '/app/pos/pedidos-online', hrefAnalitica: '/app/inicio/analitica-web',
  };

  test('tres miniaturas con la serie real y «12 pendientes · 3 expiran hoy»', async () => {
    respuestas['/api/inicio/tienda-web'] = { status: 200, json: TIENDA };
    const { container } = renderConIdioma(<TarjetaTiendaWeb organizationId={120} periodo="30d" sucursal={null} />);
    await waitFor(() => expect(container.querySelectorAll('svg[data-miniatura]')).toHaveLength(3));
    expect(Array.from(container.querySelectorAll('svg[data-miniatura]')).map((s) => s.getAttribute('data-miniatura'))).toEqual(['marca', 'advertencia', 'exito']);
    expect(container.textContent).toContain('12 pendientes · 3 expiran hoy');
  });

  test('sin serie (función anterior): sin miniaturas, el resto igual', async () => {
    respuestas['/api/inicio/tienda-web'] = { status: 200, json: { ...TIENDA, serie: undefined } };
    const { container } = renderConIdioma(<TarjetaTiendaWeb organizationId={120} periodo="30d" sucursal={null} />);
    await waitFor(() => expect(container.querySelectorAll('h3')).toHaveLength(3));
    expect(container.querySelectorAll('svg[data-miniatura]')).toHaveLength(0);
  });
});

describe('Primeros pasos (organización nueva)', () => {
  const visibles = new Set(['/app/organizacion/invitaciones', '/app/inventario/productos', '/app/pos']);
  const datos = armarPrimerosPasos({ modulos: 3, sucursales: 1, miembros: 1, productos: 0, impuestos: 0, clientes: 0 }, false, (h) => visibles.has(h));

  test.each(IDIOMAS)('%s: progreso, «Ir» solo a páginas del menú y «Ocultar por ahora»', (idioma) => {
    const ocultar = jest.fn();
    const { container } = renderConIdioma(<PrimerosPasos datos={datos} onOcultar={ocultar} />, { idioma });
    expect(container.querySelectorAll('[data-paso]')).toHaveLength(7);
    expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual([
      '/app/organizacion/invitaciones',
      '/app/inventario/productos',
    ]);
    sinClavesCrudas(container.textContent);
    if (idioma === 'es') {
      expect(container.textContent).toContain('3 de 7 · 43 %');
      fireEvent.click(within(container).getByText('Ocultar por ahora'));
      expect(ocultar).toHaveBeenCalled();
    }
  });

  test('«Todavía no hay movimientos» con «Agregar productos» y «Abrir el POS»', () => {
    const { container } = renderConIdioma(<SinMovimientos hrefProductos="/app/inventario/productos" hrefPos="/app/pos" />);
    expect(container.textContent).toContain('Todavía no hay movimientos');
    expect(Array.from(container.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Agregar productos', '/app/inventario/productos'],
      ['Abrir el POS', '/app/pos'],
    ]);
  });
});

describe('SelectorPeriodoInicio', () => {
  test('escritorio: siete opciones; «Personalizado» abre la capa anclada y aplica rango y horas', async () => {
    const onPeriodo = jest.fn();
    const onFechas = jest.fn();
    const onHoras = jest.fn();
    const { getAllByRole, getByRole } = renderConIdioma(
      <SelectorPeriodoInicio periodo="hoy" onPeriodo={onPeriodo} horas={null} onHoras={onHoras} fechas={null} onFechas={onFechas} />,
    );
    const opciones = getAllByRole('radio');
    expect(opciones.map((o) => o.textContent)).toEqual(['Hoy', 'Ayer', '7 días', '30 días', '90 días', 'Año', 'Personalizado']);
    expect(opciones[0].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(opciones[1]);
    expect(onPeriodo).toHaveBeenCalledWith('ayer');
    expect(onFechas).toHaveBeenCalledWith(null);

    await act(async () => {
      fireEvent.click(getByRole('radio', { name: 'Personalizado' }));
    });
    const capa = await waitFor(() => {
      const d = document.body.querySelector('[role="dialog"]') as HTMLElement;
      expect(d).not.toBeNull();
      return d;
    });
    expect(capa.textContent).toContain('Rango de fechas');
    expect(capa.textContent).toContain('America/Bogota');
    fireEvent.click(within(capa).getByText('Tarde'));
    fireEvent.click(within(capa).getByText('Aplicar'));
    expect(onFechas).toHaveBeenLastCalledWith({ fechaInicio: '2026-09-01', fechaFin: '2026-09-30' });
    expect(onHoras).toHaveBeenLastCalledWith({ horaInicio: '12:00', horaFin: '18:00' });
    expect(onPeriodo).toHaveBeenLastCalledWith('personalizado');
  });

  test('«Horas» abre sus franjas; «Todo el día» quita el filtro', async () => {
    const onHoras = jest.fn();
    const { getByText } = renderConIdioma(
      <SelectorPeriodoInicio periodo="7d" onPeriodo={() => undefined} horas={{ horaInicio: '06:00', horaFin: '12:00' }} onHoras={onHoras} fechas={null} onFechas={() => undefined} />,
    );
    await act(async () => {
      fireEvent.click(getByText('06:00–12:00'));
    });
    const capa = await waitFor(() => {
      const d = document.body.querySelector('[role="dialog"]') as HTMLElement;
      expect(d).not.toBeNull();
      return d;
    });
    fireEvent.click(within(capa).getByText('Todo el día'));
    fireEvent.click(within(capa).getByText('Aplicar'));
    expect(onHoras).toHaveBeenLastCalledWith(null);
  });

  test.each(IDIOMAS)('%s: sin claves crudas', (idioma) => {
    const { container } = renderConIdioma(
      <SelectorPeriodoInicio periodo="hoy" onPeriodo={() => undefined} horas={null} onHoras={() => undefined} fechas={null} onFechas={() => undefined} />,
      { idioma },
    );
    sinClavesCrudas(container.textContent);
  });
});
