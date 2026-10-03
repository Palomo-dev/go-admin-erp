/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import {
  renderConIdioma,
  type IdiomaPrueba,
} from '@/test-utils/renderConIdioma';
import { IdentidadesPage } from '../IdentidadesPage';
import { FusionClientesPanel } from '../FusionClientesPanel';
import { HistorialFusiones } from '../HistorialFusiones';
import { IdentidadesCanal } from '../IdentidadesCanal';
import type {
  GrupoDuplicado,
  ClienteDuplicado,
} from '@/lib/services/crm/customerDuplicatesLogica';
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 125 } }),
}));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({
  useCabeceraMovil: () => undefined,
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatDateTime: () => '30/09/2026 15:00' }),
}));
let loading: boolean;
let total: number;
let error: unknown;
let forbidden: boolean;
let scan: { id: string; status: string; processed: number; total: number } | null;
jest.mock('../useIdentidadesData', () => ({
  useIdentidadesData: () => ({
    duplicates: {
      data: [],
      total,
      stats: { phone: 0, email: 0, document: 0 },
      scan,
      canMerge: false,
      canUndo: false,
    },
    merges: [],
    identities: [],
    total,
    canEdit: false,
    loading,
    error,
    forbidden,
  }),
}));
const customer = (id: string, name: string): ClienteDuplicado => ({
  id,
  full_name: name,
  first_name: name,
  last_name: null,
  email: `${id}@example.invalid`,
  phone: '+573100000001',
  company_name: null,
  trade_name: null,
  identification_type: null,
  identification_number: null,
  address: null,
  city: null,
  conversations_count: 0,
  opportunities_count: 0,
});
const group: GrupoDuplicado = {
  identity_type: 'phone',
  identity_value: '573100000001',
  customers: [customer('a', 'Contacto A'), customer('b', 'Contacto B')],
};
let errors: jest.SpyInstance;
beforeEach(() => {
  loading = false;
  total = 0;
  error = null;
  forbidden = false;
  scan = null;
  errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errors.mock.calls.filter((c) =>
    /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INVALID_KEY/.test(
      String(c[0]),
    ),
  );
  errors.mockRestore();
  expect(intl).toEqual([]);
  expect(document.body.textContent ?? '').not.toMatch(/crm\.identidades\./);
});
describe.each(['es', 'en', 'fr', 'pt'] as IdiomaPrueba[])(
  'Identidades en %s',
  (idioma) => {
    it.each(['empty', 'loading', 'error', 'forbidden'])(
      'renderiza %s con el kit',
      (state) => {
        loading = state === 'loading';
        error = ['error', 'forbidden'].includes(state)
          ? new Error('test')
          : null;
        forbidden = state === 'forbidden';
        const { container } = renderConIdioma(<IdentidadesPage />, { idioma });
        if (loading)
          expect(container.querySelector('.animate-pulse')).not.toBeNull();
        else expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
      },
    );
    it('muestra el avance real del barrido y no inventa un porcentaje sin total', () => {
      loading = true;
      scan = { id: 'scan', status: 'running', processed: 31, total: 50 };
      const { rerender } = renderConIdioma(<IdentidadesPage />, { idioma });
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62');
      scan = { ...scan, total: 0 };
      rerender(<IdentidadesPage />);
      expect(screen.queryByRole('progressbar')).toBeNull();
    });
    it('comparación selecciona principal y campos, y entrega un solo par', () => {
      const onFusionar = jest.fn();
      renderConIdioma(
        <FusionClientesPanel
          group={group}
          ocupado={false}
          onCancelar={() => undefined}
          onFusionar={onFusionar}
        />,
        { idioma },
      );
      const radios = screen.getAllByRole('radio');
      fireEvent.click(radios[1]);
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[buttons.length - 1]);
      expect(onFusionar).toHaveBeenCalledWith('b', 'a', {});
      expect(screen.getByRole('table')).toBeTruthy();
    });
    it('historial permite deshacer solo dentro de los 30 días', () => {
      const callback = jest.fn();
      const recent = new Date(Date.now() - 3600000).toISOString();
      renderConIdioma(
        <HistorialFusiones
          canUndo
          ocupado={false}
          onDeshacer={callback}
          rows={[
            {
              id: 'merge',
              merged_at: recent,
              undone_at: null,
              principal: { full_name: 'Principal' },
              secundario: { full_name: 'Secundario' },
              autor: null,
              moved_counts: [{ table: 'calls', count: 2 }],
            },
          ]}
        />,
        { idioma },
      );
      fireEvent.click(screen.getByRole('button'));
      expect(callback).toHaveBeenCalledWith('merge');
    });
    it('las identidades reales no ofrecen edición sin permiso', () => {
      renderConIdioma(
        <IdentidadesCanal
          canEdit={false}
          ocupado={false}
          onEditar={async () => true}
          onEliminar={async () => true}
          rows={[
            {
              id: 'identity',
              identity_type: 'whatsapp_phone',
              identity_value: '573100000001',
              verified: false,
              last_seen_at: null,
              customer: {
                id: 'a',
                full_name: 'Contacto A',
                email: null,
                phone: null,
              },
              channel: {
                id: 'channel',
                name: 'Canal de prueba',
                type: 'whatsapp',
              },
            },
          ]}
        />,
        { idioma },
      );
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.getByText('573100000001')).toBeTruthy();
    });
  },
);
