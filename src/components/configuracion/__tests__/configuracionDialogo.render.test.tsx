/**
 * @jest-environment jsdom
 */
/**
 * Diálogo de Configuración (Figma pág. 10, sección 12): se abre sobre la
 * pantalla actual con `?config=` (Ctrl+,, `abrirConfiguracion()` o un enlace
 * viejo), muestra solo lo que el servidor deja ver, busca con teclado, respeta
 * solo lectura, resalta el ajuste del deep link y confirma antes de perder
 * cambios sin guardar. Los paneles se sustituyen por un marcador.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { ConfiguracionDialogoRaiz } from '../dialogo/ConfiguracionDialogoRaiz';
import { abrirConfiguracion } from '../dialogo/abrirConfiguracion';
import { CLAVE_AVISO_MOVIDO } from '../layout/AvisoMovido';
import type { PermisoSeccion } from '../config/permisosSecciones';

// URL real de jsdom; los hooks de navegación la leen como lo hace Next 15 tras pushState/replaceState.
const mockOyentes = new Set<() => void>();
const mockPush = jest.fn();
jest.mock('next/navigation', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  const suscribir = (f: () => void) => {
    mockOyentes.add(f);
    return () => mockOyentes.delete(f);
  };
  return {
    useSearchParams: () => {
      const q = React.useSyncExternalStore(suscribir, () => window.location.search);
      return React.useMemo(() => new URLSearchParams(q), [q]);
    },
    usePathname: () => React.useSyncExternalStore(suscribir, () => window.location.pathname),
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  };
});
jest.mock('@/lib/utils/desktop', () => ({ ...jest.requireActual('@/lib/utils/desktop'), isDesktop: () => false }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
// Cada panel perezoso pinta un marcador con un campo, el ajuste #desinteres y
// cambios sin guardar registrados en el diálogo, como los paneles reales.
jest.mock('next/dynamic', () => () =>
  function Panel() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react') as typeof import('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useRegistrarCambios } = require('../dialogo/cambiosSinGuardar') as typeof import('../dialogo/cambiosSinGuardar');
    const [valor, setValor] = React.useState('');
    useRegistrarCambios({ cambios: valor ? 2 : 0, guardar: () => mockGuardar(valor), descartar: () => setValor('') });
    return (
      <div>
        <p>panel cargado</p>
        <label>
          campo del panel
          <input value={valor} onChange={(e) => setValor(e.target.value)} />
        </label>
        <div id="desinteres">tarjeta del desinterés</div>
      </div>
    );
  },
);
const mockGuardar = jest.fn();

const TODO: PermisoSeccion[] = [
  { id: 'general.general', puedeEditar: true, ajustes: {} },
  { id: 'general.plan', puedeEditar: true, ajustes: {} },
  { id: 'crm.general', puedeEditar: true, ajustes: {} },
  { id: 'crm.agente-voz', puedeEditar: true, ajustes: { desinteres: true } },
  { id: 'crm.telefonia', puedeEditar: true, ajustes: {} },
  { id: 'chat.general', puedeEditar: true, ajustes: {} },
  { id: 'chat.ia', puedeEditar: true, ajustes: {} },
  { id: 'roles.general', puedeEditar: false, ajustes: {} },
];

function servidor(secciones: PermisoSeccion[] = TODO) {
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ secciones }), json: async () => ({ secciones }) })) as unknown as typeof fetch;
}

const avisar = () => mockOyentes.forEach((f) => f());
const pushOriginal = window.history.pushState.bind(window.history);
const replaceOriginal = window.history.replaceState.bind(window.history);
beforeAll(() => {
  window.history.pushState = (d, u, url) => {
    pushOriginal(d, u, url);
    avisar();
  };
  window.history.replaceState = (d, u, url) => {
    replaceOriginal(d, u, url);
    avisar();
  };
  window.addEventListener('popstate', avisar);
});

function ir(url: string) {
  act(() => {
    replaceOriginal(null, '', url);
    avisar();
  });
}
const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  mockPush.mockClear();
  mockGuardar.mockClear();
  window.localStorage.clear();
  simularAncho(1440);
  HTMLElement.prototype.scrollIntoView = jest.fn();
  ir('/app/pos/ventas?estado=pagada');
  servidor();
});

test('cerrado no pinta nada; `abrirConfiguracion()` lo abre sobre la pantalla actual y Esc lo cierra', async () => {
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() => abrirConfiguracion({ seccionId: 'chat.ia' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Configuración' });
  expect(window.location.pathname).toBe('/app/pos/ventas');
  expect(params().get('estado')).toBe('pagada');
  expect(params().get('config')).toBe('chat.ia');
  // Migas «Grupo › Entrada», título y sub-pestañas de la entrada.
  expect(await within(dialogo).findByRole('heading', { level: 2, name: 'Chat' })).toBeTruthy();
  const migas = within(dialogo).getByRole('navigation', { name: /migas|breadcrumb|ruta/i });
  expect(within(migas).getByText('Clientes y comunicación')).toBeTruthy();
  const pestanas = within(dialogo).getByRole('radiogroup', { name: 'Partes de Chat' });
  expect(within(pestanas).getByRole('radio', { name: 'IA', checked: true })).toBeTruthy();
  fireEvent.click(within(pestanas).getByRole('radio', { name: 'General' }));
  expect(params().get('config')).toBe('chat.general');

  fireEvent.keyDown(dialogo, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(window.location.search).toBe('?estado=pagada');
});

test('Ctrl+, abre el menú; el menú solo trae lo que el servidor deja ver, agrupado', async () => {
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  fireEvent.keyDown(window, { key: ',', ctrlKey: true });
  const menu = await screen.findByRole('navigation', { name: 'Secciones de configuración' });
  expect(within(menu).getByRole('list', { name: 'Organización' })).toBeTruthy();
  expect(within(menu).getByRole('list', { name: 'Clientes y comunicación' })).toBeTruthy();
  expect(within(menu).queryByRole('list', { name: 'Ventas' })).toBeNull();
  expect(within(menu).getByRole('button', { name: 'Telefonía y voz' })).toBeTruthy();
  expect(within(menu).getByRole('button', { name: 'Plan y facturación' })).toBeTruthy();
  expect(within(menu).queryByRole('button', { name: 'Punto de venta' })).toBeNull();
  // En escritorio, sin sección, se muestra la primera.
  expect(within(menu).getByRole('button', { name: 'General', current: 'page' })).toBeTruthy();
  // Flechas recorren el menú.
  const general = within(menu).getByRole('button', { name: 'General' });
  general.focus();
  fireEvent.keyDown(general, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(within(menu).getByRole('button', { name: 'Equipo y roles' }));
});

test('un enlace viejo a /app/configuracion se abre como diálogo sobre la pantalla actual', async () => {
  renderConIdioma(
    <>
      <a href="/app/configuracion?modulo=crm&seccion=agente-voz#desinteres">ir</a>
      <ConfiguracionDialogoRaiz />
    </>,
    { idioma: 'es' },
  );
  fireEvent.click(screen.getByRole('link', { name: 'ir' }));
  expect(window.location.pathname).toBe('/app/pos/ventas');
  expect(params().get('config')).toBe('crm.agente-voz');
  expect(params().get('config_ajuste')).toBe('desinteres');
  await screen.findByText('tarjeta del desinterés');
  await waitFor(() => expect(document.getElementById('desinteres')!.getAttribute('data-resaltado')).toBe('true'));
});

test('el buscador: Enter abre el primer resultado y lleva al ajuste', async () => {
  ir('/app/inicio?config=general.general');
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  const campo = await screen.findByRole('combobox', { name: 'Buscar un ajuste' });
  await screen.findByText('panel cargado');
  fireEvent.change(campo, { target: { value: 'interes' } });
  const lista = await screen.findByRole('listbox', { name: 'Resultados de la búsqueda de ajustes' });
  const primera = within(lista).getAllByRole('option')[0];
  expect(primera.getAttribute('aria-selected')).toBe('true');
  expect(within(primera).getByText('Telefonía y voz › Agente de voz')).toBeTruthy();
  expect(campo.getAttribute('aria-activedescendant')).toBe(primera.id);
  fireEvent.keyDown(campo, { key: 'Enter' });
  expect(params().get('config')).toBe('crm.agente-voz');
  expect(params().get('config_ajuste')).toBe('desinteres');
  // Esc en el buscador limpia antes de cerrar.
  fireEvent.change(campo, { target: { value: 'congelar membresía' } });
  expect(await screen.findByText('Ningún ajuste coincide con «congelar membresía»')).toBeTruthy();
  fireEvent.keyDown(campo, { key: 'Escape' });
  expect((campo as HTMLInputElement).value).toBe('');
  expect(screen.getByRole('dialog')).toBeTruthy();
});

test('sin permiso de edición: aviso de solo lectura y controles deshabilitados', async () => {
  ir('/app/inicio?config=roles.general');
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  expect(await screen.findByText('Solo lectura')).toBeTruthy();
  expect((screen.getByRole('textbox', { name: 'campo del panel' }) as HTMLInputElement).matches(':disabled')).toBe(true);
});

test('una sección de un módulo fuera del plan no se pinta', async () => {
  servidor(TODO.filter((s) => !s.id.startsWith('chat.')));
  ir('/app/inicio?config=chat.ia');
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  await screen.findByRole('navigation', { name: 'Secciones de configuración' });
  expect(screen.queryByRole('heading', { level: 2, name: 'Chat' })).toBeNull();
});

test('sección enlace: fila con «Abrir» que navega y cierra el diálogo', async () => {
  ir('/app/inicio?config=general.plan');
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  fireEvent.click(await screen.findByRole('link', { name: /Abrir/ }));
  expect(mockPush).toHaveBeenCalledWith('/app/plan');
  expect(params().has('config')).toBe(false);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('cambios sin guardar: barra con contador, Guardar y confirmación al cerrar', async () => {
  ir('/app/inicio?config=crm.telefonia');
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  const campo = await screen.findByRole('textbox', { name: 'campo del panel' });
  fireEvent.change(campo, { target: { value: 'nuevo' } });
  const barra = await screen.findByRole('region', { name: 'Cambios sin guardar' });
  expect(within(barra).getAllByText('2 cambios sin guardar').length).toBeGreaterThan(0);
  fireEvent.click(within(barra).getByRole('button', { name: 'Guardar cambios' }));
  expect(mockGuardar).toHaveBeenCalledWith('nuevo');

  fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar configuración (Esc)' })[0]);
  const confirmar = await screen.findByRole('dialog', { name: '¿Descartar los cambios sin guardar?' });
  fireEvent.click(within(confirmar).getByRole('button', { name: 'Seguir editando' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '¿Descartar los cambios sin guardar?' })).toBeNull());
  expect(params().get('config')).toBe('crm.telefonia');

  fireEvent.click(screen.getAllByRole('button', { name: 'Cerrar configuración (Esc)' })[0]);
  fireEvent.click(within(await screen.findByRole('dialog', { name: '¿Descartar los cambios sin guardar?' })).getByRole('button', { name: 'Descartar cambios' }));
  await waitFor(() => expect(params().has('config')).toBe(false));
});

test('aviso «se movió aquí»: una sola vez por origen y se quita de la URL', async () => {
  ir('/app/inicio?config=crm.agente-voz&config_movido=crmAgentesAjustes');
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  expect(await screen.findByText('Esta configuración se movió aquí')).toBeTruthy();
  expect(window.localStorage.getItem(CLAVE_AVISO_MOVIDO + 'crmAgentesAjustes')).toBe('1');
  await waitFor(() => expect(params().has('config_movido')).toBe(false));
  expect(params().get('config')).toBe('crm.agente-voz');
});

test('celular: primero el menú; al elegir, el detalle con «←»', async () => {
  simularAncho(390);
  ir('/app/inicio?config=');
  renderConIdioma(<ConfiguracionDialogoRaiz />, { idioma: 'es' });
  const menu = await screen.findByRole('navigation', { name: 'Secciones de configuración' });
  expect(screen.queryByText('panel cargado')).toBeNull();
  fireEvent.click(within(menu).getByRole('button', { name: 'Chat' }));
  expect(params().get('config')).toBe('chat.general');
  await screen.findByText('panel cargado');
  fireEvent.click(screen.getByRole('button', { name: 'Volver al menú de configuración' }));
  expect(params().get('config')).toBe('');
});
