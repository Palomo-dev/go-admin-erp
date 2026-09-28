/**
 * @jest-environment jsdom
 *
 * El catálogo de productos (`/app/inventario/productos`) no se queda cargando
 * para siempre.
 *
 * Bug (2026-09-28, «la pantalla de productos se queda cargando
 * infinitamente» en desarrollo): con `reactStrictMode: true` React monta,
 * desmonta y vuelve a montar cada componente. El desmontaje simulado marcaba
 * como cancelada la única carga en curso y, al volver a montar, la guarda
 * `lastFetchKey` veía la misma clave y no pedía otra. La carga cancelada
 * terminaba sin tocar `loading` (el `finally` solo lo apaga si no está
 * cancelada) y la tabla se quedaba en el esqueleto.
 *
 * Aquí se renderiza el componente real dentro de `<StrictMode>` con la RPC
 * simulada; las piezas de dibujo se sustituyen por una tabla que solo muestra
 * su estado.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const rpc = jest.fn();
const canal = { on: jest.fn(), subscribe: jest.fn() };
canal.on.mockReturnValue(canal);
canal.subscribe.mockReturnValue(canal);
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    channel: () => canal,
    removeChannel: jest.fn(),
  },
}));

const params = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/inventario/productos',
  useSearchParams: () => params,
}));

// La organización sale de localStorage en el primer render (así llega en la app).
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 7 }, isLoading: false }),
}));
jest.mock('@/lib/context/BranchContext', () => ({ useBranch: () => ({ branchFilter: null, branches: [] }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-28' }),
}));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
jest.mock('@/components/kit', () => ({
  ...jest.requireActual('@/components/kit'),
  BranchBadgeActiva: () => null,
  Pagination: () => null,
}));
jest.mock('../ProductosPageHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('../FiltrosProductos', () => ({ __esModule: true, default: () => null }));
jest.mock('../bulk/AccionesMasivas', () => ({ __esModule: true, default: () => null }));
jest.mock('../FacebookFeedDialog', () => ({ FacebookFeedDialog: () => null }));
jest.mock('../etiquetas/ImprimirEtiquetasDialog', () => ({ ImprimirEtiquetasDialog: () => null }));
jest.mock('../etiquetas/GenerarCodigosDialog', () => ({ GenerarCodigosDialog: () => null }));
jest.mock('../ProductosTable', () => ({
  __esModule: true,
  default: ({ estado, productos, onReintentar }: { estado: string; productos: { name: string }[]; onReintentar: () => void }) => (
    <div>
      <p data-testid="estado">{estado}</p>
      <ul>
        {productos.map((p) => (
          <li key={p.name}>{p.name}</li>
        ))}
      </ul>
      <button onClick={onReintentar}>Reintentar</button>
    </div>
  ),
}));

import CatalogoProductos from '../CatalogoProductos';

const lote = (nombres: string[]) => ({
  data: { items: nombres.map((name, i) => ({ id: i + 1, name, status: 'active' })), total: nombres.length },
  error: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  canal.on.mockReturnValue(canal);
  canal.subscribe.mockReturnValue(canal);
});

describe('Catálogo de productos · carga inicial', () => {
  it('en StrictMode sale del esqueleto y pinta el primer lote', async () => {
    rpc.mockResolvedValue(lote(['Camisa', 'Pantalón']));

    // StrictMode en la raíz, por encima del proveedor de idioma, como lo pone
    // Next con `reactStrictMode`: así React 19 repite los efectos del montaje.
    renderConIdioma(<CatalogoProductos />, { reactStrictMode: true });

    await waitFor(() => expect(screen.getByTestId('estado').textContent).toBe('listo'));
    expect(screen.getByText('Camisa')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('catalogo_productos_lote', expect.objectContaining({ p_organization_id: 7, p_offset: 0 }));
  });

  it('si la RPC falla muestra el error con «Reintentar» (no carga para siempre) y reintentar vuelve a pedir', async () => {
    jest.useFakeTimers();
    try {
      rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function catalogo_productos_lote' } });

      renderConIdioma(<CatalogoProductos />, { reactStrictMode: true });

      // pedirLote reintenta 3 veces con espera exponencial (0,5 s · 1 s · 2 s).
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
      });
      expect(screen.getByTestId('estado').textContent).toBe('error');

      rpc.mockResolvedValue(lote(['Zapato']));
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByTestId('estado').textContent).toBe('listo');
      expect(screen.getByText('Zapato')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
