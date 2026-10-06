/**
 * @jest-environment jsdom
 *
 * «Nuevo producto» (ProductoForm, modo crear) monta y pinta el formulario:
 * en web, con el bridge de Go Admin Desktop, con catálogos vacíos y sin red.
 *
 * Regresión (reporte 2026-10-06, Go Admin Desktop 0.2.7): «Se ha producido
 * un error inesperado» al abrir Inventario › Nuevo producto. El instalador
 * 0.2.7 embebe la web del tag v0.2.7 (3c471b24), cortado 24 min antes de
 * 728c81d0, que añadió `addPlainDays` a `@/lib/utils/dateDisplay`.
 * `SeccionPrecios` ya la importaba: en ese bundle vale `undefined` y el
 * render lanza `addPlainDays is not a function` en cuanto cargan los
 * catálogos. El job de tsc de ese commit falló («has no exported member
 * 'addPlainDays'»), pero el release compila con NEXT_SKIP_TYPECHECK=1 y no
 * esperaba a ese job. Esta prueba, corrida sobre v0.2.7, falla en los tres
 * montajes con ese TypeError; sobre main pasa.
 */
import { screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

type Resultado = { data: unknown; error: unknown; count?: number | null };
let respuestas: Record<string, Resultado> = {};
let rpcRespuestas: Record<string, Resultado> = {};
const llamadas: string[] = [];

function constructor(tabla: string) {
  const r = () => respuestas[tabla] ?? { data: [], error: null, count: 0 };
  const b: Record<string, unknown> = {};
  const enc = () => b;
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'or', 'order', 'limit', 'range', 'gte', 'lte', 'lt', 'gt', 'ilike', 'like', 'not', 'filter', 'match', 'contains']) {
    b[m] = jest.fn(enc);
  }
  b.maybeSingle = jest.fn(() => Promise.resolve({ ...r(), data: Array.isArray(r().data) ? (r().data as unknown[])[0] ?? null : r().data }));
  b.single = b.maybeSingle;
  b.then = (ok: (v: Resultado) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(r()).then(ok, ko);
  return b;
}

const supabaseFalso = {
  from: (tabla: string) => {
    llamadas.push(tabla);
    return constructor(tabla);
  },
  rpc: (nombre: string) => {
    llamadas.push(`rpc:${nombre}`);
    const r = rpcRespuestas[nombre] ?? { data: null, error: null };
    const p = Promise.resolve(r);
    return Object.assign(p, { single: () => p, maybeSingle: () => p });
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: jest.fn(),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }),
  },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
};

jest.mock('@/lib/supabase/config', () => ({ supabase: supabaseFalso, default: supabaseFalso }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/app/inventario/productos/nuevo',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 7 }, isLoading: false }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    getToday: () => '2026-10-06',
    formatDate: (v: unknown) => String(v ?? ''),
    formatDateTime: (v: unknown) => String(v ?? ''),
    formatPlainDate: (v: unknown) => String(v ?? ''),
    timezone: 'America/Bogota',
  }),
  useOrganizationTimezone: () => ({ timezone: 'America/Bogota' }),
}));
// En la app, AppLayout envuelve /app/** en BranchProvider.
jest.mock('@/lib/context/BranchContext', () => ({
  ...jest.requireActual('@/lib/context/BranchContext'),
  useBranch: () => ({ selectedBranchId: 1, branchFilter: null, branches: [], selectedBranch: null }),
}));
jest.mock('@/lib/supabase/imageUtils', () => ({ getPublicUrl: (r: string) => r, supabaseImageLoader: undefined }));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }), toast: jest.fn() }));

// jsPDF (vía categoryService) exige TextEncoder, que jsdom no trae.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const util = require('util') as typeof import('util');
Object.assign(globalThis, { TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ProductoForm } = require('@/components/inventario/productos/formulario/ProductoForm') as typeof import('@/components/inventario/productos/formulario/ProductoForm');

const CATALOGOS: Record<string, Resultado> = {
  branches: { data: [{ id: 1, name: 'Principal', is_main: true }], error: null },
  categories: { data: [], error: null },
  units: { data: [{ code: 'UND ', name: 'Unidad', unit_type: 'unit' }], error: null },
  organization_taxes: { data: [{ id: 3, name: 'IVA 19%', rate: '19', is_default: true, tax_included: false, kind: 'iva' }], error: null },
  suppliers: { data: [], error: null },
  product_tags: { data: [], error: null },
  variant_types: { data: [], error: null },
  product_modifier_groups: { data: [], error: null },
  products: { data: [], error: null, count: 4 },
};

let errores: unknown[] = [];
const errorOriginal = console.error;

beforeEach(() => {
  respuestas = { ...CATALOGOS };
  rpcRespuestas = { fn_productos_permisos: { data: { crear: true, editar: true }, error: null } };
  llamadas.length = 0;
  errores = [];
  console.error = (...a: unknown[]) => {
    errores.push(a);
  };
  delete (window as unknown as Record<string, unknown>).goAdminDesktop;
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    /* sin almacenamiento */
  }
});

afterEach(() => {
  console.error = errorOriginal;
});

/** Ningún error de render (React registra con console.error lo que lanzaría a la frontera). */
function sinErroresDeRender() {
  const texto = errores.map((a) => (a as unknown[]).map(String).join(' ')).join('\n');
  expect(texto).not.toMatch(/is not a function|is not defined|Cannot read properties/);
}

async function montarYEsperar() {
  renderConIdioma(<ProductoForm modo="crear" />);
  await waitFor(() => expect(llamadas).toContain('rpc:fn_productos_permisos'));
  // El SKU sugerido (4 productos → PROD-005-…) solo aparece cuando el formulario ya pintó sus secciones.
  await waitFor(() => expect(screen.getAllByDisplayValue(/PROD-005-/).length).toBeGreaterThan(0), { timeout: 4000 });
  sinErroresDeRender();
}

describe('Nuevo producto · montaje', () => {
  it('web: monta con catálogos normales', async () => {
    await montarYEsperar();
  });

  it('escritorio: monta con el bridge de Go Admin Desktop presente', async () => {
    (window as unknown as Record<string, unknown>).goAdminDesktop = {
      isDesktop: true,
      platform: 'win32',
      version: '0.2.7',
      getVersion: () => Promise.resolve('0.2.7'),
      onConnectivity: () => () => undefined,
      getConnectivity: () => Promise.resolve(false),
      scale: undefined,
    };
    await montarYEsperar();
  });

  it('catálogos con data null (respuesta vacía/offline) no rompen el montaje', async () => {
    for (const k of Object.keys(respuestas)) respuestas[k] = { data: null, error: null, count: null };
    renderConIdioma(<ProductoForm modo="crear" />);
    await waitFor(() => expect(llamadas).toContain('rpc:fn_productos_permisos'));
    await waitFor(() => expect(screen.getAllByDisplayValue(/PROD-001-/).length).toBeGreaterThan(0), { timeout: 4000 });
    sinErroresDeRender();
  });

  it('sin red: los catálogos fallan y se muestra el error con reintento, no la frontera', async () => {
    for (const k of Object.keys(respuestas)) respuestas[k] = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    rpcRespuestas = {};
    renderConIdioma(<ProductoForm modo="crear" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /reintentar/i })).toBeTruthy());
  });
});
