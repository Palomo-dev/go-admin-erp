/** @jest-environment jsdom */
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { Keypad } from '../dock/Keypad';
import { usePhoneContext } from '../dock/usePhoneContext';

let mockOrganizationId = 7;
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: mockOrganizationId } }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ loadOrgDefaultCountry: async () => '1' }));
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); mockOrganizationId = 7; });

it('un clic físico escribe un dígito, mantener cero escribe + y DTMF táctil envía una sola vez', () => {
  jest.useFakeTimers();
  const digit = jest.fn();
  function Dialer({ dtmf = false }: { dtmf?: boolean }) { const [value, setValue] = useState(''); return <Keypad diseno="kit" value={value} onChange={setValue} onSubmit={jest.fn()} dtmfMode={dtmf} onDigit={digit} />; }
  const view = renderConIdioma(<Dialer />);
  const two = screen.getByRole('button', { name: 'Tecla 2 (ABC)' });
  fireEvent.mouseDown(two); fireEvent.mouseUp(two); fireEvent.click(two);
  expect((screen.getByRole('textbox', { name: 'Número a llamar' }) as HTMLInputElement).value).toBe('2');
  const zero = screen.getByRole('button', { name: 'Tecla 0 (+)' });
  fireEvent.mouseDown(zero); act(() => { jest.advanceTimersByTime(501); }); fireEvent.mouseUp(zero); fireEvent.click(zero);
  expect((screen.getByRole('textbox', { name: 'Número a llamar' }) as HTMLInputElement).value).toBe('2+');
  view.unmount();
  renderConIdioma(<Dialer dtmf />);
  const key = screen.getByRole('button', { name: 'Enviar 3' });
  fireEvent.touchStart(key); fireEvent.touchEnd(key);
  expect(digit).toHaveBeenCalledTimes(1); expect(digit).toHaveBeenCalledWith('3');
  expect((screen.getByRole('textbox', { name: 'Dígitos DTMF' }) as HTMLInputElement).value).toBe('3');
});

it('una respuesta tardía nunca atribuye el cliente de otra organización o número', async () => {
  jest.useFakeTimers();
  const replies: Array<(response: Response) => void> = [];
  global.fetch = jest.fn(() => new Promise<Response>(done => replies.push(done)));
  const hook = renderHook(({ number }) => usePhoneContext(number, null, true), { initialProps: { number: '+12025550197' } });
  await act(async () => { jest.advanceTimersByTime(251); });
  expect(replies).toHaveLength(1);
  mockOrganizationId = 8; hook.rerender({ number: '+12025550198' });
  expect(hook.result.current.contact).toBeNull();
  await act(async () => { replies[0]({ ok: true, json: async () => ({ data: [{ id: 'old', first_name: 'Antiguo', phone: '+12025550197' }] }) } as Response); jest.advanceTimersByTime(251); });
  expect(hook.result.current.contact).toBeNull();
  await act(async () => { replies[1]({ ok: true, json: async () => ({ data: [{ id: 'current', first_name: 'Actual', phone: '+12025550198' }] }) } as Response); });
  expect(hook.result.current.contact?.id).toBe('current');
});

it('dos clientes con el mismo teléfono no se atribuyen al primero de la búsqueda', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'a', phone: '+12025550197' }, { id: 'b', phone: '+12025550197' }] }) })) as unknown as typeof fetch;
  const hook = renderHook(() => usePhoneContext('+12025550197', null, true));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(hook.result.current.key).toContain('7:+12025550197'));
  expect(hook.result.current.contact).toBeNull();
});

it('reconoce un número nacional con el indicativo canónico de la organización', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'a', first_name: 'Nacional', phone: '2025550197' }] }) })) as unknown as typeof fetch;
  const hook = renderHook(() => usePhoneContext('+12025550197', null, true));
  await waitFor(() => expect(hook.result.current.contact?.id).toBe('a'));
});
