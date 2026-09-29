/**
 * @jest-environment jsdom
 *
 * Buscador global (Figma SearchCommand 46:2493) — render con el proveedor real
 * de next-intl: atajos, accesibilidad (combobox/listbox), grupos, recientes
 * por usuario + organización y estados vacío, sin resultados y error.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('@/lib/supabase/config', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u-1' } } } }) } },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120 }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDate: (v: string) => v }) }));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ paraDocumento: () => ({ code: 'COP', decimals: 0, locale: 'es-CO' }) }),
}));
const abrirReportarProblema = jest.fn();
jest.mock('@/components/shell/header/ReportarProblema', () => ({ abrirReportarProblema: () => abrirReportarProblema() }));

import GlobalSearch, { ABRIR_BUSCADOR_EVENT, type PaginaBuscable } from '../GlobalSearch';

const PAGINAS: PaginaBuscable[] = [
  { id: '/app/inicio', name: 'Inicio', url: '/app/inicio' },
  { id: '/app/clientes', name: 'Clientes', url: '/app/clientes', description: 'Clientes' },
  { id: '/app/finanzas/facturacion-electronica', name: 'Facturación electrónica', url: '/app/finanzas/facturacion-electronica', description: 'Finanzas' },
];

type Respuesta = { grupos: unknown[]; fallidos: string[]; acciones: { id: string; href: string }[] };
let responder: (q: string) => Promise<Respuesta> = async () => ({ grupos: [], fallidos: [], acciones: [] });
const llamadas: Array<{ url: string; headers: Record<string, string> }> = [];

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  push.mockClear();
  abrirReportarProblema.mockClear();
  llamadas.length = 0;
  window.localStorage.clear();
  responder = async (q) =>
    q
      ? { grupos: [], fallidos: [], acciones: [] }
      : { grupos: [], fallidos: [], acciones: [{ id: 'nuevoProducto', href: '/app/inventario/productos/nuevo' }] };
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    llamadas.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> });
    const q = new URL(u, 'http://localhost').searchParams.get('q') ?? '';
    const cuerpo = await responder(q);
    return { ok: true, status: 200, json: async () => cuerpo } as Response;
  }) as typeof fetch;
});

const montar = () => renderConIdioma(<GlobalSearch paginas={PAGINAS} organizacionId="120" />);
const abrirConEvento = () => act(() => void window.dispatchEvent(new Event(ABRIR_BUSCADOR_EVENT)));
const escribir = (texto: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value: texto } });

describe('apertura y atajos', () => {
  it('Ctrl K abre la paleta con combobox y listbox accesibles; la acción rápida llega del servidor', async () => {
    montar();
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const combo = await screen.findByRole('combobox');
    expect(combo.getAttribute('aria-controls')).toBeTruthy();
    expect(screen.getByRole('listbox')).toBeTruthy();
    await waitFor(() => expect(combo.getAttribute('aria-activedescendant')).toBeTruthy());
    expect(await screen.findByText('Nuevo producto')).toBeTruthy();
    expect(screen.getByText('Reportar un problema')).toBeTruthy();
    expect(screen.getByText('Páginas')).toBeTruthy();
    // La organización viaja en la cabecera; el servidor la valida contra la sesión.
    expect(llamadas[0].headers['x-organization-id']).toBe('120');
  });

  it('«/» abre la paleta, salvo si el buscador de la página ya lo atendió', async () => {
    montar();
    const tomarlo = (e: KeyboardEvent) => {
      if (e.key === '/') e.preventDefault();
    };
    document.addEventListener('keydown', tomarlo);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.queryByRole('combobox')).toBeNull();
    document.removeEventListener('keydown', tomarlo);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(await screen.findByRole('combobox')).toBeTruthy();
  });

  it('«/» escrito en un campo no abre nada', () => {
    montar();
    const campo = document.createElement('input');
    document.body.appendChild(campo);
    fireEvent.keyDown(campo, { key: '/' });
    expect(screen.queryByRole('combobox')).toBeNull();
    campo.remove();
  });
});

describe('búsqueda', () => {
  it('filtra páginas sin tildes al instante', async () => {
    montar();
    abrirConEvento();
    escribir('facturacion');
    expect(await screen.findByText('Facturación electrónica')).toBeTruthy();
    expect(screen.queryByText('Inicio')).toBeNull();
  });

  it('agrupa los datos del servidor, anuncia la cantidad y guarda el reciente por usuario y organización', async () => {
    responder = async (q) => ({
      grupos: q
        ? [
            {
              tipo: 'customer',
              items: [
                {
                  id: 'c1',
                  tipo: 'customer',
                  titulo: 'María Pérez',
                  url: '/app/clientes/c1',
                  detalle: { tipoDocumento: 'CC', documento: '1020456789', email: 'maria@ejemplo.co' },
                },
              ],
            },
          ]
        : [],
      fallidos: [],
      acciones: [],
    });
    montar();
    abrirConEvento();
    escribir('maria');
    const fila = await screen.findByText('María Pérez', {}, { timeout: 2000 });
    const grupo = fila.closest('[cmdk-group]') as HTMLElement;
    expect(within(grupo).getByText('Clientes')).toBeTruthy();
    expect(screen.getByText('CC 1.020.456.789 · maria@ejemplo.co')).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('1 resultado'));

    fireEvent.click(fila);
    expect(push).toHaveBeenCalledWith('/app/clientes/c1');
    const guardado = JSON.parse(window.localStorage.getItem('go-admin:buscador:recientes:u-1:120') ?? '[]');
    expect(guardado[0]).toMatchObject({ tipo: 'customer', url: '/app/clientes/c1', titulo: 'María Pérez' });

    abrirConEvento();
    expect(await screen.findByText('Recientes')).toBeTruthy();
  });

  it('sin resultados: mensaje del Figma y «Crear producto» si el servidor concede la acción', async () => {
    montar();
    abrirConEvento();
    await screen.findByText('Nuevo producto');
    escribir('tornillo galvanizado');
    const titulo = await screen.findByText('Sin resultados para «tornillo galvanizado»', { selector: 'p' }, { timeout: 2000 });
    expect(titulo).toBeTruthy();
    // El lector de pantalla lo oye por la región viva.
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Sin resultados para «tornillo galvanizado»');
    fireEvent.click(screen.getByRole('button', { name: /Crear producto/ }));
    expect(push).toHaveBeenCalledWith('/app/inventario/productos/nuevo');
  });

  it('error del servidor: estado de error con «Reintentar» que vuelve a pedir', async () => {
    responder = async (q) => {
      if (q) throw new Error('red');
      return { grupos: [], fallidos: [], acciones: [] };
    };
    montar();
    abrirConEvento();
    escribir('xq');
    const alerta = await screen.findByRole('alert', {}, { timeout: 2000 });
    expect(within(alerta).getByText('No pudimos buscar en tus datos')).toBeTruthy();
    const antes = llamadas.length;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(antes), { timeout: 2000 });
  });

  it('«Reportar un problema» cierra la paleta y abre el diálogo de reporte', async () => {
    jest.useFakeTimers();
    try {
      montar();
      abrirConEvento();
      fireEvent.click(screen.getByText('Reportar un problema'));
      act(() => {
        jest.runOnlyPendingTimers();
      });
      expect(abrirReportarProblema).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
