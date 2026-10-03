/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PhoneMirror } from '../desktop/PhoneMirror';
import type { PhoneSnapshot } from '../../../../electron/src/shared/phoneProtocol';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';
jest.mock('../dock/usePhoneContext', () => ({ usePhoneContext: () => ({ key: '', contact: null, line: null }) }));
const state: PhoneSnapshot = { scope: '11111111-1111-4111-8111-111111111111', revision: 1, organizationId: 1,
  deviceState: 'registered', reason: null, callStatus: 'idle', call: null, incoming: false, muted: false, recording: false };
let receive: (next: PhoneSnapshot | null) => void;
const unsubscribe = jest.fn(); const command = jest.fn();
beforeEach(() => {
  command.mockReset(); unsubscribe.mockReset(); command.mockImplementation(async body => ({ id: body.id, ok: true }));
  window.goAdminPhone = { state: async () => state, command, onState: handler => { receive = handler; return unsubscribe; },
    close: jest.fn(), minimize: jest.fn(), pin: async value => value, openMain: jest.fn() };
});
afterEach(() => { cleanup(); delete window.goAdminPhone; });
const renderPhone = () => render(<NextIntlClientProvider locale="es" messages={es}><PhoneMirror /></NextIntlClientProvider>);
it.each([['es', es], ['en', en], ['fr', fr], ['pt', pt]] as const)('renderiza marcador y acciones traducidas en %s', async (locale, messages) => {
  render(<NextIntlClientProvider locale={locale} messages={messages}><PhoneMirror /></NextIntlClientProvider>);
  await waitFor(() => expect(screen.getByText(messages.phoneMirror.device.registered)).toBeTruthy());
  expect(screen.getByLabelText(messages.phoneMirror.number)).toBeTruthy();
  expect(screen.getByRole('button', { name: messages.phoneMirror.pin })).toBeTruthy();
});
it('una llamada se despacha al controlador; un error conserva el número y un doble clic no duplica', async () => {
  let finish: (reply: { id: string; ok: boolean; error: string }) => void = () => undefined;
  command.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  renderPhone(); await waitFor(() => expect(screen.getByLabelText('Número a llamar')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Número a llamar'), { target: { value: '+573000000000' } });
  const dial = screen.getByRole('button', { name: 'Llamar' }); fireEvent.click(dial); fireEvent.click(dial);
  expect(command).toHaveBeenCalledTimes(1);
  expect(command.mock.calls[0][0]).toMatchObject({ scope: state.scope, revision: 1, action: 'dial', value: '+573000000000' });
  await act(async () => finish({ id: command.mock.calls[0][0].id, ok: false, error: 'numero_invalido' }));
  expect((screen.getByLabelText('Número a llamar') as HTMLInputElement).value).toBe('+573000000000');
  expect(screen.getByRole('alert').textContent).toContain('Escribe un número válido');
});
it('cambio de organización y desconexión limpian número/identidad y bloquean nuevas acciones', async () => {
  renderPhone(); await waitFor(() => expect(screen.getByLabelText('Número a llamar')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Número a llamar'), { target: { value: '+573000000000' } });
  act(() => receive({ ...state, scope: '22222222-2222-4222-8222-222222222222', organizationId: 2 }));
  expect((screen.getByLabelText('Número a llamar') as HTMLInputElement).value).toBe('');
  act(() => receive(null));
  expect(screen.getByText('Teléfono desconectado')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Llamar' })).toBeNull();
});
it('REC depende de estado real y DTMF no se anuncia si el controlador rechaza', async () => {
  renderPhone(); await waitFor(() => expect(screen.getByLabelText('Número a llamar')).toBeTruthy());
  act(() => receive({ ...state, callStatus: 'connected', recording: true, call: { number: '+573000000000', displayName: null, connectedAt: Date.now() } }));
  expect(screen.getByText('REC')).toBeTruthy();
  command.mockResolvedValue({ id: 'prueba', ok: false, error: 'estado_desactualizado' });
  fireEvent.click(screen.getByRole('button', { name: 'Teclado DTMF' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar 1' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect((screen.getByLabelText('Dígitos enviados') as HTMLInputElement).value).toBe('');
});
