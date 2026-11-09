/**
 * @jest-environment jsdom
 */
/**
 * Pantalla «Módulo no habilitado» (Figma `2416:62653`, capturas
 * docs/design/figma/90-modulo-no-habilitado-*.png): qué acción ve cada rol en
 * cada causa, en los cuatro idiomas, y que el aviso vaya al servidor con la
 * ruta (nunca con la organización).
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import type { AccesoModuloResuelto } from '@/lib/organizacion/accesoModulo';

let ruta = '/app/crm/leads';
const refresh = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: () => ruta, useRouter: () => ({ push: jest.fn(), refresh }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { ModuloNoHabilitado, rutaPedida } from '../ModuloNoHabilitado';

const BASE: AccesoModuloResuelto = {
  causa: 'apagado',
  modulo: 'crm',
  pagina: '/app/crm/leads',
  puedeResolver: true,
  puedeAvisar: false,
  yaAvisado: false,
  organizacion: 'Org de prueba',
  plan: { nombre: 'Pro', cupo: 7, usados: 4 },
  planesConCupo: [],
  opcionalesEncendidos: [],
  paginas: ['/app/crm/leads', '/app/crm/oportunidades', '/app/crm/actividades', '/app/crm/llamadas', '/app/crm/campanas'],
  personas: [{ nombre: 'Ana Gómez', papel: 'dueno' }],
  persona: 'Laura Pérez',
  cargo: null,
};

let respuesta: AccesoModuloResuelto = BASE;
const llamadas: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  ruta = '/app/crm/leads';
  respuesta = { ...BASE };
  llamadas.length = 0;
  refresh.mockClear();
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    if (String(url).startsWith('/api/modules/acceso/avisar')) {
      return { ok: true, status: 200, json: async () => ({ resultado: { notificados: 2, repetida: false } }) } as Response;
    }
    if (String(url).startsWith('/api/modules/pages')) {
      return { ok: true, status: 200, json: async () => ({ success: true }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ acceso: respuesta }) } as Response;
  }) as typeof fetch;
});

const montar = async (idioma: IdiomaPrueba = 'es') => {
  renderConIdioma(<ModuloNoHabilitado rutaRespaldo={null} />, { idioma });
  await screen.findByRole('heading', { level: 2 });
};
const enlace = (nombre: RegExp) => screen.getByRole('link', { name: nombre }) as HTMLAnchorElement;

describe('rutaPedida', () => {
  it('usa la URL del navegador; en la ruta interna, la de la reescritura', () => {
    expect(rutaPedida('/app/pos', null)).toBe('/app/pos');
    expect(rutaPedida('/app/modulo-no-habilitado', '/app/crm')).toBe('/app/crm');
    expect(rutaPedida('/app/modulo-no-habilitado', 'https://x.com')).toBeNull();
  });
});

describe('matriz causa × rol', () => {
  it('A · administrador: «Encender» lleva a Módulos con la tarjeta resaltada (no enciende aquí)', async () => {
    await montar();
    expect(screen.getByRole('heading', { level: 2, name: 'CRM está apagado' })).toBeTruthy();
    expect(enlace(/Encender CRM/).getAttribute('href')).toBe('/app/organizacion/modulos?resaltar=crm');
    expect(enlace(/Volver al inicio/).getAttribute('href')).toBe('/app/inicio');
    expect(screen.getByText('Usa 1 cupo de tu plan')).toBeTruthy();
    expect(screen.getByText('Quedarías con 5 de 7 módulos opcionales. Tu precio no cambia.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Avisar/ })).toBeNull();
    // Solo se pidió el veredicto: nada se escribió.
    expect(llamadas.map((l) => l.url)).toEqual(['/api/modules/acceso?ruta=%2Fapp%2Fcrm%2Fleads']);
  });

  it('A · miembro: avisa con la ruta (sin organización) y el botón queda en «Ya avisaste»', async () => {
    respuesta = { ...BASE, puedeResolver: false, puedeAvisar: true, plan: null };
    await montar();
    expect(screen.getByText('Ana Gómez')).toBeTruthy();
    expect(screen.getByText('Dueño de la organización')).toBeTruthy();
    expect(screen.getByText('«Laura Pérez pide encender CRM», con botón a Módulos.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Avisar a los administradores/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Ya avisaste/ })).toBeTruthy());
    const aviso = llamadas.find((l) => l.url === '/api/modules/acceso/avisar')!;
    expect(JSON.parse(String(aviso.init?.body))).toEqual({ ruta: '/app/crm/leads' });
    expect((screen.getByRole('button', { name: /Ya avisaste/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('avisamos a 2 personas');
  });

  it('A · miembro que ya avisó hoy: el botón llega deshabilitado', async () => {
    respuesta = { ...BASE, puedeResolver: false, puedeAvisar: true, yaAvisado: true, plan: null };
    await montar();
    expect((screen.getByRole('button', { name: /Ya avisaste/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('B · administrador: «Ver planes» con el siguiente plan, a medida y apagar otro', async () => {
    respuesta = {
      ...BASE,
      causa: 'limite',
      plan: { nombre: 'Básico', cupo: 3, usados: 3 },
      planesConCupo: [
        { codigo: 'pro', nombre: 'Pro', cupo: 7 },
        { codigo: 'ultimate', nombre: 'Ultimate', cupo: null },
      ],
      opcionalesEncendidos: ['inventory', 'pos', 'finance'],
    };
    await montar();
    expect(screen.getByRole('heading', { level: 2, name: 'Tu plan Básico ya usa todos sus módulos' })).toBeTruthy();
    expect(enlace(/Ver planes/).getAttribute('href')).toBe('/app/organizacion/plan?plan=pro');
    expect(enlace(/Apagar otro módulo/).getAttribute('href')).toBe('/app/organizacion/modulos');
    expect(screen.getByText('Hasta 7 módulos opcionales: te quedarían 3 libres.')).toBeTruthy();
    expect(screen.getByText('Módulos opcionales encendidos (3 de 3)')).toBeTruthy();
  });

  it('B · miembro: sin precios ni nombres de plan', async () => {
    respuesta = { ...BASE, causa: 'limite', puedeResolver: false, puedeAvisar: true, plan: null };
    await montar();
    expect(screen.getByRole('heading', { level: 2, name: 'CRM no está en uso en tu organización' })).toBeTruthy();
    expect(screen.queryByText(/Plan /)).toBeNull();
    expect(screen.getByRole('button', { name: /Avisar a los administradores/ })).toBeTruthy();
  });

  it('C · administrador: «Mostrar página» va al servidor y recarga la ruta', async () => {
    ruta = '/app/pos/devoluciones';
    respuesta = { ...BASE, causa: 'paginaOculta', modulo: 'pos', pagina: '/app/pos/devoluciones', paginas: ['/app/pos', '/app/pos/ventas'], plan: null };
    await montar();
    expect(screen.getByRole('heading', { level: 2, name: 'Devoluciones está oculta' })).toBeTruthy();
    expect(enlace(/Ir a POS/).getAttribute('href')).toBe('/app/pos');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Mostrar página/ }));
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const cuerpo = JSON.parse(String(llamadas.find((l) => l.url === '/api/modules/pages')?.init?.body));
    expect(cuerpo).toEqual({ moduleCode: 'pos', pageHref: '/app/pos/devoluciones', pageName: 'Devoluciones', isActive: true });
    expect(cuerpo).not.toHaveProperty('organizationId');
  });

  it('C · miembro: «Ir al módulo» como principal y avisar como secundaria', async () => {
    ruta = '/app/pos/devoluciones';
    respuesta = { ...BASE, causa: 'paginaOculta', modulo: 'pos', pagina: '/app/pos/devoluciones', paginas: ['/app/pos/ventas'], puedeResolver: false, puedeAvisar: true, plan: null };
    await montar();
    expect(screen.getByRole('heading', { level: 2, name: 'Esta página no está disponible' })).toBeTruthy();
    expect(enlace(/Ir a Punto de venta/).getAttribute('href')).toBe('/app/pos/ventas');
    expect(screen.getByRole('button', { name: /Avisar a los administradores/ })).toBeTruthy();
  });

  it('D · cargo: «Pedir acceso», el cargo y lo que sí incluye', async () => {
    ruta = '/app/finanzas';
    respuesta = {
      ...BASE,
      causa: 'cargo',
      modulo: 'finance',
      pagina: null,
      puedeResolver: false,
      puedeAvisar: true,
      plan: null,
      paginas: [],
      cargo: { id: 'c-1', nombre: 'Cajero', modulos: ['pos'] },
    };
    await montar();
    expect(screen.getByRole('heading', { level: 2, name: 'Tu cargo no incluye Finanzas' })).toBeTruthy();
    expect(screen.getByText(/el cargo Cajero no tiene acceso/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pedir acceso/ })).toBeTruthy();
  });

  it('D · quien edita cargos: «Editar el cargo» en vez de pedir acceso', async () => {
    ruta = '/app/finanzas';
    respuesta = { ...BASE, causa: 'cargo', modulo: 'finance', pagina: null, plan: null, paginas: [], cargo: { id: 'c-1', nombre: 'Cajero', modulos: [] } };
    await montar();
    expect(enlace(/Editar el cargo/).getAttribute('href')).toBe('/app/hrm/cargos/c-1');
    expect(screen.queryByRole('button', { name: /Pedir acceso/ })).toBeNull();
  });
});

describe('idiomas y estados', () => {
  it.each([
    ['en', 'CRM is turned off', /Turn on CRM/],
    ['fr', 'CRM est désactivé', /Activer CRM/],
    ['pt', 'CRM está desligado', /Ligar CRM/],
  ] as const)('%s: nada cableado en español', async (idioma, titulo, boton) => {
    await montar(idioma);
    expect(screen.getByRole('heading', { level: 2, name: titulo })).toBeTruthy();
    expect(enlace(boton)).toBeTruthy();
  });

  it('error al comprobar: estado de error con «Reintentar»', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response) as typeof fetch;
    renderConIdioma(<ModuloNoHabilitado />);
    expect(await screen.findByText('No pudimos comprobar el acceso')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy();
  });

  it('si el servidor ya no lo bloquea, ofrece abrir la página', async () => {
    respuesta = { ...BASE, causa: null };
    renderConIdioma(<ModuloNoHabilitado />);
    expect(await screen.findByText('Ya puedes entrar')).toBeTruthy();
  });
});
