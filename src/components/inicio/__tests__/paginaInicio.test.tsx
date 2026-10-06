/**
 * @jest-environment jsdom
 */
/**
 * Página de inicio completa (Figma 445:137182): orden del escritorio listo,
 * estado vacío de organización nueva, error de la fila, sin sucursal y móvil.
 * Todas las cifras llegan por `GET /api/inicio/*` con la organización de la
 * sesión en la cabecera: la página ya no consulta Supabase desde el navegador
 * (ni los 41 pedidos de la grilla vieja de KPIs, ni el intervalo de 30 s).
 *
 * Hooks de sesión, sucursal y permisos simulados; organización ficticia 120.
 */
const mockSupabaseFrom = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (...a: unknown[]) => mockSupabaseFrom(...a),
    auth: { getUser: async () => ({ data: { user: { id: 'u-1', user_metadata: { first_name: 'Ana' } } } }) },
  },
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120, name: 'Empresa de prueba S.A.S.' } }),
}));
let mockSucursales: Array<{ id: number; name: string }> = [{ id: 7, name: 'Sucursal Principal' }];
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ branchFilter: 7, isLoading: false, branches: mockSucursales, canSelectAll: true }),
}));
let mockRol = 2;
jest.mock('@/hooks/usePermissionContext', () => ({
  usePermissionContext: () => ({ context: { roleId: mockRol, isSuperAdmin: false }, resolvedOrganizationId: 120 }),
}));
jest.mock('@/lib/offline/useDesktopCatalog', () => ({ useDesktopCatalog: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    timezone: 'America/Bogota',
    formatTime: () => '8:05 a. m.',
    getToday: () => '2026-09-30',
    toDate: () => '2026-09-30',
  }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ code: 'COP' }) }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@/components/inicio/LiveVisitorsBadge', () => ({ LiveVisitorsBadge: () => null }));
jest.mock('@/components/inicio/TarjetaDatosEmpresa', () => ({ TarjetaDatosEmpresa: () => null }));
jest.mock('@/components/inicio/EmployeeDashboard', () => ({ EmployeeDashboard: () => <div data-panel="empleado" /> }));
jest.mock('@/components/kit/BranchBadge', () => ({ BranchBadge: () => null, BranchBadgeActiva: () => <span data-sucursal="activa" /> }));
jest.mock('@/components/modules/ModuleAccessDenied', () => () => null);

import { fireEvent, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import InicioPage from '@/app/app/inicio/page';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];

const PASOS_CON_DATOS = { pasos: [{ id: 'productos', hecho: true, href: null }], hechos: 1, hayMovimientos: true, hrefProductos: null, hrefPos: null };
const PASOS_NUEVA = {
  pasos: [
    { id: 'modulos', hecho: true, href: null },
    { id: 'organizacion', hecho: true, href: null },
    { id: 'sucursal', hecho: true, href: null },
    { id: 'equipo', hecho: false, href: '/app/organizacion/invitaciones' },
    { id: 'productos', hecho: false, href: '/app/inventario/productos' },
    { id: 'impuestos', hecho: false, href: null },
    { id: 'clientes', hecho: false, href: null },
  ],
  hechos: 3,
  hayMovimientos: false,
  hrefProductos: '/app/inventario/productos',
  hrefPos: '/app/pos',
};

let respuestas: Record<string, { status: number; json: unknown }> = {};
let pedidos: Array<{ url: string; org: string | null }> = [];

function base(): Record<string, { status: number; json: unknown }> {
  return {
    '/api/inicio/preferencias': { status: 200, json: { bloquesOcultos: [], modulosOrden: [], modulosOcultos: [] } },
    '/api/inicio/turno': { status: 200, json: { visible: false } },
    '/api/inicio/primeros-pasos': { status: 200, json: PASOS_CON_DATOS },
    '/api/inicio/hoy': {
      status: 200,
      json: { porCobrar: null, stock: null, pedidosWeb: { pendientes: 12, porExpirar: 3, minutos: 30 }, cajasAnteriores: null, tareas: null, unaSucursal: true, generadoEn: '2026-09-30T13:05:00Z' },
    },
    '/api/inicio/ventas': {
      status: 200,
      json: {
        moneda_base: 'COP', monedas: ['COP'], unaSucursal: true, sucursales: {}, hrefVentas: null,
        actual: { neto: 42180900, ventas_cobradas: 10, ticket_promedio: 4218090, por_canal: { pos: 1 }, granularidad: 'hora', serie: [{ b: '2026-09-30T08', v: 1 }] },
        anterior: { neto: 37527491, granularidad: 'hora', serie: [] },
      },
    },
    '/api/inicio/actividad': { status: 200, json: { tipos: ['venta'], conteos: { venta: 0 }, total: 0, filas: [] } },
    '/api/inicio/tienda-web': {
      status: 200,
      json: { activa: true, actual: { visitantes: 10, sesiones: 8, sesiones_nuevas: 4, pedidos: 1, pedidos_pagados: 1 }, anterior: { visitantes: 9, sesiones: 8, pedidos: 1, pedidos_pagados: 1 }, pendientes: 0, serie: [], hrefPedidos: null, hrefAnalitica: '/app/sitio-web/analitica' },
    },
    '/api/inicio/modulos': { status: 200, json: { modulos: [], badgeSolido: null, moneda: 'COP', zona: 'America/Bogota', calculadoEn: '2026-09-30T13:05:00Z' } },
  };
}

beforeEach(() => {
  simularAncho(1440);
  mockSucursales = [{ id: 7, name: 'Sucursal Principal' }];
  mockRol = 2;
  mockSupabaseFrom.mockReset();
  pedidos = [];
  respuestas = base();
  try {
    localStorage.clear();
  } catch {
    // sin almacenamiento
  }
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({ url, org: (init?.headers as Record<string, string> | undefined)?.['X-Organization-Id'] ?? null });
    const clave = Object.keys(respuestas).find((k) => url.startsWith(k));
    const r = clave ? respuestas[clave] : { status: 404, json: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.json } as Response;
  });
});

const rutas = () => pedidos.map((p) => p.url.split('?')[0]);
const titulos = (c: HTMLElement) => Array.from(c.querySelectorAll('h2')).map((h) => h.textContent?.trim());

test('escritorio listo: el orden del Figma y solo lecturas /api/inicio/* con la organización de la sesión', async () => {
  const { container } = renderConIdioma(<InicioPage />);
  await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
  await waitFor(() => expect(titulos(container)).toContain('Tienda web'));
  // Cabecera → Hoy → Ventas | Actividad → Tienda web → Módulos.
  expect(titulos(container)).toEqual(['Hoy', 'Ventas del periodo', 'Actividad reciente', 'Tienda web', 'Módulos']);
  // «Hoy» dice cuántos pedidos web expiran pronto (Figma: «3 expiran en menos de 30 min»).
  expect(container.textContent).toContain('3 expiran en menos de 30 min');
  // Cabecera: Actualizar (solo icono), Personalizar y «⋯»; selector con siete opciones.
  expect(container.querySelector('button[aria-label="Actualizar"]')).not.toBeNull();
  expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent === 'Personalizar')).toBe(true);
  expect(container.querySelectorAll('[role="radiogroup"] [role="radio"]')).toHaveLength(7);
  expect(container.textContent).toContain('Empresa de prueba S.A.S.');
  // Ninguna consulta directa a Supabase desde la página; todas con la organización.
  expect(mockSupabaseFrom).not.toHaveBeenCalled();
  expect(pedidos.every((p) => p.url.startsWith('/api/inicio/') && p.org === '120')).toBe(true);
  expect(new Set(rutas())).toEqual(
    new Set([
      '/api/inicio/preferencias', '/api/inicio/turno', '/api/inicio/primeros-pasos', '/api/inicio/hoy', '/api/inicio/ventas',
      '/api/inicio/actividad', '/api/inicio/tienda-web', '/api/inicio/modulos',
    ]),
  );
  // Ni atajos ni grilla vieja de KPIs ni el panel suelto de observabilidad.
  expect(container.textContent).not.toMatch(/Accesos rápidos|Observabilidad|Stock reservado/);
});

test('«Actualizar»: vuelve a pedir cada bloque; ventas sin pasar por el esqueleto', async () => {
  const { container } = renderConIdioma(<InicioPage />);
  await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
  const antes = pedidos.length;
  fireEvent.click(container.querySelector('button[aria-label="Actualizar"]') as HTMLElement);
  // La cifra sigue a la vista mientras se relee (recarga silenciosa).
  expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull();
  await waitFor(() => {
    const nuevas = rutas().slice(antes);
    for (const r of ['/api/inicio/hoy', '/api/inicio/ventas', '/api/inicio/actividad', '/api/inicio/tienda-web', '/api/inicio/modulos', '/api/inicio/primeros-pasos']) {
      expect(nuevas).toContain(r);
    }
  });
});

test('organización nueva: «Primeros pasos» en lugar de «Hoy» y «Todavía no hay movimientos» en lugar de ventas y actividad', async () => {
  respuestas['/api/inicio/primeros-pasos'] = { status: 200, json: PASOS_NUEVA };
  const { container } = renderConIdioma(<InicioPage />);
  await waitFor(() => expect(container.textContent).toContain('Primeros pasos'));
  await waitFor(() => expect(container.textContent).toContain('Todavía no hay movimientos'));
  expect(container.textContent).toContain('3 de 7 · 43 %');
  expect(titulos(container)).not.toContain('Hoy');
  expect(rutas()).not.toContain('/api/inicio/ventas');
  expect(rutas()).not.toContain('/api/inicio/actividad');
});

test('error: si fallan ventas y actividad, un solo estado de error para la fila (445:137833)', async () => {
  respuestas['/api/inicio/ventas'] = { status: 500, json: {} };
  respuestas['/api/inicio/actividad'] = { status: 500, json: {} };
  const { container } = renderConIdioma(<InicioPage />);
  await waitFor(() => expect(container.textContent).toContain('No se pudieron cargar los datos del inicio'));
  expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(1);
});

test('sin sucursal asignada: se explica y no se consulta el panel (445:138049)', async () => {
  mockSucursales = [];
  const { container } = renderConIdioma(<InicioPage />);
  await waitFor(() => expect(container.querySelector('[role="status"]')).not.toBeNull());
  expect(rutas()).not.toContain('/api/inicio/hoy');
  expect(rutas()).not.toContain('/api/inicio/ventas');
});

test('móvil: sin «Actividad reciente» (ni se consulta) y con el selector como lista', async () => {
  simularAncho(390);
  const { container } = renderConIdioma(<InicioPage />);
  await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
  expect(titulos(container)).not.toContain('Actividad reciente');
  expect(rutas()).not.toContain('/api/inicio/actividad');
  expect(container.querySelector('button[role="combobox"]')).not.toBeNull();
});

test('empleado: su panel, sin cifras del inicio', async () => {
  mockRol = 4;
  const { container } = renderConIdioma(<InicioPage />);
  await waitFor(() => expect(container.querySelector('[data-panel="empleado"]')).not.toBeNull());
  expect(rutas().filter((r) => r !== '/api/inicio/preferencias' && r !== '/api/inicio/turno')).toEqual([]);
});

test.each(IDIOMAS)('%s: sin claves crudas', async (idioma) => {
  const { container } = renderConIdioma(<InicioPage />, { idioma });
  await waitFor(() => expect(container.querySelector('[data-cifra="neto"]')).not.toBeNull());
  expect(container.textContent ?? '').not.toMatch(/\b(home|nav)\.[a-zA-Z]/);
});
