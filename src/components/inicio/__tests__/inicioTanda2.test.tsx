/**
 * @jest-environment jsdom
 */
/**
 * Inicio, tanda 2 (aprobada por el dueño el 2026-09-30): «Ventas del periodo»
 * por canal, «Tienda web», «Módulos» con resumen y reordenar/ocultar,
 * «Personalizar el inicio» y «Tu turno». Render real con next-intl en los
 * cuatro idiomas: una clave que falte saldría cruda («home.modulos…»).
 * Cifras y nombres ficticios.
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: (v: string) => (v ? '8:05 a. m.' : '') }),
}));
jest.mock('@/components/inicio/LiveVisitorsBadge', () => ({ LiveVisitorsBadge: () => null }));

import { fireEvent, waitFor, within } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { TarjetaVentas } from '../TarjetaVentas';
import { TarjetaTiendaWeb } from '../TarjetaTiendaWeb';
import { ModulosInicio } from '../ModulosInicio';
import { DialogoPersonalizar } from '../DialogoPersonalizar';
import { BotonTurno, TurnoCard } from '../TurnoInicio';
import { resumirModulo } from '@/lib/dashboard/resumenModulos';
import { PREFERENCIAS_VACIAS } from '@/lib/dashboard/preferenciasInicio';
import type { TurnoInicio } from '@/lib/dashboard/inicio.server';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const sinClavesCrudas = (texto: string | null) => expect(texto ?? '').not.toMatch(/\b(home|nav)\.[a-zA-Z]/);

let respuestas: Record<string, { status: number; json: unknown }> = {};
let pedidos: Array<{ url: string; org: string | null; method: string; body?: string }> = [];

beforeEach(() => {
  pedidos = [];
  respuestas = {};
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({
      url,
      org: (init?.headers as Record<string, string> | undefined)?.['X-Organization-Id'] ?? null,
      method: init?.method ?? 'GET',
      body: init?.body as string | undefined,
    });
    const clave = Object.keys(respuestas).find((k) => url.startsWith(k));
    const r = clave ? respuestas[clave] : { status: 500, json: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.json } as Response;
  });
});

const VENTAS = {
  desde: 'a', hasta: 'b', moneda_base: 'COP', monedas: ['COP'], unaSucursal: true, sucursales: {},
  actual: { cobrado: 4200000, reintegros: 0, neto: 4200000, num_cobros: 50, ventas_cobradas: 48, ticket_promedio: 87500, por_canal: { pos: 3000000, web: 1200000 }, por_sucursal: { '7': 4200000 } },
  anterior: { cobrado: 3684210, reintegros: 0, neto: 3684210, num_cobros: 40, ventas_cobradas: 40 },
};

describe('TarjetaVentas', () => {
  test('pide el periodo y la sucursal con la organización en la cabecera; pinta neto, variación y canales', async () => {
    respuestas['/api/inicio/ventas'] = { status: 200, json: VENTAS };
    const { container } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="7d" sucursal={7} />);
    await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
    expect(pedidos[0]).toMatchObject({ url: '/api/inicio/ventas?periodo=7d&sucursal=7', org: '120' });
    expect(container.querySelector('[data-cifra="neto"]')?.textContent).toMatch(/4\.200\.000/);
    expect(container.textContent).toContain('+14,0 %');
    // Tanda 4 (Figma 447:73045): canales, contra qué se compara y la moneda.
    expect(container.querySelector('[data-subtitulo="ventas"]')?.textContent).toBe('POS + Tienda web · frente a los 7 días anteriores · COP');
    // El desglose y las ventas cobradas pasaron al detalle (448:196680).
    fireEvent.click(container.querySelector('#inicio-ventas-titulo button') as HTMLElement);
    const detalle = document.body.querySelector('[data-detalle="ventas"]') as HTMLElement;
    expect(detalle.textContent).toContain('POS');
    expect(detalle.textContent).toContain('Transacciones48');
  });

  test('con cobros en varias monedas no muestra un total', async () => {
    respuestas['/api/inicio/ventas'] = { status: 200, json: { ...VENTAS, monedas: ['COP', 'USD'] } };
    const { container } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="hoy" sucursal={null} />);
    await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
    expect(container.querySelector('[data-cifra="neto"]')?.textContent).toBe('Cobros en varias monedas');
    expect(container.querySelector('[data-desglose]')).toBeNull();
  });

  test('sin permiso de ventas (403) no se pinta', async () => {
    respuestas['/api/inicio/ventas'] = { status: 403, json: {} };
    const { container } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="hoy" sucursal={null} />);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  test.each(IDIOMAS)('%s: sin claves crudas', async (idioma) => {
    respuestas['/api/inicio/ventas'] = { status: 200, json: VENTAS };
    const { container } = renderConIdioma(<TarjetaVentas organizationId={120} periodo="hoy" sucursal={7} />, { idioma });
    await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
    sinClavesCrudas(container.textContent);
  });
});

describe('TarjetaTiendaWeb', () => {
  const TIENDA = { activa: true, actual: { visitantes: 4812, sesiones: 3104, sesiones_nuevas: 1924, pedidos: 164, pedidos_pagados: 150 }, anterior: { visitantes: 4070, sesiones: 2900, pedidos: 150, pedidos_pagados: 140 }, pendientes: 12, hrefPedidos: '/app/pos/pedidos-online', hrefAnalitica: '/app/sitio-web/analitica' };

  test.each(IDIOMAS)('%s: tres casillas, enlace del menú y sin claves crudas', async (idioma) => {
    respuestas['/api/inicio/tienda-web'] = { status: 200, json: TIENDA };
    const { container } = renderConIdioma(<TarjetaTiendaWeb organizationId={120} periodo="30d" sucursal={null} />, { idioma });
    await waitFor(() => expect(container.querySelectorAll('h3')).toHaveLength(3));
    // Figma 463:15514: solo «Ver analítica web» (los pedidos se atienden desde «Hoy»).
    expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/app/sitio-web/analitica']);
    sinClavesCrudas(container.textContent);
  });

  test('sin tienda web no se pinta', async () => {
    respuestas['/api/inicio/tienda-web'] = { status: 200, json: { activa: false, hrefPedidos: null, hrefAnalitica: null } };
    const { container } = renderConIdioma(<TarjetaTiendaWeb organizationId={120} periodo="hoy" sucursal={null} />);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});

const fila = (codigo: string, idNav: string, etiqueta: string, crudo: Record<string, unknown>, oculto = false) => ({
  codigo, idNav, etiqueta, href: `/app/${idNav}`, oculto,
  resumen: oculto ? null : resumirModulo({ codigo, ...crudo }, 'COP'),
});

const MODULOS = {
  modulos: [
    fila('finance', 'finanzas', 'finance', { cartera_vencida: 3480000, cuentas_vencidas: 7, por_cobrar: 8920000, monedas_cartera: ['COP'], dias_mas_vieja: 42, por_pagar_7d: { total: 0, cuentas: 0, monedas: [] } }),
    fila('hrm', 'hrm', 'hrm', { personas_activas: 38, ausentes_hoy: 3, turnos_hoy: 20, ausencias_por_aprobar: 2 }),
    fila('pos', 'pos', 'pos', {}, true),
  ],
  badgeSolido: 'finance', moneda: 'COP', zona: 'America/Bogota', calculadoEn: '2026-09-30T13:05:00Z',
};

describe('ModulosInicio', () => {
  test('filas plegadas con resumen; un solo badge sólido; los ocultos no aparecen', async () => {
    respuestas['/api/inicio/modulos'] = { status: 200, json: MODULOS };
    const { container } = renderConIdioma(
      <ModulosInicio organizationId={120} periodo="hoy" sucursal={null} prefs={PREFERENCIAS_VACIAS} onGuardar={async () => true} />,
    );
    await waitFor(() => expect(container.querySelectorAll('li[data-modulo]')).toHaveLength(2));
    expect(pedidos[0]).toMatchObject({ url: '/api/inicio/modulos?periodo=hoy', org: '120' });
    const finanzas = container.querySelector('li[data-modulo="finance"]')!;
    expect(finanzas.textContent).toContain('7 vencidas');
    expect(finanzas.querySelector('[data-resumen]')?.textContent).toMatch(/Cartera vencida \$\s?3\.480\.000/);
    expect(container.textContent).toContain('2 por aprobar');
  });

  test('desplegar muestra los KPIs del mismo resumen y «Ver módulo» con el enlace del menú, sin otra consulta', async () => {
    respuestas['/api/inicio/modulos'] = { status: 200, json: MODULOS };
    const { container } = renderConIdioma(
      <ModulosInicio organizationId={120} periodo="hoy" sucursal={7} prefs={PREFERENCIAS_VACIAS} onGuardar={async () => true} />,
    );
    await waitFor(() => expect(container.querySelector('li[data-modulo="finance"] button')).not.toBeNull());
    fireEvent.click(container.querySelector('li[data-modulo="finance"] button')!);
    const panel = container.querySelector('#inicio-modulo-finance')!;
    expect(panel.querySelectorAll('h4')).toHaveLength(3);
    expect(panel.querySelector('a')?.getAttribute('href')).toBe('/app/finanzas');
    expect(panel.textContent).toContain('Sucursal elegida');
    expect(pedidos).toHaveLength(1);
  });

  test('reordenar y ocultar: «Listo» guarda orden y ocultos', async () => {
    respuestas['/api/inicio/modulos'] = { status: 200, json: MODULOS };
    const onGuardar = jest.fn(async () => true);
    const { container, getByText } = renderConIdioma(
      <ModulosInicio organizationId={120} periodo="hoy" sucursal={null} prefs={PREFERENCIAS_VACIAS} onGuardar={onGuardar} />,
    );
    await waitFor(() => expect(container.querySelectorAll('li[data-modulo]')).toHaveLength(2));
    fireEvent.click(getByText('Reordenar y ocultar'));
    expect(container.querySelectorAll('li[data-modulo]')).toHaveLength(3);
    const hrm = container.querySelector('li[data-modulo="hrm"]')!;
    fireEvent.click(within(hrm as HTMLElement).getByLabelText(/Subir/));
    fireEvent.click(within(container.querySelector('li[data-modulo="pos"]') as HTMLElement).getByRole('switch'));
    fireEvent.click(getByText('Listo'));
    await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1));
    expect(onGuardar).toHaveBeenCalledWith({ bloquesOcultos: [], modulosOrden: ['hrm', 'finance', 'pos'], modulosOcultos: [] });
  });

  test.each(IDIOMAS)('%s: sin claves crudas (plegado y desplegado)', async (idioma) => {
    respuestas['/api/inicio/modulos'] = { status: 200, json: MODULOS };
    const { container } = renderConIdioma(
      <ModulosInicio organizationId={120} periodo="hoy" sucursal={null} prefs={PREFERENCIAS_VACIAS} onGuardar={async () => true} />,
      { idioma },
    );
    await waitFor(() => expect(container.querySelectorAll('li[data-modulo]')).toHaveLength(2));
    for (const b of Array.from(container.querySelectorAll('li[data-modulo] > button'))) fireEvent.click(b);
    sinClavesCrudas(container.textContent);
  });
});

describe('DialogoPersonalizar', () => {
  test.each(IDIOMAS)('%s: «Hoy» fijo, bloques y módulos; guarda lo elegido', async (idioma) => {
    const onGuardar = jest.fn(async () => true);
    renderConIdioma(
      <DialogoPersonalizar abierto onAbiertoChange={() => undefined} prefs={PREFERENCIAS_VACIAS} modulos={[{ codigo: 'finance', nombre: 'Finanzas' }]} onGuardar={onGuardar} />,
      { idioma },
    );
    const dialogo = document.body.querySelector('[role="dialog"]') as HTMLElement;
    const interruptores = within(dialogo).getAllByRole('switch');
    // Hoy + 3 bloques (ventas, actividad, tienda web; «Indicadores» salió en la tanda 4) + 1 módulo.
    expect(interruptores).toHaveLength(5);
    expect(interruptores[0].hasAttribute('disabled')).toBe(true);
    sinClavesCrudas(dialogo.textContent);
    fireEvent.click(interruptores[4]);
    const botones = within(dialogo).getAllByRole('button');
    fireEvent.click(botones[botones.length - 1]);
    await waitFor(() => expect(onGuardar).toHaveBeenCalledWith({ bloquesOcultos: [], modulosOrden: [], modulosOcultos: ['finance'] }));
  });
});

const TURNO: TurnoInicio = {
  visible: true, estado: 'antes', entradaProgramada: '2026-09-30T13:00:00Z', salidaProgramada: '2026-09-30T22:00:00Z',
  entradaMarcada: null, salidaMarcada: null, minutos: 0, sucursal: 'Sucursal Principal', hrefMarcar: '/marcar', hrefMarcaciones: '/app/hrm/marcacion',
};

describe('Tu turno', () => {
  test('botón del encabezado según el estado; cerrado no se muestra', () => {
    const r1 = renderConIdioma(<BotonTurno turno={{ ...TURNO, estado: 'sinMarcar', minutos: 12 }} />);
    expect(r1.container.textContent).toContain('Marcar entrada');
    expect(r1.container.textContent).toContain('12 min tarde');
    expect(r1.container.querySelector('a')?.getAttribute('href')).toBe('/marcar');
    const r2 = renderConIdioma(<BotonTurno turno={{ ...TURNO, estado: 'enTurno', minutos: 192 }} />);
    expect(r2.container.textContent).toBe('Marcar salida · 3 h 12 min');
    const r3 = renderConIdioma(<BotonTurno turno={{ ...TURNO, estado: 'cerrado' }} />);
    expect(r3.container.textContent).toBe('');
    const r4 = renderConIdioma(<BotonTurno turno={null} />);
    expect(r4.container.textContent).toBe('');
  });

  test('tarjeta cerrada: «Ver mis marcaciones» solo si la persona ve esa página', () => {
    const con = renderConIdioma(<TurnoCard turno={{ ...TURNO, estado: 'cerrado', entradaMarcada: 'a', salidaMarcada: 'b', minutos: 540 }} />);
    expect(con.container.querySelector('a')?.getAttribute('href')).toBe('/app/hrm/marcacion');
    const sin = renderConIdioma(<TurnoCard turno={{ ...TURNO, estado: 'cerrado', hrefMarcaciones: null }} />);
    expect(sin.container.querySelector('a')).toBeNull();
  });

  test.each(IDIOMAS)('%s: todos los estados sin claves crudas', (idioma) => {
    for (const estado of ['antes', 'sinMarcar', 'enTurno', 'cerrado', 'sinTurno'] as const) {
      const { container, unmount } = renderConIdioma(<TurnoCard turno={{ ...TURNO, estado, minutos: 75 }} compacta />, { idioma });
      expect(container.querySelector('[data-estado-turno]')?.getAttribute('data-estado-turno')).toBe(estado);
      sinClavesCrudas(container.textContent);
      unmount();
    }
  });
});
