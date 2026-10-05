/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CallControls } from '../CallControls';
import messages from '../../../../../messages/es.json';
import type { PhoneControlResult, PhoneControlState } from '@/lib/services/crm/phoneConferenceTypes';
import type { AudioDevicesState } from '../../hooks/useAudioDevices';
const state: PhoneControlState = { supported: true, phase: 'ready', held: false, heldAt: null, holdSeconds: 0, transfer: null, busy: false, error: null };
const audio = { inputs: [], outputs: [], inputId: null, outputId: null, canSetOutput: false, setInputDevice: jest.fn(), setOutputDevice: jest.fn() } as unknown as AudioDevicesState;
const props = { connectedAt: null, connected: true, recording: false, muted: false, onMute: jest.fn(), onHangup: jest.fn(), showKeypad: false, onToggleKeypad: jest.fn(), audio, onTransfer: jest.fn() };
function draw(control: PhoneControlState, onHold: (held: boolean) => Promise<PhoneControlResult> = jest.fn(async () => ({ ok: true as const, state: control }))) {
  return render(<NextIntlClientProvider locale="es" messages={messages}><CallControls {...props} control={control} onHold={onHold} /></NextIntlClientProvider>);
}
it('espera la respuesta del servidor sin fingir held y bloquea doble click/micrófono', async () => {
  let resolve!: (result: PhoneControlResult) => void;
  const hold = jest.fn(() => new Promise<PhoneControlResult>((done) => { resolve = done; }));
  draw(state, hold); const button = screen.getByRole('button', { name: 'Espera' });
  fireEvent.click(button); fireEvent.click(button);
  expect(hold).toHaveBeenCalledTimes(1); expect(button.getAttribute('aria-pressed')).toBe('false');
  expect((screen.getByRole('button', { name: 'Silenciar' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => resolve({ ok: false, code: 'timeout', message: 'No confirmado' }));
  expect(screen.getByRole('alert').textContent).toBe('No confirmado');
  expect(button.getAttribute('aria-pressed')).toBe('false');
});
it('espera real muestra música, deshabilita micrófono y DTMF, permite transferir y colgar', () => {
  draw({ ...state, phase: 'held', held: true, heldAt: Date.now() - 181000 });
  expect(screen.getByRole('status').textContent).toContain('03:01');
  expect((screen.getByRole('button', { name: 'Silenciar' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Teclado' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Transferir' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Colgar' })); expect(props.onHangup).toHaveBeenCalled();
});
it('llamada heredada declara capability y mantiene acciones reales disponibles', () => {
  draw({ ...state, supported: false });
  expect((screen.getByRole('button', { name: 'Espera' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Silenciar' }) as HTMLButtonElement).disabled).toBe(false);
});

it('consulta mantiene el cliente con música y deja hablar al agente con el destino', () => {
  draw({ ...state, phase: 'consulting', held: true, heldAt: Date.now(), transfer: { mode: 'consult', status: 'connected', toName: 'Agente' } });
  expect((screen.getByRole('button', { name: 'Silenciar' }) as HTMLButtonElement).disabled).toBe(false);
  expect((screen.getByRole('button', { name: 'Teclado' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('tres');
});
