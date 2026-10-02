/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TransferPanel } from '../dock/TransferPanel';
import type { PhoneControlState } from '@/lib/services/crm/phoneConferenceTypes';
import es from '../../../../messages/es.json'; import en from '../../../../messages/en.json'; import fr from '../../../../messages/fr.json'; import pt from '../../../../messages/pt.json';
const state: PhoneControlState = { supported: true, phase: 'ready', held: false, heldAt: null, holdSeconds: 0, transfer: null, busy: false, error: null };
const team = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Agente disponible', available: true, busy: false, mode: 'browser' }, { id: '22222222-2222-4222-8222-222222222222', name: 'Agente ocupado', available: true, busy: true, mode: 'mobile' }];
const onTransfer = jest.fn(), onConfirm = jest.fn(), onCancel = jest.fn();
function mount(locale='es', s=state) { const messages = { es, en, fr, pt }[locale as 'es']; return render(<NextIntlClientProvider locale={locale} messages={messages}><TransferPanel state={s} onTransfer={onTransfer} onConfirm={onConfirm} onCancel={onCancel} onClose={jest.fn()} /></NextIntlClientProvider>); }
beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ data: team }) }); onTransfer.mockResolvedValue({ ok: false, reason: 'provider', message: 'Proveedor indisponible' }); });
afterEach(cleanup);
it.each(['es','en','fr','pt'])('renderiza en %s presencia real y deshabilita miembros ocupados', async locale => { mount(locale); await waitFor(() => expect(screen.getByText('Agente disponible')).toBeTruthy()); expect((screen.getByText('Agente ocupado').closest('button') as HTMLButtonElement).disabled).toBe(true); expect(screen.getByRole('region', { hidden: true })).toBeTruthy(); });
it('envía la identidad seleccionada una sola vez y conserva el error real', async () => {
  let finish: (v: unknown) => void = () => {}; onTransfer.mockImplementation(() => new Promise(resolve => { finish = resolve; })); mount(); await waitFor(() => expect(screen.getByText('Agente disponible')).toBeTruthy());
  fireEvent.click(screen.getByText('Agente disponible')); const button = screen.getByRole('button', { name: 'Transferir' }); fireEvent.click(button); fireEvent.click(button);
  expect(onTransfer).toHaveBeenCalledTimes(1); expect(onTransfer).toHaveBeenCalledWith({ userId: team[0].id }, 'direct'); finish({ ok: false, reason: 'provider', message: 'Proveedor indisponible' });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Proveedor indisponible'));
});
it('confirmar consulta requiere destino conectado', async () => {
  const v=mount('es', { ...state, phase: 'consulting', transfer: { mode: 'consult', status: 'dialing', toName: 'Agente disponible' } });
  expect((screen.getByRole('button', { name: 'Confirmar transferencia' }) as HTMLButtonElement).disabled).toBe(true); v.unmount(); mount('es', { ...state, phase: 'consulting', transfer: { mode: 'consult', status: 'connected', toName: 'Agente disponible' } });
  onConfirm.mockResolvedValue({ ok: true, state: { ...state, phase: 'ended' } }); fireEvent.click(screen.getByRole('button', { name: 'Confirmar transferencia' })); await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
});
