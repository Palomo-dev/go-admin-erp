/**
 * @jest-environment jsdom
 */
/**
 * Bloque «Hoy» y `TarjetaHoy` (Figma 445:137185 / 445:195385): pide las
 * cifras a `/api/inicio/hoy` con la sucursal del header, pinta las casillas
 * por urgencia con su acción y dice cuántas cosas hay por atender. Se
 * renderiza en los cuatro idiomas: una clave que falte saldría como texto
 * crudo («home.hoy…»).
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: () => '8:05 a. m.' }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP' }),
}));

import { fireEvent, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { BloqueHoy } from '../BloqueHoy';
import { TarjetaHoy } from '../TarjetaHoy';

const DATOS = {
  porCobrar: { vencido: 3480000, cuentas: 7, diasMasVieja: 42, monedas: ['COP'] },
  stock: { bajoMinimo: 0, agotados: 0 },
  pedidosWeb: null,
  cajasAnteriores: { cantidad: 0, diasMasVieja: 0 },
  tareas: { abiertas: 4, vencenHoy: 1, vencidas: 0 },
  unaSucursal: true,
  generadoEn: '2026-09-29T13:05:00Z',
};

let pedidos: { url: string; org: string | null }[] = [];
let respuesta: { ok: boolean; json: unknown } = { ok: true, json: DATOS };

beforeEach(() => {
  pedidos = [];
  respuesta = { ok: true, json: DATOS };
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({ url, org: (init?.headers as Record<string, string> | undefined)?.['X-Organization-Id'] ?? null });
    return { ok: respuesta.ok, status: respuesta.ok ? 200 : 500, json: async () => respuesta.json } as Response;
  });
});

describe('BloqueHoy', () => {
  test('pide las cifras de la sucursal activa con la organización en la cabecera', async () => {
    renderConIdioma(<BloqueHoy organizationId={120} sucursal={7} />);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0]).toEqual({ url: '/api/inicio/hoy?sucursal=7', org: '120' });
  });

  test('sin sucursal (todas) no manda el parámetro', async () => {
    renderConIdioma(<BloqueHoy organizationId={120} sucursal={null} />);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].url).toBe('/api/inicio/hoy');
  });

  test('pinta las casillas por urgencia, con cifra, estado y una acción cada una', async () => {
    const { container } = renderConIdioma(<BloqueHoy organizationId={120} sucursal={7} />);
    await waitFor(() => expect(container.querySelectorAll('article')).toHaveLength(3));
    const tarjetas = Array.from(container.querySelectorAll('article'));
    expect(tarjetas.map((t) => t.getAttribute('data-tono'))).toEqual(['peligro', 'advertencia', 'neutro']);
    expect(tarjetas[0].innerHTML).toContain('Por cobrar vencido');
    expect(tarjetas[0].innerHTML).toContain('Vencido');
    expect(tarjetas[0].textContent).toMatch(/\$\s?3\.480\.000/);
    expect(tarjetas[0].textContent).toContain('7 cuentas · 42 días la más vieja');
    expect(tarjetas[0].querySelector('a')?.getAttribute('href')).toBe('/app/finanzas/cuentas-por-cobrar');
    expect(tarjetas[1].textContent).toContain('4 abiertas');
    expect(tarjetas[1].textContent).toContain('1 vence hoy');
    expect(tarjetas[2].textContent).toContain('Sin faltantes');
    expect(tarjetas[2].querySelector('a')?.getAttribute('href')).toBe('/app/inventario/stock');
    expect(container.textContent).toContain('2 cosas por atender');
    expect(container.textContent).toContain('Actualizado a las 8:05 a. m.');
    // Cada tarjeta tiene exactamente una acción.
    for (const t of tarjetas) expect(t.querySelectorAll('a')).toHaveLength(1);
  });

  test('móvil: tras las tres más urgentes, «Ver las N» con lo que queda (Figma 448:205300)', async () => {
    respuesta = {
      ok: true,
      json: {
        ...DATOS,
        stock: { bajoMinimo: 3, agotados: 0 },
        pedidosWeb: { pendientes: 2 },
        cajasAnteriores: { cantidad: 1, diasMasVieja: 2 },
      },
    };
    const { container } = renderConIdioma(<BloqueHoy organizationId={120} sucursal={7} />);
    await waitFor(() => expect(container.querySelectorAll('article')).toHaveLength(5));
    const clases = Array.from(container.querySelectorAll('article')).map((a) => a.getAttribute('class') ?? '');
    expect(clases.map((c) => c.includes('max-sm:hidden'))).toEqual([false, false, false, true, true]);
    const boton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Ver las'))!;
    expect(boton.textContent).toBe('Ver las 5 · Cajas sin cerrar, Mis tareas');
    fireEvent.click(boton);
    for (const a of Array.from(container.querySelectorAll('article'))) expect(a.getAttribute('class')).not.toContain('max-sm:hidden');
  });

  test('si falla la carga muestra el estado de error con «Reintentar»', async () => {
    respuesta = { ok: false, json: {} };
    const { container } = renderConIdioma(<BloqueHoy organizationId={120} sucursal={null} />);
    await waitFor(() => expect(container.innerHTML).toContain('button'));
    expect(container.querySelectorAll('article')).toHaveLength(0);
  });

  test.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('no deja claves sin traducir (%s)', async (idioma) => {
    const { container } = renderConIdioma(<BloqueHoy organizationId={120} sucursal={7} />, { idioma });
    await waitFor(() => expect(container.querySelectorAll('article')).toHaveLength(3));
    expect(container.innerHTML).not.toMatch(/home\.hoy|detalles\.|cifras\.|acciones\.|estados\.|etiquetas\./);
  });
});

describe('TarjetaHoy', () => {
  test('el acento lleva el tono y el enlace nombra la casilla para lectores de pantalla', () => {
    const { container } = renderConIdioma(
      <TarjetaHoy
        tono="advertencia"
        etiqueta="Pedidos web"
        estado="Urgente"
        cifra="12 pendientes"
        detalle="Esperan confirmación de pago"
        accion={{ etiqueta: 'Atender', href: '/app/pos/pedidos-online' }}
      />
    );
    const tarjeta = container.querySelector('article')!;
    expect(tarjeta.getAttribute('data-tono')).toBe('advertencia');
    expect(tarjeta.querySelector('span[aria-hidden="true"]')?.getAttribute('class')).toContain('bg-warning');
    const enlace = tarjeta.querySelector('a')!;
    expect(enlace.getAttribute('href')).toBe('/app/pos/pedidos-online');
    expect(enlace.textContent).toBe('Atender: Pedidos web');
  });
});
