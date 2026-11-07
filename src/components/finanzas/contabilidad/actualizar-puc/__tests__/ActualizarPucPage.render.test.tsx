/**
 * @jest-environment jsdom
 *
 * Actualizar PUC (Finanzas R3, frente C): la vista previa se lee al entrar,
 * «Aplicar actualización» exige la casilla de confirmación y, sin cambios, la
 * página dice que el plan está al día. El servicio va simulado: ninguna
 * organización se migra ni se revierte. Datos inventados.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { ActualizarPucPage } from '../ActualizarPucPage';
import { normalizarVistaPrevia, resumenVistaPrevia } from '../ActualizarPucService';

const mockVista = jest.fn();
const mockAplicar = jest.fn();

jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/actualizar-puc',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('../ActualizarPucService', () => {
  const real = jest.requireActual('../ActualizarPucService');
  return {
    ...real,
    ActualizarPucService: {
      vistaPrevia: (...a: unknown[]) => mockVista(...a),
      aplicar: (...a: unknown[]) => mockAplicar(...a),
      revertir: jest.fn(),
    },
  };
});

const conCambios = normalizarVistaPrevia({
  organization_id: 10,
  sector: 'Comercio',
  renombres: [{ origen: '4135', actual: 'Ventas', propuesto: 'Comercio al por mayor y al por menor', lineas: 0 }],
  reclasificaciones: [
    { origen: '1405', destino: '14350101', debito: '4200000' as unknown as number, credito: 1100000, neto: 3100000, motivo: 'El inventario va en la 1435' },
    { origen: '2105', destino: '22050501', debito: 0, credito: 860000, neto: -860000, motivo: 'Proveedor registrado como obligación' },
  ],
  reglas: [
    { id: 1, nombre: 'Venta de contado', source_type: 'sale', event_type: 'created', lado: 'credito', actual: '4135', propuesto: '413505', editada: false, motivo: '' },
    { id: 2, nombre: 'Compra', source_type: 'purchase', event_type: 'created', lado: 'debito', actual: '1405', propuesto: '14350101', editada: true, motivo: '' },
  ],
});

beforeEach(() => {
  simularAncho(1440);
  mockVista.mockReset();
  mockAplicar.mockReset();
});

describe('resumen de la vista previa', () => {
  it('normaliza las cifras de texto y cuenta las reglas editadas aparte', () => {
    expect(conCambios.reclasificaciones[0].debito).toBe(4200000);
    expect(resumenVistaPrevia(conCambios)).toEqual({ renombres: 1, reclasificaciones: 2, reglasPorAjustar: 1, reglasEditadas: 1, alDia: false });
    expect(resumenVistaPrevia(normalizarVistaPrevia({})).alDia).toBe(true);
  });
});

describe('ActualizarPucPage', () => {
  it('lee la vista previa al entrar y solo aplica con la casilla marcada', async () => {
    mockVista.mockResolvedValue(conCambios);
    mockAplicar.mockResolvedValue({ corrida_id: 'c1', journal_entry_id: 77, asientos: [77], ya_aplicado: false });
    renderConIdioma(<ActualizarPucPage />);
    expect(await screen.findByText('El inventario va en la 1435')).toBeTruthy();
    expect(screen.getByText('$ 860000 C')).toBeTruthy();
    const aplicar = screen.getByRole('button', { name: 'Aplicar actualización' }) as HTMLButtonElement;
    expect(aplicar.disabled).toBe(true);
    fireEvent.click(aplicar);
    expect(mockAplicar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(aplicar.disabled).toBe(false);
    fireEvent.click(aplicar);
    await waitFor(() => expect(mockAplicar).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Ver asiento de traslado #77')).toBeTruthy();
  });

  it('sin cambios dice que el plan está al día y no ofrece aplicar', async () => {
    mockVista.mockResolvedValue(normalizarVistaPrevia({ organization_id: 10 }));
    renderConIdioma(<ActualizarPucPage />);
    expect(await screen.findByText('Tu plan ya está al día')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aplicar actualización' })).toBeNull();
  });

  it('un error de lectura no se muestra como plan al día', async () => {
    mockVista.mockRejectedValue(new Error('caída'));
    renderConIdioma(<ActualizarPucPage />);
    expect(await screen.findByText('No se pudo leer la vista previa')).toBeTruthy();
    expect(screen.queryByText('Tu plan ya está al día')).toBeNull();
  });
});
