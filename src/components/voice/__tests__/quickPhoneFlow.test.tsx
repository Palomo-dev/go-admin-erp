/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { AccionesRapidasCrm } from '@/components/crm/acciones/AccionesRapidasCrm';

const mockMakeCall = jest.fn();
jest.mock('../SoftphoneProvider', () => ({ useSoftphone: () => ({ available: true, deviceState: 'registered', makeCall: mockMakeCall }) }));
jest.mock('../hooks/useCallModePolicy', () => ({ useCallModePolicy: () => ({ decision: { mode: 'browser' } }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => 'CO' }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota', getToday: () => '2026-10-02' }) }));
jest.mock('@/components/crm/kit/ActivityDialog', () => ({ ActivityDialog: ({ abierto }: { abierto: boolean }) => abierto ? <div role="dialog" aria-label="Registro manual" /> : null }));
jest.mock('next/dynamic', () => () => () => null);

beforeEach(() => { mockMakeCall.mockReset(); });

it('llamar desde la ficha abre tres modos; el teléfono conserva un único cierre', async () => {
  mockMakeCall.mockResolvedValue({ ok: true });
  const view = renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="cliente-prueba" oportunidadId="oportunidad-prueba" cliente={{ id: 'cliente-prueba', full_name: 'Contacto de prueba', phone: '+12025550197' }} />);
  fireEvent.click(view.container.querySelector<HTMLButtonElement>('button[data-accion="llamar"]')!);
  const menu = await screen.findByRole('dialog');
  expect(menu.querySelectorAll('button')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: /Desde el navegador/ }));
  await waitFor(() => expect(mockMakeCall).toHaveBeenCalledTimes(1));
  expect(mockMakeCall).toHaveBeenCalledWith('+12025550197', { customerId: 'cliente-prueba', opportunityId: 'oportunidad-prueba', displayName: 'Contacto de prueba' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('el registro manual directo no inicia una llamada ni abre la selección de modos', async () => {
  renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="cliente-prueba" cliente={{ id: 'cliente-prueba', full_name: 'Contacto de prueba' }} sinBarra abrirAccion={{ accion: 'llamar', clave: 1, modoLlamada: 'registrar' }} />);
  expect(await screen.findByRole('dialog', { name: 'Registro manual' })).toBeTruthy();
  expect(mockMakeCall).not.toHaveBeenCalled();
});

it('un precheck rechazado conserva los modos y no abre registro manual', async () => {
  mockMakeCall.mockResolvedValue({ ok: false, reason: 'config' });
  const view = renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="cliente-prueba" cliente={{ id: 'cliente-prueba', full_name: 'Contacto de prueba', phone: '+12025550197' }} />);
  fireEvent.click(view.container.querySelector<HTMLButtonElement>('button[data-accion="llamar"]')!);
  fireEvent.click(await screen.findByRole('button', { name: /Desde el navegador/ }));
  await waitFor(() => expect(mockMakeCall).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('dialog', { name: 'Registro manual' })).toBeNull();
  expect(screen.getByRole('dialog')).toBeTruthy();
});
