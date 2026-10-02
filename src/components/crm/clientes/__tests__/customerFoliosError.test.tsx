/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { CustomerFoliosSection } from '../CustomerFoliosSection';
import type { useCustomerFolios } from '../useCustomerFolios';
import { sumarEnMonedaBase } from '@/components/crm/kit/monedaCrm';

const loadData = jest.fn();
let state: ReturnType<typeof useCustomerFolios>;
jest.mock('../useCustomerFolios', () => ({ useCustomerFolios: () => state }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({
    paraDocumento: (code: string) => ({ code, decimals: code === 'COP' ? 0 : 2, locale: 'es-CO' }),
  }),
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDate: String }),
}));
jest.mock('@/components/pms/folios', () => ({ FolioDetailDialog: () => null }));
jest.mock('@/components/pms/FolioPaymentDialog', () => ({ FolioPaymentDialog: () => null }));
beforeEach(() => {
  loadData.mockClear();
  state = { folios: [], invoices: [], summary: null, isLoading: false, error: true, loadData };
});

test.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])(
  'el error financiero en %s usa el kit traducido y nunca anuncia deuda cero',
  (idioma) => {
    const { container } = renderConIdioma(<CustomerFoliosSection customerId="customer" />, {
      idioma,
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(container.textContent).not.toContain('Sin deudas pendientes');
    expect(container.textContent).not.toContain('Deuda Total');
    expect(container.textContent).not.toContain('clientes.ficha.cuentas');
    const retry = { es: 'Reintentar', en: 'Retry', fr: 'Réessayer', pt: 'Tentar novamente' }[
      idioma
    ];
    fireEvent.click(screen.getByRole('button', { name: retry }));
    expect(loadData).toHaveBeenCalledTimes(1);
  },
);

test.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])(
  'un resumen con tasas/moneda ausentes en %s presenta — y explicación',
  (idioma) => {
    state.error = false;
    const noRate = sumarEnMonedaBase([{ monto: 15, moneda: 'USD' }], 'COP');
    state.summary = {
      base: 'COP',
      date: '2026-10-02',
      total: noRate,
      invoices: null,
      folios: sumarEnMonedaBase([], 'COP'),
    };
    const { container } = renderConIdioma(<CustomerFoliosSection customerId="customer" />, {
      idioma,
    });
    expect(container.textContent).not.toContain('crm.customerFolios');
    const cards = container.querySelector('.grid');
    expect(cards?.firstElementChild?.textContent).toContain('—');
    expect(cards?.lastElementChild?.textContent).toContain('—');
    const labels = {
      es: 'Falta la moneda',
      en: 'A currency',
      fr: 'Une devise',
      pt: 'Falta a moeda',
    };
    expect(cards?.textContent).toContain(labels[idioma]);
  },
);
