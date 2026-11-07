/**
 * @jest-environment jsdom
 *
 * «Nuevo asiento» (Figma 983:66317 cuadra · 983:66555 no cuadra · 983:66763 periodo
 * cerrado): la barra de cuadre, «Publicar» deshabilitado si no cuadra, el aviso de
 * periodo cerrado y que «Publicar» crea con `publicar=true` en la sucursal elegida.
 * El servicio va simulado: nada toca la base. Datos inventados.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { NuevoAsientoDialog } from '../NuevoAsientoDialog';

const mockCrear = jest.fn();
let mockPeriodoAbierto = true;

jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/finanzas/contabilidad/asientos',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranch: () => ({ selectedBranchId: 3, branches: [{ id: 3, name: 'Principal', organization_id: 10 }] }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-28', toInstant: (d: string) => `${d}T12:00:00-05:00` }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}`, decimals: 0 }),
}));
jest.mock('../../CampoTerceroAsiento', () => ({ CampoTerceroAsiento: () => null }));
// El selector de cuentas del kit abre un popover con búsqueda; aquí basta un select.
jest.mock('@/components/kit', () => {
  const real = jest.requireActual('@/components/kit');
  return {
    ...real,
    SelectorCuenta: ({ etiqueta, onCambiar }: { etiqueta: string; onCambiar: (c: { account_code: string; name: string }) => void }) => (
      <select aria-label={etiqueta} defaultValue="" onChange={(e: ChangeEvent<HTMLSelectElement>) => onCambiar({ account_code: e.target.value, name: '' })}>
        <option value="" />
        <option value="53050501">53050501</option>
        <option value="11100501">11100501</option>
        <option value="11050501">11050501</option>
      </select>
    ),
  };
});
jest.mock('../../ContabilidadService', () => ({
  cuentaRetencionExigeNit: () => false,
  lineasSinTerceroParaContabilizar: () => [],
  ContabilidadService: {
    defectoCentroSucursal: jest.fn(async () => null),
    periodoAbierto: jest.fn(async () => mockPeriodoAbierto),
    crearAsiento: (...a: unknown[]) => mockCrear(...a),
  },
}));

const CUENTAS = [
  { account_code: '53050501', name: 'Gastos bancarios', type: 'expense', is_active: true },
  { account_code: '11100501', name: 'Bancos nacionales', type: 'asset', is_active: true },
  { account_code: '11050501', name: 'Caja menor', type: 'asset', is_active: true },
] as never[];

function abrir(onCreado = jest.fn()) {
  renderConIdioma(<NuevoAsientoDialog abierto onAbiertoChange={() => undefined} cuentas={CUENTAS} centros={[]} distribuciones={[]} onCreado={onCreado} />);
  return onCreado;
}

function llenar(n: number, cuenta: string, campo: 'Débito' | 'Crédito', valor: string) {
  fireEvent.change(screen.getByLabelText(`Cuenta de la línea ${n}`), { target: { value: cuenta } });
  fireEvent.change(screen.getByLabelText(`${campo} de la línea ${n}`), { target: { value: valor } });
}

beforeEach(() => {
  simularAncho(1440);
  mockCrear.mockReset();
  mockPeriodoAbierto = true;
});

describe('Nuevo asiento', () => {
  it('no cuadra: muestra la diferencia y «Publicar» queda deshabilitado', async () => {
    abrir();
    fireEvent.change(screen.getByPlaceholderText(/reclasificación/), { target: { value: 'Gastos de septiembre' } });
    fireEvent.click(screen.getByRole('button', { name: /^Agregar línea/ }));
    llenar(1, '53050501', 'Débito', '250000');
    llenar(2, '11100501', 'Crédito', '181000');
    llenar(3, '11050501', 'Crédito', '50000');
    expect(await screen.findByText('Diferencia $ 19000')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('cuadra: «Publicar» crea con publicar=true en la sucursal y con el instante del día', async () => {
    mockCrear.mockResolvedValue({ id: 9561, memo: 'Gastos de septiembre' });
    const onCreado = abrir();
    fireEvent.change(screen.getByPlaceholderText(/reclasificación/), { target: { value: 'Gastos de septiembre' } });
    llenar(1, '53050501', 'Débito', '250000');
    llenar(2, '11100501', 'Crédito', '250000');
    expect(await screen.findByText('Cuadra')).toBeTruthy();
    const publicar = screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement;
    await waitFor(() => expect(publicar.disabled).toBe(false));
    fireEvent.click(publicar);
    await waitFor(() => expect(mockCrear).toHaveBeenCalledTimes(1));
    const [asiento, sucursal, publicado] = mockCrear.mock.calls[0];
    expect(asiento).toMatchObject({ entry_date: '2026-09-28T12:00:00-05:00', memo: 'Gastos de septiembre' });
    expect(asiento.lines).toHaveLength(2);
    expect(sucursal).toBe(3);
    expect(publicado).toBe(true);
    await waitFor(() => expect(onCreado).toHaveBeenCalledWith({ id: 9561, memo: 'Gastos de septiembre' }, true));
  });

  it('escribir en Crédito limpia el Débito de la misma línea', () => {
    abrir();
    const debito = screen.getByLabelText('Débito de la línea 1') as HTMLInputElement;
    fireEvent.change(debito, { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Crédito de la línea 1'), { target: { value: '40' } });
    expect(debito.value).toBe('');
  });

  it('periodo cerrado: avisa y no deja guardar', async () => {
    mockPeriodoAbierto = false;
    abrir();
    expect(await screen.findByText(/está cerrado/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/reclasificación/), { target: { value: 'Ajuste' } });
    llenar(1, '53050501', 'Débito', '10');
    llenar(2, '11100501', 'Crédito', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(mockCrear).not.toHaveBeenCalled();
  });
});
