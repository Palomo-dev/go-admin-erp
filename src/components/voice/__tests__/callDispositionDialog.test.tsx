/** @jest-environment jsdom */
/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../../../../messages/es.json';
import { CallDispositionDialog } from '../CallDispositionDialog';
import type { EndedCallInfo } from '../SoftphoneProvider';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'America/Bogota', isLoading: false }) }));
jest.mock('../dock/DispositionDueField', () => ({ DispositionDueField: ({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) => <input type="datetime-local" aria-label="Fecha de la próxima acción" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} /> }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

const ended = { callId: '11111111-1111-4111-8111-111111111111', callSid: 'CAprueba', durationSeconds: 60, displayName: 'Contacto', number: '3000000000', liveNote: 'Nota inicial' } as EndedCallInfo;
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

it('mantiene la misma intención al reintentar y crea otra clave al cambiar la nota', async () => {
  const fetch = jest.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    expect(String(url)).toContain('/api/crm/calls/');
    expect(options?.method).toBe('PATCH');
    return { ok: false, status: 500, json: async () => ({ error: 'Error de prueba' }) };
  });
  global.fetch = fetch as unknown as typeof global.fetch;
  const close = jest.fn();
  render(<NextIntlClientProvider locale="es" messages={messages}><CallDispositionDialog open ended={ended} onClose={close} /></NextIntlClientProvider>);
  const save = screen.getByRole('button', { name: 'Guardar (Ctrl+Enter)' });
  fireEvent.click(save);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(save);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'Nueva intención' } });
  fireEvent.click(save);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  const bodies = fetch.mock.calls.map((args) => JSON.parse((args[1] as RequestInit).body as string));
  expect(bodies[0].client_key).toBe(bodies[1].client_key);
  expect(bodies[2].client_key).not.toBe(bodies[1].client_key);
  expect(close).not.toHaveBeenCalled();
});

it('envía la fecha de seguimiento en la zona de la organización', async () => {
  const fetch = jest.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
    expect(String(url)).toContain('/api/crm/calls/');
    expect(options?.method).toBe('PATCH');
    return { ok: true, status: 200, json: async () => ({ task_id: 'task-prueba' }) };
  });
  global.fetch = fetch as unknown as typeof global.fetch;
  render(<NextIntlClientProvider locale="es" messages={messages}><CallDispositionDialog open ended={ended} onClose={jest.fn()} /></NextIntlClientProvider>);
  fireEvent.click(screen.getByRole('radio', { name: 'Tarea' }));
  fireEvent.change(screen.getByLabelText('Fecha de la próxima acción'), { target: { value: '2026-10-03T09:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar (Ctrl+Enter)' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const body = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
  expect(Date.parse(body.disposition.next_action.due_at)).toBe(Date.parse('2026-10-03T14:30:00Z'));
});


it('excluir requiere petición explícita, evita doble envío y conserva el cierre hasta éxito', async () => {
  let resolve!: (value: Response) => void;
  const fetch = jest.fn(() => new Promise<Response>(done => { resolve = done; }));
  global.fetch = fetch;
  const close = jest.fn();
  render(<NextIntlClientProvider locale="es" messages={messages}><CallDispositionDialog open ended={ended} onClose={close} /></NextIntlClientProvider>);
  fireEvent.click(screen.getByRole('radio', { name: 'No volver a llamar' }));
  const save = screen.getByRole('button', { name: 'Guardar y excluir número' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter', ctrlKey: true });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'El cliente pidió no recibir más llamadas en esta llamada.' }));
  expect(save.disabled).toBe(false);
  fireEvent.click(save); fireEvent.click(save);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.disposition).toMatchObject({ outcome: 'answered', do_not_call: true, next_action: null });
  resolve({ ok: true, json: async () => ({ data: { metadata: { disposition_do_not_call: true } } }) } as Response);
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
