/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { CallButton } from '../CallButton';

let mockMode = 'browser';
let mockDeviceState = 'registered';
const mockMakeCall = jest.fn();
jest.mock('../SoftphoneProvider', () => ({
  useSoftphone: () => ({ available: true, deviceState: mockDeviceState, callStatus: 'idle', makeCall: mockMakeCall }),
}));
jest.mock('../hooks/useCallModePolicy', () => ({ useCallModePolicy: () => ({ decision: { mode: mockMode } }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => 'CO' }));
jest.mock('next/dynamic', () => () => function PuenteNativo({ open }: { open: boolean }) { return open ? <div role="dialog">Puente nativo</div> : null; });

beforeEach(() => { mockMode = 'browser'; mockDeviceState = 'registered'; mockMakeCall.mockReset(); });

it('el botón del kit envía una sola llamada con las referencias y conserva el atajo', async () => {
  let finish!: (result: { ok: boolean }) => void;
  mockMakeCall.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  renderConIdioma(<CallButton diseno="kit" variant="default" size="default" phoneNumber="+12025550197" customerId="customer-test" opportunityId="opportunity-test" displayName="Contacto de prueba" label="Devolver llamada" />);
  const button = screen.getByRole('button', { name: /Llamar a Contacto de prueba/ });
  expect(button.dataset.phone).toBe('+12025550197');
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mockMakeCall).toHaveBeenCalledTimes(1);
  expect(mockMakeCall).toHaveBeenCalledWith('+12025550197', { customerId: 'customer-test', opportunityId: 'opportunity-test', displayName: 'Contacto de prueba' });
  finish({ ok: true });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
});

it('el modo móvil conserva el puente aunque el dispositivo de navegador no esté registrado', () => {
  mockMode = 'mobile'; mockDeviceState = 'unregistered';
  renderConIdioma(<CallButton diseno="kit" phoneNumber="+12025550197" label="Llamar" />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('dialog').textContent).toContain('Puente nativo');
  expect(mockMakeCall).not.toHaveBeenCalled();
});
