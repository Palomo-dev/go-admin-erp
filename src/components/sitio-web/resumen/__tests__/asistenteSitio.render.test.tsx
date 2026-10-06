/**
 * @jest-environment jsdom
 *
 * Asistente de creación del sitio (Figma A/03a-03f): marco a pantalla
 * completa con «Paso N de 6», «Guardar y salir», estados sin permiso y error,
 * y el guardado del avance en cada paso. Organización ficticia.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
const push = jest.fn();
const replace = jest.fn();
let paso = '1';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/app/sitio-web/primera-configuracion',
  useSearchParams: () => new URLSearchParams(`paso=${paso}`),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120 }));
jest.mock('@/lib/website/v2/clienteSitiosV2', () => ({ clienteSitiosV2: { vistaPrevia: jest.fn(async () => ({ token: 't' })) } }));
jest.mock('next/dynamic', () => () => () => null);

const guardar = jest.fn(async () => true);
let ob: Record<string, unknown>;
jest.mock('../asistente/useOnboardingSitio', () => ({ useOnboardingSitio: () => ob }));
jest.mock('../../useSitioV2', () => ({
  useSitioV2: () => ({
    sitio: { id: 's-1' },
    borrador: { version: 1 },
    documento: null,
    cargando: false,
    guardando: false,
    publicando: false,
    conflicto: false,
    error: null,
    guardar: jest.fn(async () => true),
    publicar: jest.fn(),
    recargar: jest.fn(),
  }),
}));

import { AsistenteSitio } from '../asistente/AsistenteSitio';

const contexto = {
  organizacion: { nombre: 'Mi empresa S.A.S.', logoUrl: null, giro: 'restaurante', subdominio: 'tu-marca' },
  sede: { nombre: 'Sede Centro', direccion: 'Calle 00 # 00-00, Bogotá', telefono: null, horario: null },
  whatsapp: null,
  direccion: { host: 'tu-marca.goadmin.io', url: 'https://tu-marca.goadmin.io', subdominioHost: null, hostEsPropio: false },
  pasarela: false,
  permisos: { editar: true, publicar: true },
};

beforeEach(() => {
  paso = '1';
  push.mockReset();
  replace.mockReset();
  guardar.mockClear();
  ob = { onboarding: {}, contexto, cargando: false, fallo: null, guardando: false, errorGuardar: null, guardar, recargar: jest.fn() };
});

describe('AsistenteSitio', () => {
  test('paso 1 (A/03a): giro preseleccionado desde la organización y «Siguiente» guarda el avance', async () => {
    renderConIdioma(<AsistenteSitio />);
    expect(screen.getByText('¿Qué tipo de negocio es?')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Restaurante/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByText('Guardar y salir').length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    });
    expect(guardar).toHaveBeenCalledWith({ giro: 'restaurante', objetivos: ['reservas', 'carta', 'pedidos', 'buscadores'], pasoActual: 2 });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/app/sitio-web/primera-configuracion?paso=2'));
  });

  test('«Guardar y salir» guarda el paso y vuelve al Resumen', async () => {
    renderConIdioma(<AsistenteSitio />);
    await act(async () => {
      fireEvent.click(screen.getAllByText('Guardar y salir')[0]);
    });
    expect(guardar).toHaveBeenCalledWith({ pasoActual: 1 });
    expect(push).toHaveBeenCalledWith('/app/sitio-web');
  });

  test('paso 2 sin plantilla elegida: «Siguiente» deshabilitado', () => {
    paso = '2';
    renderConIdioma(<AsistenteSitio />);
    expect(screen.getByText('Elige una plantilla')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Siguiente' }) as HTMLButtonElement).disabled).toBe(true);
  });

  test('paso 6 (A/03f): resumen, aviso sin pasarela y «Publicar sitio»', () => {
    paso = '6';
    renderConIdioma(<AsistenteSitio />);
    expect(screen.getByText('Todo listo para publicar')).toBeTruthy();
    expect(screen.getByText('Aún no cobras en línea')).toBeTruthy();
    expect(screen.getByText('Al recibir (sin pasarela conectada)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar sitio' })).toBeTruthy();
  });

  test('sin permiso de edición: vacío «forbidden» con «Volver al resumen»', () => {
    ob = { ...ob, fallo: 'sin_permiso' };
    renderConIdioma(<AsistenteSitio />);
    expect(screen.getByText('No puedes configurar el sitio web')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver al resumen' }).getAttribute('href')).toBe('/app/sitio-web');
  });

  test('error al cargar: «Reintentar»', () => {
    const recargar = jest.fn();
    ob = { ...ob, fallo: 'error', recargar };
    renderConIdioma(<AsistenteSitio />);
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(recargar).toHaveBeenCalled();
  });
});
