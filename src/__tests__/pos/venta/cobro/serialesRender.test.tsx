/**
 * @jest-environment jsdom
 *
 * Seriales del cobro (POS-PLAN L48) sobre el `Dialogo` del kit (paso 12): la
 * lógica es la de siempre —carga por producto, no se elige más de la cantidad,
 * «Confirmar» solo con todo completo— y los textos salen de `posCobro.seriales`.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { CartItem } from '@/components/pos/types';

const mockSeriales = jest.fn();
jest.mock('@/lib/services/serialTrackingService', () => ({
  serialTrackingService: { getAvailableSerials: (...args: unknown[]) => mockSeriales(...args) },
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatPlain: (v: string | null | undefined) => (v ? `fecha:${v}` : '') }),
}));

import { SerialSelectorDialog } from '@/components/pos/SerialSelectorDialog';

const ITEMS = [
  { id: 'l1', product_id: 9, quantity: 2, unit_price: 1000, total: 2000, product: { id: 9, name: 'Celular', sku: 'CEL-1', track_serial: true } },
  { id: 'l2', product_id: 4, quantity: 1, unit_price: 500, total: 500, product: { id: 4, name: 'Funda', sku: 'FUN', track_serial: false } },
] as unknown as CartItem[];

beforeEach(() => mockSeriales.mockReset());

test('elige hasta la cantidad pedida y confirma solo con todo completo', async () => {
  mockSeriales.mockResolvedValue([
    { id: 1, serial: 'SN-001', warranty_end: '2027-01-31' },
    { id: 2, serial: 'SN-002', warranty_end: null },
    { id: 3, serial: 'SN-003', warranty_end: null },
  ]);
  const onConfirm = jest.fn();
  const onOpenChange = jest.fn();
  renderConIdioma(<SerialSelectorDialog open onOpenChange={onOpenChange} items={ITEMS} organizationId={120} branchId={3} onConfirm={onConfirm} />);
  expect(screen.getByRole('dialog', { name: 'Selección de seriales' })).toBeTruthy();
  await screen.findByRole('checkbox', { name: /SN-001/ });
  expect(mockSeriales).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Garantía hasta: fecha:2027-01-31')).toBeTruthy();
  const confirmar = screen.getByRole('button', { name: 'Confirmar seriales' }) as HTMLButtonElement;
  expect(confirmar.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /SN-001/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /SN-002/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /SN-003/ })); // tope: la cantidad es 2
  expect(screen.getByRole('checkbox', { name: /SN-003/ }).getAttribute('aria-checked')).toBe('false');
  expect(screen.getByText('2/2')).toBeTruthy();
  expect(confirmar.disabled).toBe(false);
  fireEvent.click(confirmar);
  expect(onConfirm).toHaveBeenCalledWith({ 9: [1, 2] });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('sin seriales suficientes lo dice (plural del idioma) y en inglés también', async () => {
  mockSeriales.mockResolvedValue([{ id: 1, serial: 'SN-001', warranty_end: null }]);
  renderConIdioma(<SerialSelectorDialog open onOpenChange={jest.fn()} items={ITEMS} organizationId={120} branchId={3} onConfirm={jest.fn()} />, { idioma: 'en' });
  await waitFor(() => expect(screen.getByText('Only 1 serial number is available and 2 are required.')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Confirm serial numbers' })).toBeTruthy();
});

test('error del servicio: el mensaje llega como alerta', async () => {
  mockSeriales.mockRejectedValue(new Error('sin red'));
  renderConIdioma(<SerialSelectorDialog open onOpenChange={jest.fn()} items={ITEMS} organizationId={120} branchId={3} onConfirm={jest.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain('sin red');
});
