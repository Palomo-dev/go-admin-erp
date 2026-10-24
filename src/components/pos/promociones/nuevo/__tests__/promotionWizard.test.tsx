/**
 * @jest-environment jsdom
 *
 * Asistente de promoción: al cambiar de tipo se conserva el valor solo si
 * significa lo mismo, y «Siguiente» muestra el error bajo el campo.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { CreatePromotionData } from '@/components/pos/promociones/types';

const toastError = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
  },
}));
jest.mock('@/components/pos/promociones/promotionsService', () => ({
  PromotionsService: {
    getProducts: jest.fn(async () => []),
    getCategories: jest.fn(async () => []),
    getBranches: jest.fn(async () => []),
    create: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    timezone: 'America/Bogota',
    getToday: () => '2026-10-22',
  }),
}));
jest.mock('@/components/shared/RichTextEditor', () => ({
  RichTextEditor: () => null,
}));

import { PromotionWizard } from '@/components/pos/promociones/nuevo/PromotionWizard';

function campo(etiqueta: string): HTMLInputElement {
  return screen.getByLabelText(etiqueta) as HTMLInputElement;
}

async function montar(initialData?: CreatePromotionData) {
  await act(async () => {
    renderConIdioma(<PromotionWizard initialData={initialData} />);
  });
}

function ponerNombre(nombre = 'Verano') {
  fireEvent.change(screen.getByPlaceholderText('ej: Descuento de Verano'), { target: { value: nombre } });
}

function siguiente() {
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
}

function irAlDescuento() {
  ponerNombre();
  siguiente();
}

function elegirTipo(nombre: string) {
  fireEvent.click(screen.getByRole('radio', { name: nombre }));
}

beforeEach(() => {
  toastError.mockClear();
});

describe('PromotionWizard · valor al cambiar de tipo', () => {
  test('porcentaje 15 → paquete → porcentaje conserva el 15 y muestra «Repetir»', async () => {
    await montar();
    irAlDescuento();
    fireEvent.change(campo('Porcentaje de Descuento'), { target: { value: '15' } });
    elegirTipo('Porcentaje');
    expect(campo('Porcentaje de Descuento').value).toBe('15');

    elegirTipo('Bundle');
    expect(campo('Porcentaje (si no hay precio)').value).toBe('15');
    expect(campo('Repetir cada N unidades (opcional)')).toBeTruthy();
    expect(screen.getByText(/En un paquete con porcentaje/)).toBeTruthy();

    elegirTipo('Porcentaje');
    expect(campo('Porcentaje de Descuento').value).toBe('15');
    expect(screen.queryByText('Fecha de Inicio *')).toBeNull();
  });

  test('con el porcentaje vacío, «Siguiente» muestra el error bajo el campo y lo enfoca', async () => {
    await montar();
    irAlDescuento();
    fireEvent.change(campo('Porcentaje de Descuento'), { target: { value: '' } });
    siguiente();

    const porcentaje = campo('Porcentaje de Descuento');
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toBe('El porcentaje debe ser entre 1 y 100');
    expect(porcentaje.getAttribute('aria-invalid')).toBe('true');
    expect(porcentaje.getAttribute('aria-describedby')).toBe('promo-error-porcentaje');
    expect(porcentaje.className).toContain('border-line-danger');
    expect(document.activeElement).toBe(porcentaje);
    expect(toastError).toHaveBeenCalledWith('El porcentaje debe ser entre 1 y 100');
    expect(screen.queryByText('Fecha de Inicio *')).toBeNull();
    expect(screen.getByText('Tipo de Promoción')).toBeTruthy();
  });

  test('al cambiar a un tipo que no usa el mismo número se conserva y se avisa', async () => {
    await montar();
    irAlDescuento();
    fireEvent.change(campo('Porcentaje de Descuento'), { target: { value: '15' } });
    elegirTipo('Monto Fijo');

    const monto = campo('Monto de Descuento');
    expect(monto.value).toBe('15');
    expect(screen.getByText('El valor se conserva. En este tipo puede significar otra cosa: revísalo antes de guardar.')).toBeTruthy();
    expect(screen.queryByText('Fecha de Inicio *')).toBeNull();

    fireEvent.change(monto, { target: { value: '' } });
    siguiente();
    expect(screen.getByRole('alert').textContent).toBe('El monto de descuento debe ser mayor a 0');
    expect(monto.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(monto);
  });

  test('compra/lleva y paquete vacíos marcan el campo y enfocan el primero', async () => {
    await montar();
    irAlDescuento();
    elegirTipo('Compra X Lleva Y');
    fireEvent.change(campo('Lleva (X)'), { target: { value: '' } });
    fireEvent.change(campo('Paga o gratis (Y)'), { target: { value: '' } });
    siguiente();
    expect(screen.getAllByRole('alert').map((n) => n.textContent)).toEqual([
      'Indica cuántas unidades se compran',
      'Indica cuántas se pagan o se llevan gratis',
    ]);
    expect(document.activeElement).toBe(campo('Lleva (X)'));
    expect(screen.queryByText('Fecha de Inicio *')).toBeNull();

    elegirTipo('Bundle');
    fireEvent.change(campo('Porcentaje (si no hay precio)'), { target: { value: '' } });
    siguiente();
    const alertas = screen.getAllByRole('alert').map((n) => n.textContent);
    expect(alertas).toEqual([
      'Indica el precio del paquete o un porcentaje entre 1 y 100',
      'Indica el precio del paquete o un porcentaje entre 1 y 100',
    ]);
    expect(document.activeElement).toBe(campo('Precio del paquete'));
    expect(campo('Precio del paquete').getAttribute('aria-invalid')).toBe('true');
    expect(campo('Porcentaje (si no hay precio)').getAttribute('aria-describedby')).toBe('promo-error-porcentaje-paquete');
  });

  test('al editar un paquete, «Repetir» carga el N guardado', async () => {
    await montar({
      name: 'Paquete veinte',
      promotion_type: 'bundle',
      discount_value: 20,
      bundle_price: null,
      repeat_every_quantity: 3,
      applies_to: 'all',
      start_date: '2026-10-22',
      is_active: true,
    });
    siguiente();
    expect(campo('Porcentaje (si no hay precio)').value).toBe('20');
    expect(campo('Repetir cada N unidades (opcional)').value).toBe('3');
    expect(screen.getByText(/En un paquete con porcentaje/)).toBeTruthy();
  });
});
