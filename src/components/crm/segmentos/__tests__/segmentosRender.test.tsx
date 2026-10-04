/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { SegmentosPage } from '../SegmentosPage';
import { SegmentoEditor } from '../SegmentoEditor';
import { SegmentoDetallePage } from '../id/SegmentoDetallePage';
import { ConditionBuilder, textToValue } from '@/components/crm/shared/ConditionBuilder';
import { ConditionValue } from '@/components/crm/shared/ConditionValue';
import type { SegmentoRegistro } from '@/lib/services/crm/segmentosAudiencia';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }), useSearchParams: () => null }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }) }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota', getToday: () => '2026-10-01', formatDateTime: () => '01/10/2026 12:00' }) }));
let state: { data: SegmentoRegistro[] | null; loading: boolean; error: ErrorApiCrm | null; canManage: boolean };
jest.mock('../useSegmentosData', () => ({ useSegmentosData: () => state }));
beforeEach(() => { state = { data: [], loading: false, error: null, canManage: true }; });
describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('Segmentos en %s', idioma => {
  test('vacío ofrece crear e importar, con traducciones completas', () => {
    const { container } = renderConIdioma(<SegmentosPage />, { idioma });
    expect(container.querySelector('a[href="/app/crm/segmentos/nuevo"]')).toBeTruthy();
    expect(container.querySelector('a[href="/app/crm/segmentos/nuevo?import=1"]')).toBeTruthy();
    expect(container.textContent).not.toContain('crm.segmentosNuevo');
  });
  test.each(['loading', 'error', 'forbidden'])('estado %s no ofrece mutaciones', mode => {
    state = { data: null, loading: mode === 'loading', error: mode === 'loading' ? null : new ErrorApiCrm(mode === 'forbidden' ? 403 : 500, 'fixture', 'fixture'), canManage: false };
    const { container } = renderConIdioma(<SegmentosPage />, { idioma });
    expect(container.querySelector('a[href="/app/crm/segmentos/nuevo"]')).toBeNull();
    expect(container.textContent).not.toContain('crm.segmentosNuevo');
  });
  test('editar una regla preserva el otro grupo anidado', () => {
    const next = jest.fn();
    const value = { op: 'or', rules: [
      { op: 'and', rules: [{ field: 'customer.city', operator: 'eq', value: 'Fixture' }] },
      { op: 'and', rules: [{ field: 'customer.tags', operator: 'contains', value: 'vip' }] },
    ] };
    const { container } = renderConIdioma(<ConditionBuilder value={value} onChange={next} />, { idioma });
    const input = container.querySelector('input')!; fireEvent.change(input, { target: { value: 'Otra ciudad' } });
    expect(next.mock.calls[0][0].rules[1]).toEqual(value.rules[1]);
    expect(next.mock.calls[0][0].rules[0].rules[0].value).toBe('Otra ciudad');
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(2);
  });
});
test('teléfono y etiquetas numéricas conservan texto; números de salud se convierten', () => {
  expect(textToValue('0300123456', 'eq', 'customer.phone')).toBe('0300123456');
  expect(textToValue('001', 'contains', 'customer.tags')).toBe('001');
  expect(textToValue('55', 'gte', 'customer.health_score')).toBe(55);
});
test('parámetros de búsqueda null mantienen editor y detalle funcionales', () => {
  const editor = renderConIdioma(<SegmentoEditor />);
  expect(editor.container.querySelector('details')?.open).toBe(false);
  expect(editor.container.querySelector('input[maxlength="120"]')).toBeTruthy();
  editor.unmount();
  state = { data: null, loading: true, error: null, canManage: false };
  const detail = renderConIdioma(<SegmentoDetallePage segmentId="private-segment" />);
  expect(detail.container.querySelector('input[maxlength="120"]')).toBeNull();
});
test('fecha de contacto usa el día y la hora de la organización; plazo relativo sigue numérico', () => {
  const next = jest.fn();
  const { container, unmount } = renderConIdioma(<ConditionValue rule={{ field: 'customer.last_contact_at', operator: 'after', value: '2026-10-02T01:30:00Z' }} onChange={next} />);
  expect(container.textContent).toMatch(/1.*oct/i);
  expect(container.textContent).toMatch(/8:30.*p\. m\./);
  expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
  expect(container.textContent).not.toContain('crm.kit.');
  unmount();
  renderConIdioma(<ConditionValue rule={{ field: 'customer.last_contact_at', operator: 'within_days', value: 7 }} onChange={next} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '14' } });
  expect(next).toHaveBeenCalledWith(14);
});
