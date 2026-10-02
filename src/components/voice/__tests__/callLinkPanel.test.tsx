/** @jest-environment jsdom */
/// <reference types="jest" />
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { CallLinkPanel } from '../CallLinkPanel';
import { fetchJson } from '@/lib/utils/fetchJson';

jest.mock('@/lib/utils/fetchJson', () => ({ fetchJson: jest.fn() }));
jest.mock('@/components/crm/shared/useCrmLookups', () => ({ useCrmLookups: () => ({ pipelines: [], stages: [], loading: false }) }));
jest.mock('@/components/ui/phone-input', () => ({
  PhoneInput: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) =>
    <input aria-label="Teléfono" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />,
}));

const props = { callId: '11111111-1111-4111-8111-111111111111', customerId: null, opportunityId: null,
  phoneNumber: '+573001112233', onLinked: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function openForm() {
  render(<CallLinkPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Crear cliente' }));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cliente' } });
}

it('reintento conserva intención; un cambio de contenido genera otra y el formulario se cierra tras éxito', async () => {
  (fetchJson as jest.Mock).mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({});
  openForm();
  const save = screen.getByRole('button', { name: 'Crear y vincular' });
  fireEvent.click(save);
  await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(save);
  await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Cliente actualizado' } });
  fireEvent.click(save);
  await waitFor(() => expect(props.onLinked).toHaveBeenCalledTimes(1));
  const bodies = (fetchJson as jest.Mock).mock.calls.map((call) => JSON.parse(call[1].body as string));
  expect(bodies[0].idempotency_key).toBe(bodies[1].idempotency_key);
  expect(bodies[2].idempotency_key).not.toBe(bodies[1].idempotency_key);
  expect(screen.queryByRole('button', { name: 'Crear y vincular' })).toBeNull();
});

it('una petición pendiente impide doble envío, edición y cierre del formulario', async () => {
  let rejectPending: (reason: Error) => void = () => undefined;
  (fetchJson as jest.Mock).mockImplementation(() => new Promise((_resolve, reject) => { rejectPending = reject; }));
  openForm();
  fireEvent.click(screen.getByRole('button', { name: 'Crear y vincular' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardando…' }));
  expect(fetchJson).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText('Nombre') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('Teléfono') as HTMLInputElement).disabled).toBe(true);
  const cancel = screen.getByRole('button', { name: 'Cancelar' });
  expect((cancel as HTMLButtonElement).disabled).toBe(true);
  rejectPending(new Error('Error de prueba'));
  await waitFor(() => expect((cancel as HTMLButtonElement).disabled).toBe(false));
  expect(props.onLinked).not.toHaveBeenCalled();
});
