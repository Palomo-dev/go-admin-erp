/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba, simularAncho } from '@/test-utils/renderConIdioma';
import { CampaignContactsTable } from '../id/CampaignContactsTable';
import { CampanasService } from '../CampanasService';
import { ApiError } from '@/components/crm/whatsapp/api';
import type { CampaignContact } from '../types';
jest.mock('../CampanasService', () => ({ CampanasService: { contacts: jest.fn() } }));
const formatDateTime = jest.fn((value: string | null) => value ? '01/10/2026 10:00' : '—');
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDateTime }) }));
const row = (): CampaignContact => ({ id: 'contact', campaign_id: 'fixture', customer_id: 'customer', state: 'sent', sent_at: '2026-10-01T15:00:00Z', replied_at: null,
  opened_at: null, clicked_at: null, bounced_at: null, created_at: '2026-10-01T14:00:00Z', updated_at: '2026-10-01T15:00:00Z',
  metadata: { state: 'delivered', delivered_at: '2026-10-01T10:05:00-05:00', opportunity_id: 'opportunity' },
  customer: { id: 'customer', full_name: 'Contacto de ejemplo', first_name: 'Contacto', phone: '+573001234567', email: null } });
beforeEach(() => { jest.mocked(CampanasService.contacts).mockReset(); jest.mocked(CampanasService.contacts).mockResolvedValue({ data: [row()], total: 6002 }); simularAncho(1440); });
describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('contactos en %s', idioma => {
  test('pagina el total del servidor y muestra fecha con offset por el hook de organización', async () => {
    const { container } = renderConIdioma(<CampaignContactsTable campaignId="fixture" />, { idioma });
    await screen.findAllByText('Contacto de ejemplo');
    expect(container.textContent).not.toContain('crm.campanas');
    expect(formatDateTime).toHaveBeenCalledWith('2026-10-01T10:05:00-05:00');
    expect(container.querySelector('a[href="/app/crm/oportunidades/opportunity"]')).toBeTruthy();
    expect(CampanasService.contacts).toHaveBeenCalledWith('fixture', expect.objectContaining({ page: 1, pageSize: 50 }), expect.any(AbortSignal));
    expect(container.textContent).toMatch(/6[.,\s]?002/);
  });
  test('tarjetas móviles conservan nombre, estado, fecha y conexión comercial', async () => {
    simularAncho(390);
    const { container } = renderConIdioma(<CampaignContactsTable campaignId="fixture" />, { idioma });
    await screen.findAllByText('Contacto de ejemplo');
    expect(container.querySelector('article')).toBeTruthy();
    expect(container.textContent).not.toContain('crm.campanas');
  });
});

test('un fallo no se presenta como audiencia vacía; reintentar vuelve a consultar', async () => {
  jest.mocked(CampanasService.contacts).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: [row()], total: 1 });
  renderConIdioma(<CampaignContactsTable campaignId="fixture" />);
  await screen.findAllByText('No pudimos cargar los contactos');
  expect(screen.queryByText('Sin contactos')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: /Reintentar/i })[0]);
  await screen.findAllByText('Contacto de ejemplo');
  expect(CampanasService.contacts).toHaveBeenCalledTimes(2);
});

test('un permiso denegado se muestra separado de error y no deja filas anteriores', async () => {
  jest.mocked(CampanasService.contacts).mockRejectedValue(new ApiError('denied', 'ADMIN_REQUIRED', 403));
  renderConIdioma(<CampaignContactsTable campaignId="fixture" />);
  await screen.findAllByText('No tienes permiso para consultar esta campaña');
  expect(screen.queryByText('Contacto de ejemplo')).toBeNull();
});

test('el filtro se envía al servidor y aborta la lectura anterior', async () => {
  const { container } = renderConIdioma(<CampaignContactsTable campaignId="fixture" />);
  await screen.findAllByText('Contacto de ejemplo');
  const firstSignal = jest.mocked(CampanasService.contacts).mock.calls[0][2]!;
  fireEvent.change(container.querySelector('select')!, { target: { value: 'replied' } });
  await waitFor(() => expect(CampanasService.contacts).toHaveBeenLastCalledWith('fixture', expect.objectContaining({ state: 'replied', page: 1 }), expect.any(AbortSignal)));
  expect(firstSignal.aborted).toBe(true);
});
