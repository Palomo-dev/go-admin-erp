/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { CampanaDetallePage } from '../id/CampanaDetallePage';
import { CampaignCompliancePanel } from '../CampaignCompliancePanel';
import { fetchJson } from '@/lib/utils/fetchJson';
import type { CampaignStatsResult } from '@/components/crm/whatsapp/api';
import type { Campaign } from '../types';

jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }) }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDateTime: () => '01/10/2026 10:00' }) }));
jest.mock('@/lib/utils/fetchJson', () => ({ fetchJson: jest.fn() }));
jest.mock('../CampanasService', () => ({ CampanasService: { csvUrl: (id: string) => `/api/crm/campaigns/${id}/contacts?export=csv` } }));
jest.mock('../id/CampaignContactsTable', () => ({ CampaignContactsTable: () => <div>Contactos</div> }));
let state: { campaign: Campaign | null; stats: CampaignStatsResult | null; loading: boolean; error: boolean; forbidden: boolean; notFound: boolean; canManage: boolean; load: jest.Mock };
jest.mock('../id/useDetalleCampana', () => ({ useDetalleCampana: () => state }));
const stats = (): CampaignStatsResult => ({ counts: { total: 25000, pending: 4000, queued: 1000, sent: 15000, delivered: 12000, read: 10000, replied: 5000, failed: 4000, skipped: 1000, cost: 10 },
  by_error_code: {}, by_skip_reason: {}, timeline: [], estimated_cost: 15, actual_cost: null, known_actual_cost: 10, actual_cost_complete: false, unpriced_contacts: 3000 });
const campaign = (): Campaign => ({ id: 'fixture', organization_id: 120, name: 'Campaña de ejemplo', channel: 'whatsapp', status: 'draft', effective_status: 'draft',
  scheduled_at: '2026-10-01T15:00:00Z', template_id: null, segment_id: null, content: 'Texto', statistics: { total_contacts: 100, materialized_at: '2026-10-01T00:00:00Z' }, created_by: null, created_at: '', updated_at: '' });
const compliance = (allowed = false, canVerify = true) => ({ puede_verificar: canVerify, data: { data_policy_url: allowed ? 'https://example.invalid/politica' : null,
  data_policy_valid: allowed, rne_current: allowed, allowed, reason: allowed ? null : 'data_policy_required', rne: allowed ? {
    id: 'check', checked_at: '2026-10-01T00:00:00Z', valid_until: '2026-10-31T00:00:00Z', numbers_in_file: 6000, checked_targets: 6002, excluded_targets: 2, skipped_contacts: 2,
  } : null } });
beforeEach(() => {
  jest.mocked(fetchJson).mockReset(); jest.mocked(fetchJson).mockResolvedValue(compliance());
  state = { campaign: campaign(), stats: stats(), canManage: true, loading: false, error: false, forbidden: false, notFound: false, load: jest.fn(async () => undefined) };
});

describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('campaña de mensajes en %s', idioma => {
  test('cifras completas, subtotal, fecha de organización, CSV y bloqueo hasta constancia real', async () => {
    const { container } = renderConIdioma(<CampanaDetallePage campaignId="fixture" />, { idioma });
    await screen.findByRole('button', { name: /RNE/ });
    expect(container.textContent).not.toContain('crm.campanas');
    expect(container.textContent).toContain('01/10/2026 10:00');
    expect(container.textContent).toMatch(/25[.,\s]?000/);
    expect(container.textContent).toMatch(/20[.,\s]?000/);
    expect(container.textContent).toMatch(/3[.,\s]?000/);
    expect(container.querySelector('a[href="/api/crm/campaigns/fixture/contacts?export=csv"]')).toBeTruthy();
    const buttons = Array.from(container.querySelectorAll('button')).filter(button => /Activ|Ativ|Activer/.test(button.textContent ?? ''));
    expect(buttons.length).toBeGreaterThan(0); expect(buttons.every(button => button.disabled)).toBe(true);
  });
  test.each(['loading', 'error', 'forbidden', 'notFound'] as const)('estado %s no publica acciones de gestión ni cifras inventadas', mode => {
    state = { ...state, campaign: null, stats: null, canManage: false, loading: mode === 'loading', error: mode !== 'loading', forbidden: mode === 'forbidden', notFound: mode === 'notFound' };
    const { container } = renderConIdioma(<CampanaDetallePage campaignId="fixture" />, { idioma });
    expect(container.textContent).not.toContain('crm.campanas');
    expect(container.querySelector('a[download]')).toBeNull();
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
  test('cumplimiento de mensajes muestra cantidades reales y no ofrece carga a lectura', async () => {
    jest.mocked(fetchJson).mockResolvedValue(compliance(true, false));
    const { container } = renderConIdioma(<CampaignCompliancePanel campaignId="fixture" />, { idioma });
    await screen.findByText('6000');
    expect(container.textContent).not.toContain('crm.campanas');
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.querySelector('a[href="https://example.invalid/politica"]')).toBeTruthy();
  });
});

test('una carga correcta refresca la constancia y vuelve a habilitar el control', async () => {
  jest.mocked(fetchJson).mockResolvedValueOnce(compliance()).mockResolvedValueOnce({ data: { id: 'check' } }).mockResolvedValueOnce(compliance(true));
  const onAllowed = jest.fn(); const onChanged = jest.fn();
  const { container } = renderConIdioma(<CampaignCompliancePanel campaignId="fixture" onAllowed={onAllowed} onChanged={onChanged} />);
  const input = await waitFor(() => { const node = container.querySelector('input[type="file"]'); expect(node).toBeTruthy(); return node!; });
  const file = new File(['+573001234567'], 'rne.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => '+573001234567' });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  expect(jest.mocked(fetchJson).mock.calls[1]).toEqual(['/api/crm/campaigns/fixture/rne', expect.objectContaining({ method: 'POST', body: JSON.stringify({ nombre_archivo: 'rne.csv', contenido: '+573001234567' }) })]);
  expect(onAllowed.mock.calls.at(-1)).toEqual([true]);
  expect((screen.getByRole('button', { name: 'Verificar contra RNE' }) as HTMLButtonElement).disabled).toBe(false);
});

test('un fallo de lectura no habilita la campaña y permite reintentar', async () => {
  jest.mocked(fetchJson).mockRejectedValue(new Error('network'));
  const onAllowed = jest.fn(); renderConIdioma(<CampaignCompliancePanel campaignId="fixture" onAllowed={onAllowed} />);
  await screen.findByRole('alert'); expect(onAllowed).not.toHaveBeenCalledWith(true);
  expect((screen.getByRole('button', { name: 'Actualizar cumplimiento' }) as HTMLButtonElement).disabled).toBe(false);
});

test('un archivo de más de 8 MB se rechaza antes del POST', async () => {
  const { container } = renderConIdioma(<CampaignCompliancePanel campaignId="fixture" />);
  const input = await waitFor(() => { const node = container.querySelector('input[type="file"]'); expect(node).toBeTruthy(); return node!; });
  const file = new File(['x'], 'rne.csv'); Object.defineProperty(file, 'size', { value: 8 * 1024 * 1024 + 1 });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByRole('alert'); expect(fetchJson).toHaveBeenCalledTimes(1);
});
