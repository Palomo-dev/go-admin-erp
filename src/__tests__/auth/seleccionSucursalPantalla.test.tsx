/**
 * @jest-environment jsdom
 *
 * Pantalla «¿En qué sucursal trabajas hoy?» (Figma 2728:69155): orden, «Todas»,
 * teclado 1–9 / ↑ ↓ / Enter, validación en el servidor antes de guardar y
 * entrada directa con una sola sucursal. Datos ficticios.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const guardarSucursalActiva = jest.fn();
const replace = jest.fn();
let sucursalGuardada: number | null = 11;

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('dest=/app/pos'),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/auth/select-organization/sucursal',
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: { auth: { signOut: jest.fn().mockResolvedValue({}) } } }));
jest.mock('@/lib/auth/deadSession', () => ({ limpiarSesionMuerta: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/auth/seleccionSucursal', () => ({
  ...jest.requireActual('@/lib/auth/seleccionSucursal'),
  salirDelPaso: (url: string) => replace(url),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getCurrentBranchId: () => sucursalGuardada,
  guardarSucursalActiva: (...a: unknown[]) => guardarSucursalActiva(...a),
}));

// eslint-disable-next-line import/first -- después de los mocks
import SeleccionSucursalPage from '@/app/auth/select-organization/sucursal/page';


const RESPUESTA = {
  organizacion: { id: 120, nombre: 'Org de prueba' },
  rol: 'Cajero',
  verTodas: true,
  organizaciones: 2,
  sucursales: [
    { id: 10, nombre: 'Sucursal Principal', ciudad: 'Bogotá', direccion: 'Cra 45', principal: true, horario: { abierta: true }, cajaAbierta: null },
    { id: 11, nombre: 'Sede Norte', ciudad: 'Bogotá', direccion: 'Calle 140', principal: false, horario: { abierta: true }, cajaAbierta: 7 },
    { id: 12, nombre: 'Alameda', ciudad: null, direccion: null, principal: false, horario: { abierta: false, abre: { dia: null, hora: '08:00' } }, cajaAbierta: null },
  ],
};

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(cuerpo) });
}

let fetchMock: jest.Mock;

beforeEach(() => {
  guardarSucursalActiva.mockReset();
  replace.mockReset();
  sucursalGuardada = 11;
  fetchMock = jest.fn((_url: string, init?: { method?: string }) =>
    init?.method === 'POST' ? respuesta(200, { ok: true }) : respuesta(200, RESPUESTA),
  );
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

async function pintar() {
  renderConIdioma(<SeleccionSucursalPage />);
  await screen.findByRole('heading', { name: '¿En qué sucursal trabajas hoy?' });
}

function nombresEnOrden(): string[] {
  const lista = screen.getByRole('list', { name: '¿En qué sucursal trabajas hoy?' });
  return within(lista)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '');
}

describe('paso de sucursal', () => {
  test('la última usada primero (★), luego la principal, por nombre, y «Todas» al final', async () => {
    await pintar();
    expect(nombresEnOrden()).toEqual([
      'Entrar a Sede Norte',
      'Entrar a Sucursal Principal',
      'Entrar a Alameda',
      'Entrar a Todas las sucursales',
    ]);
    expect(screen.getByText('Última usada')).toBeTruthy();
    expect(screen.getByText(/Caja #7 abierta/)).toBeTruthy();
    expect(screen.getByText(/abre 8:00/)).toBeTruthy();
    expect(screen.getAllByText('Cajero').length).toBe(4);
    expect(screen.getByText('Org de prueba · tienes acceso a 3 sucursales. La cambias cuando quieras desde la barra superior.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cambiar de organización' }).getAttribute('href')).toBe(
      `/auth/select-organization?dest=${encodeURIComponent('/app/pos')}`,
    );
    // Con 3 sucursales no hay buscador (aparece con más de 6).
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  test('la tecla 3 valida en el servidor y solo entonces guarda y entra', async () => {
    await pintar();
    await act(async () => {
      fireEvent.keyDown(window, { key: '3' });
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app/pos'));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ sucursal: 12 });
    expect(guardarSucursalActiva).toHaveBeenCalledWith(12);
  });

  test('↑ desde la primera da la vuelta a «Todas», Enter la elige y se guarda como all', async () => {
    await pintar();
    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Enter' });
    });
    await waitFor(() => expect(guardarSucursalActiva).toHaveBeenCalledWith('all'));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ sucursal: 'todas' });
  });

  test('si el servidor la rechaza (403) no se guarda y se avisa', async () => {
    fetchMock.mockImplementation((_url: string, init?: { method?: string }) =>
      init?.method === 'POST' ? respuesta(403, { code: 'BRANCH_FORBIDDEN' }) : respuesta(200, RESPUESTA),
    );
    await pintar();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar a Alameda' }));
    expect(await screen.findByText('Ya no tienes acceso a esa sucursal. Elige otra.')).toBeTruthy();
    expect(guardarSucursalActiva).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test('con una sola sucursal se entra directo, como antes', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { ...RESPUESTA, verTodas: false, sucursales: [RESPUESTA.sucursales[0]] }));
    renderConIdioma(<SeleccionSucursalPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app/pos'));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  test('sin «Todas» si el servidor no lo permite, y en inglés', async () => {
    fetchMock.mockImplementation(() => respuesta(200, { ...RESPUESTA, verTodas: false, organizaciones: 1 }));
    renderConIdioma(<SeleccionSucursalPage />, { idioma: 'en' });
    await screen.findByRole('heading', { name: 'Which branch are you working at today?' });
    expect(screen.queryByText('All branches')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Switch organization' })).toBeNull();
    expect(screen.getByText('Last used')).toBeTruthy();
  });
});
