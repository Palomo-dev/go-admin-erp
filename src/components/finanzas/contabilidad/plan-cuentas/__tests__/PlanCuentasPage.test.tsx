/**
 * @jest-environment jsdom
 *
 * Plan de cuentas: alta en la misma fila. Desde 2026-11-10 toda cuenta desde
 * grupo tiene su «+» (cuenta, subcuenta, auxiliar, subauxiliar), guardar no
 * recarga el plan y un padre de movimiento con saldo exige confirmar el traslado.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/plan-cuentas',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/finanzas/usePermisosFinanzas', () => ({
  usePermisosFinanzas: () => ({ crear: true, ver: true, cargando: false }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (n: number) => `$ ${n}` }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: (v: string | null) => v ?? '' }),
}));
jest.mock('@/components/ui/use-toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));

const obtenerPlanCuentas = jest.fn();
const obtenerSaldosPlan = jest.fn();
const crearCuentaHija = jest.fn();
jest.mock('../../ContabilidadService', () => ({
  ContabilidadService: {
    obtenerPlanCuentas: (...a: unknown[]) => obtenerPlanCuentas(...a),
    obtenerSaldosPlan: (...a: unknown[]) => obtenerSaldosPlan(...a),
    crearCuentaHija: (...a: unknown[]) => crearCuentaHija(...a),
    autorCuenta: jest.fn(async () => ({ creadaPor: null, creadaEn: null })),
  },
}));

import { PlanCuentasPage } from '../PlanCuentasPage';

const cuenta = (account_code: string, name: string, parent_code: string | null, es_movimiento: boolean) => ({
  account_code,
  name,
  parent_code,
  es_movimiento,
  is_active: true,
  type: 'asset',
  organization_id: 7,
  description: null,
  created_at: '',
  updated_at: '',
});

const PLAN = [
  cuenta('1', 'Activo', null, false),
  cuenta('11', 'Disponible', '1', false),
  cuenta('1105', 'Caja', '11', false),
  cuenta('110505', 'Caja general', '1105', true),
  cuenta('110510', 'Cajas menores', '1105', false),
  cuenta('11051001', 'Caja menor norte', '110510', true),
];

async function abrirCaja() {
  renderConIdioma(<PlanCuentasPage />);
  await screen.findByRole('button', { name: /Abrir 1 Activo/ });
  fireEvent.click(screen.getByRole('button', { name: /Abrir 1 Activo/ }));
  fireEvent.click(screen.getByRole('button', { name: /Abrir 11 Disponible/ }));
  fireEvent.click(screen.getByRole('button', { name: /Abrir 1105 Caja/ }));
}

beforeEach(() => {
  jest.clearAllMocks();
  obtenerPlanCuentas.mockResolvedValue(PLAN);
  obtenerSaldosPlan.mockResolvedValue(new Map([['110505', { saldo: 2300000, movimientos: 4 }]]));
});

describe('PlanCuentasPage · alta en la fila', () => {
  it('cada fila desde grupo ofrece crear el nivel de abajo; la clase no', async () => {
    await abrirCaja();
    expect(screen.getByRole('button', { name: /Crear Auxiliar debajo de 110510/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crear Auxiliar debajo de 110505/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crear Subcuenta debajo de 1105 / })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crear Cuenta debajo de 11 / })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrir 110510 Cajas menores/ }));
    expect(screen.getByRole('button', { name: /Crear Subauxiliar debajo de 11051001/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /debajo de 1 Activo/ })).toBeNull();
  });

  it('una cuenta de movimiento sin hijas (1110 Bancos) crea su subcuenta en la fila', async () => {
    obtenerPlanCuentas.mockResolvedValue([...PLAN, cuenta('1110', 'Bancos', '11', true)]);
    crearCuentaHija.mockResolvedValue({
      account_code: '111005',
      parent_code: '1110',
      padre_paso_a_titulo: true,
      saldo_trasladado: 0,
      asientos: [],
      referencias_actualizadas: 0,
    });
    renderConIdioma(<PlanCuentasPage />);
    await screen.findByRole('button', { name: /Abrir 1 Activo/ });
    fireEvent.click(screen.getByRole('button', { name: /Abrir 1 Activo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir 11 Disponible/ }));
    fireEvent.click(screen.getByRole('button', { name: /Crear Subcuenta debajo de 1110 Bancos/ }));

    expect((screen.getByRole('textbox', { name: 'Código' }) as HTMLInputElement).value).toBe('111005');
    const nombre = screen.getByRole('textbox', { name: 'Nombre' });
    expect(nombre.getAttribute('placeholder')).toBe('Nombre de la subcuenta');
    expect(within(screen.getByRole('note')).getByText(/1110 pasará a ser cuenta de título/)).toBeTruthy();
    fireEvent.change(nombre, { target: { value: 'Banco principal' } });
    fireEvent.keyDown(nombre, { key: 'Enter' });

    await waitFor(() => expect(crearCuentaHija).toHaveBeenCalledWith(expect.objectContaining({
      padre: '1110',
      codigo: '111005',
      nombre: 'Banco principal',
    })));
    expect(await screen.findByText('Banco principal')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Código' }) as HTMLInputElement).value).toBe('111010'));
  });

  it('Enter guarda con el código siguiente, no recarga y abre otro', async () => {
    crearCuentaHija.mockResolvedValue({
      account_code: '11051002',
      parent_code: '110510',
      padre_paso_a_titulo: false,
      saldo_trasladado: 0,
      asientos: [],
      referencias_actualizadas: 0,
    });
    await abrirCaja();
    fireEvent.click(screen.getByRole('button', { name: /Crear Auxiliar debajo de 110510/ }));

    const nombre = screen.getByRole('textbox', { name: 'Nombre' });
    expect((screen.getByRole('textbox', { name: 'Código' }) as HTMLInputElement).value).toBe('11051002');
    fireEvent.change(nombre, { target: { value: 'Caja menor sur' } });
    fireEvent.keyDown(nombre, { key: 'Enter' });

    await waitFor(() => expect(crearCuentaHija).toHaveBeenCalledWith(expect.objectContaining({
      padre: '110510',
      codigo: '11051002',
      nombre: 'Caja menor sur',
      trasladarSaldo: false,
    })));
    expect(await screen.findByText('Caja menor sur')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Código' }) as HTMLInputElement).value).toBe('11051003'));
    expect(obtenerPlanCuentas).toHaveBeenCalledTimes(1);
  });

  it('con saldo, Enter no guarda: hay que confirmar el traslado', async () => {
    crearCuentaHija.mockResolvedValue({
      account_code: '11050501',
      parent_code: '110505',
      padre_paso_a_titulo: true,
      saldo_trasladado: 2300000,
      asientos: [9],
      referencias_actualizadas: 1,
    });
    await abrirCaja();
    fireEvent.click(screen.getByRole('button', { name: /Crear Auxiliar debajo de 110505/ }));

    const nombre = screen.getByRole('textbox', { name: 'Nombre' });
    fireEvent.change(nombre, { target: { value: 'Caja principal' } });
    fireEvent.keyDown(nombre, { key: 'Enter' });
    expect(crearCuentaHija).not.toHaveBeenCalled();

    const aviso = screen.getByRole('note');
    expect(within(aviso).getByText(/110505 Caja general tiene saldo/)).toBeTruthy();
    fireEvent.click(within(aviso).getByRole('button', { name: 'Crear y trasladar' }));
    await waitFor(() => expect(crearCuentaHija).toHaveBeenCalledWith(expect.objectContaining({ trasladarSaldo: true })));
  });

  it('un código ocupado se dice en la fila y lo escrito no se pierde', async () => {
    crearCuentaHija.mockRejectedValue({ message: 'CODIGO_OCUPADO: 11051003' });
    await abrirCaja();
    fireEvent.click(screen.getByRole('button', { name: /Crear Auxiliar debajo de 110510/ }));
    const nombre = screen.getByRole('textbox', { name: 'Nombre' }) as HTMLInputElement;
    fireEvent.change(nombre, { target: { value: 'Caja menor sur' } });
    fireEvent.keyDown(nombre, { key: 'Enter' });

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Ese código ya existe. El siguiente libre es 11051003.');
    expect((screen.getByRole('textbox', { name: 'Nombre' }) as HTMLInputElement).value).toBe('Caja menor sur');
  });
});
