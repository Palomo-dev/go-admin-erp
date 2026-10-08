/**
 * @jest-environment jsdom
 */
/**
 * Página Configuración unificada: menú con los módulos que el servidor deja
 * ver, buscador, deep link con resaltado, solo lectura y el aviso «se movió
 * aquí» una sola vez. Los paneles se sustituyen por un marcador (los prueban
 * sus propias pruebas); aquí importa el armazón.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { ConfiguracionLayout } from '../layout/ConfiguracionLayout';
import { CLAVE_AVISO_MOVIDO } from '../layout/AvisoMovido';
import { DURACION_RESALTADO_MS } from '../hooks/useResaltarAncla';
import type { PermisoSeccion } from '../config/permisosSecciones';

let query = '';
const replace = jest.fn((url: string) => {
  query = url.split('?')[1] ?? '';
});
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/app/configuracion',
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock('@/lib/utils/desktop', () => ({ ...jest.requireActual('@/lib/utils/desktop'), isDesktop: () => false }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
// Cada panel perezoso pinta un marcador con un ajuste #desinteres, como la sección real.
jest.mock('next/dynamic', () => () =>
  function Panel() {
    return (
      <div>
        <p>panel cargado</p>
        <label>
          campo del panel
          <input />
        </label>
        <div id="desinteres">tarjeta del desinterés</div>
      </div>
    );
  },
);

const TODO: PermisoSeccion[] = [
  { id: 'general.general', puedeEditar: true, ajustes: {} },
  { id: 'crm.general', puedeEditar: true, ajustes: {} },
  { id: 'crm.agente-voz', puedeEditar: true, ajustes: { desinteres: true } },
  { id: 'crm.telefonia', puedeEditar: true, ajustes: {} },
  { id: 'roles.general', puedeEditar: false, ajustes: {} },
];

function servidor(secciones: PermisoSeccion[] = TODO) {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ secciones }), json: async () => ({ secciones }) })) as unknown as typeof fetch;
}

let bajar: jest.Mock;
beforeEach(() => {
  replace.mockClear();
  window.localStorage.clear();
  bajar = jest.fn();
  HTMLElement.prototype.scrollIntoView = bajar;
});

test('el menú solo muestra los módulos que el servidor deja ver (sin módulos fuera del plan)', async () => {
  query = 'modulo=crm';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  const menu = await screen.findByRole('navigation', { name: 'Módulos y secciones de configuración' });
  expect(within(menu).getByRole('button', { name: /CRM/ })).toBeTruthy();
  expect(within(menu).queryByRole('button', { name: /Chat/ })).toBeNull();
  expect(within(menu).queryByRole('button', { name: /Facturación/ })).toBeNull();
  // Las secciones del módulo abierto, con la actual marcada.
  expect(within(menu).getByRole('button', { name: 'General', current: 'page' })).toBeTruthy();
  expect(within(menu).getByRole('button', { name: 'Agente de voz' })).toBeTruthy();
});

test('deep link con ancla: abre la sección, baja al ajuste y lo resalta 2 s', async () => {
  jest.useFakeTimers();
  query = 'modulo=crm&seccion=agente-voz';
  window.location.hash = '#desinteres';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(50);
  });
  expect(screen.getByRole('heading', { level: 1, name: 'Agente de voz' })).toBeTruthy();
  const ajuste = document.getElementById('desinteres')!;
  await act(async () => {
    await jest.advanceTimersByTimeAsync(200);
  });
  expect(bajar).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  expect(ajuste.getAttribute('data-resaltado')).toBe('true');
  expect(document.activeElement).toBe(ajuste);
  await act(async () => {
    await jest.advanceTimersByTimeAsync(DURACION_RESALTADO_MS);
  });
  expect(ajuste.hasAttribute('data-resaltado')).toBe(false);
  window.location.hash = '';
  jest.useRealTimers();
});

test('el ajuste también llega en ?ajuste= (redirecciones del servidor)', async () => {
  query = 'modulo=crm&seccion=agente-voz&ajuste=desinteres';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  await screen.findByText('tarjeta del desinterés');
  await waitFor(() => expect(document.getElementById('desinteres')!.getAttribute('data-resaltado')).toBe('true'));
});

test('sin permiso de edición: aviso de solo lectura y controles deshabilitados', async () => {
  query = 'modulo=roles';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  expect(await screen.findByText('Solo lectura')).toBeTruthy();
  expect((screen.getByRole('textbox', { name: 'campo del panel' }) as HTMLInputElement).matches(':disabled')).toBe(true);
});

test('con permiso: sin aviso y controles habilitados', async () => {
  query = 'modulo=crm&seccion=telefonia';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  await screen.findByText('panel cargado');
  expect(screen.queryByText('Solo lectura')).toBeNull();
  expect((screen.getByRole('textbox', { name: 'campo del panel' }) as HTMLInputElement).matches(':disabled')).toBe(false);
});

test('una sección pedida por URL de un módulo fuera del plan no se pinta', async () => {
  query = 'modulo=chat&seccion=ia';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  await screen.findByRole('navigation', { name: 'Módulos y secciones de configuración' });
  expect(screen.queryByRole('heading', { level: 1, name: 'IA del chat' })).toBeNull();
  expect(screen.queryByText('panel cargado')).toBeNull();
});

test('el buscador encuentra por palabra clave y con tildes, y lleva al deep link', async () => {
  query = 'modulo=crm';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  const campo = (await screen.findAllByRole('searchbox'))[0];
  fireEvent.change(campo, { target: { value: 'interes' } });
  const lista = await screen.findByRole('list', { name: 'Resultados de la búsqueda de ajustes' });
  const enlace = within(lista).getByRole('link', { name: /Cuando el cliente no tiene interés/ });
  expect(enlace.getAttribute('href')).toBe('/app/configuracion?modulo=crm&seccion=agente-voz#desinteres');
  expect(within(enlace).getByText('CRM › Agente de voz')).toBeTruthy();
  fireEvent.change(campo, { target: { value: 'congelar membresía' } });
  expect(await screen.findByText('Ningún ajuste coincide con «congelar membresía»')).toBeTruthy();
});

test('aviso «se movió aquí»: una sola vez por origen y quita ?movido= de la URL', async () => {
  query = 'modulo=crm&seccion=agente-voz&movido=crmAgentesAjustes';
  servidor();
  const { unmount } = renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  expect(await screen.findByText('Esta configuración se movió aquí')).toBeTruthy();
  expect(screen.getByText(/Antes estaba en CRM › Agentes IA › Ajustes/)).toBeTruthy();
  expect(window.localStorage.getItem(CLAVE_AVISO_MOVIDO + 'crmAgentesAjustes')).toBe('1');
  expect(replace).toHaveBeenCalledWith('/app/configuracion?modulo=crm&seccion=agente-voz', { scroll: false });
  unmount();
  query = 'modulo=crm&seccion=agente-voz&movido=crmAgentesAjustes';
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  await screen.findByRole('heading', { level: 1, name: 'Agente de voz' });
  expect(screen.queryByText('Esta configuración se movió aquí')).toBeNull();
});

test('el aviso sale aunque localStorage falle (ventana privada)', async () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('bloqueado');
  });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('bloqueado');
  });
  query = 'modulo=chat&seccion=ia&movido=chatIaConfiguracion';
  servidor([...TODO, { id: 'chat.ia', puedeEditar: true, ajustes: {} }]);
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  expect(await screen.findByText('Esta configuración se movió aquí')).toBeTruthy();
  get.mockRestore();
  set.mockRestore();
});

test('origen desconocido en ?movido=: sin aviso', async () => {
  query = 'modulo=crm&movido=inventado';
  servidor();
  renderConIdioma(<ConfiguracionLayout />, { idioma: 'es' });
  await screen.findByText('panel cargado');
  expect(screen.queryByText('Esta configuración se movió aquí')).toBeNull();
});
