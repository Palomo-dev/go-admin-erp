/** @jest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { IncomingMobileCall } from '../mobile/IncomingMobileCall';
import { incomingCallPushId } from '../mobile/incomingCallPush';
import { fetchJson } from '@/lib/utils/fetchJson';
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock('@/lib/context/SessionContext', () => ({ useSession: () => ({ session: { user: { id: 'usuario-prueba' } } }) }));
jest.mock('@/lib/utils/fetchJson', () => ({ fetchJson: jest.fn() }));
const events: Record<string, (value: unknown) => void> = {}; const remove = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/utils/mobile', () => ({ isMobile: () => true, getMobilePlugin: () => ({}),
  safeAddListener: async (_plugin: unknown, event: string, callback: (value: unknown) => void) => { events[event] = callback; return { remove }; } }));
const callId = '11111111-1111-4111-8111-111111111111';
const context = { id: callId, status: 'ringing', from_number: '+573000000000', to_number: '+573000000001',
  customer_id: null, customer_name: null, since: null, mobile_invite_state: 'ringing', invitation_mode: 'mobile' };
const push = (org = 1) => ({ data: { type: 'crm_inbound_call', organization_id: String(org), call_id: callId, url: 'https://externo.example', customer_name: 'Nunca confiar' } });
beforeEach(() => { jest.clearAllMocks(); (fetchJson as jest.Mock).mockResolvedValue({ data: context }); });
afterEach(() => cleanup());
function view(messages: typeof es | typeof en | typeof fr | typeof pt = es, locale = 'es', organizationId = 1) {
  return <NextIntlClientProvider locale={locale} messages={messages}><IncomingMobileCall organizationId={organizationId} /></NextIntlClientProvider>;
}
it('ignora organización ajena/UUID inválido y nunca navega a URL suministrada en push', async () => {
  expect(incomingCallPushId(push(2), 1)).toBeNull();
  expect(incomingCallPushId({ data: { ...push().data, call_id: 'inválido' } }, 1)).toBeNull();
  render(view()); await act(async () => events.pushNotificationReceived(push(2)));
  expect(fetchJson).not.toHaveBeenCalled();
  await act(async () => events.pushNotificationActionPerformed({ notification: push() }));
  await waitFor(() => expect(fetchJson).toHaveBeenCalledWith(`/api/voice/inbound/${callId}/context`, expect.anything()));
  expect(screen.queryByText('Nunca confiar')).toBeNull();
  expect(screen.getByText(context.from_number)).toBeTruthy();
});
it.each([['es', es], ['en', en], ['fr', fr], ['pt', pt]] as const)('contexto autorizado se renderiza en %s y contestar no simula audio ni muta el servidor', async (locale, messages) => {
  render(view(messages, locale)); await act(async () => events.pushNotificationReceived(push()));
  await waitFor(() => expect(screen.getByRole('button', { name: messages.phoneMobile.answer })).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: messages.phoneMobile.answer }));
  expect(screen.getByText(messages.phoneMobile.answerHint)).toBeTruthy();
  expect((fetchJson as jest.Mock).mock.calls).toHaveLength(1);
});
it('un rechazo fallido conserva el contexto y solo el éxito cierra la invitación', async () => {
  render(view()); await act(async () => events.pushNotificationReceived(push()));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Rechazar' })).toBeTruthy());
  (fetchJson as jest.Mock).mockRejectedValueOnce(new Error('Sin red'));
  fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo rechazar'));
  expect(screen.getByText(context.from_number)).toBeTruthy();
  (fetchJson as jest.Mock).mockResolvedValueOnce({ success: true });
  fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((fetchJson as jest.Mock).mock.calls[1][0]).toBe(`/api/voice/inbound/${callId}/reject`);
});
it('cambiar organización elimina identidad y listeners de esa sesión', async () => {
  const rendered = render(view()); await act(async () => events.pushNotificationReceived(push()));
  await waitFor(() => expect(screen.getByText(context.from_number)).toBeTruthy());
  rendered.rerender(view(es, 'es', 2));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(remove).toHaveBeenCalledTimes(2);
});
it('no muestra controles PSTN para una invitación browser ni una llamada terminada', async () => {
  (fetchJson as jest.Mock).mockResolvedValue({ data: { ...context, invitation_mode: 'browser', mobile_invite_state: null } });
  render(view()); await act(async () => events.pushNotificationReceived(push()));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.queryByRole('button', { name: 'Contestar en celular' })).toBeNull();
});
