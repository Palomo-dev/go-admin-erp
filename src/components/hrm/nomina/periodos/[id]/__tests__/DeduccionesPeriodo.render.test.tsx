/**
 * @jest-environment jsdom
 *
 * «Nómina — cálculo incompleto bloqueado» (Figma 2335:141647): la retención se ve «Sin
 * calcular», no como $ 0, y no hay neto. Datos inventados.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { DeduccionesPeriodo } from '../DeduccionesPeriodo';

const mockGetSlips = jest.fn();
const mockFijar = jest.fn();

jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/hrm/nomina',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 10,
  useOrganization: () => ({ organization: { id: 10 } }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('@/lib/services/payrollService', () => ({
  __esModule: true,
  default: class {
    getSlips = mockGetSlips;
    fijarDeduccion = mockFijar;
  },
}));

const colilla = {
  id: 's1', employee_name: 'María de prueba', gross_pay: 6000000, health_deduction: 240000, pension_deduction: 240000,
  net_pay: 5520000, tax_withholding: null, loan_deductions: 0,
};
const noAplica = { ...colilla, id: 's2', employee_name: 'Andrés de prueba', tax_withholding: 0, net_pay: 2300000, gross_pay: 2500000 };

beforeEach(() => {
  simularAncho(1440);
  mockGetSlips.mockReset();
  mockFijar.mockReset();
  mockGetSlips.mockResolvedValue([colilla, noAplica]);
});

test('«Sin calcular» bloquea, sin neto y sin tomarla como cero', async () => {
  const onPendientes = jest.fn();
  renderConIdioma(<DeduccionesPeriodo ejecucionId="r1" onPendientes={onPendientes} onCambio={jest.fn()} />);
  expect(await screen.findByText('No se puede cerrar: falta la retención en la fuente')).toBeTruthy();
  expect(screen.getByText('Sin calcular')).toBeTruthy();
  expect(screen.getByText('No aplica')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.queryByText('$ 5520000')).toBeNull();
  expect(onPendientes).toHaveBeenLastCalledWith(1);
});

test('el valor se escribe por el servicio y recarga', async () => {
  const onCambio = jest.fn();
  mockFijar.mockResolvedValue(undefined);
  renderConIdioma(<DeduccionesPeriodo ejecucionId="r1" onPendientes={jest.fn()} onCambio={onCambio} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ingresar valor' }));
  fireEvent.change(await screen.findByLabelText(/^Valor/), { target: { value: '320000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar valor' }));
  await screen.findByText('No se puede cerrar: falta la retención en la fuente');
  await new Promise((r) => setTimeout(r, 0));
  expect(mockFijar).toHaveBeenCalledWith('s1', 'retencion', 320000, '');
  expect(onCambio).toHaveBeenCalled();
});
