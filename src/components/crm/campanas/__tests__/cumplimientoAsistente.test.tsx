/** @jest-environment jsdom */
import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { fetchJson } from '@/lib/utils/fetchJson';
import { CampaignCompliancePanel } from '../CampaignCompliancePanel';
jest.mock('@/lib/utils/fetchJson', () => ({ fetchJson: jest.fn() }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDateTime: (v: string) => v }) }));
const version = '2026-10-01T10:00:00.123456+00:00';
const updated = '2026-10-01T10:01:00.123456+00:00';
const uploading = jest.fn();
const check = { id: 'fixture', campaign_updated_at: updated, checked_at: version, valid_until: '2026-10-31T10:00:00Z', numbers_in_file: 1, checked_targets: 1, excluded_targets: 0, skipped_contacts: 0 };
function Formulario() {
  const [expected, setExpected] = useState(version);
  const [allowed, setAllowed] = useState(false);
  return <><CampaignCompliancePanel campaignId="fixture" expectedUpdatedAt={expected} onAllowed={setAllowed}
    onUploadingChange={uploading} onChanged={async value => { setExpected(value.campaign_updated_at!); }} />
    <output data-testid="allowed">{String(allowed)}</output></>;
}
test('subir RNE transmite la versión, actualiza el formulario y libera el bloqueo después de volver a consultar cumplimiento', async () => {
  let verified = false;
  jest.mocked(fetchJson).mockImplementation(async (_url, init) => {
    if (init?.method === 'POST') { verified = true; return { data: check } as never; }
    return { data: { data_policy_url: 'https://example.invalid/politica', data_policy_valid: true,
      rne: verified ? check : null, rne_current: verified, allowed: verified, reason: verified ? null : 'rne_required' }, puede_verificar: true } as never;
  });
  renderConIdioma(<Formulario />);
  await screen.findByRole('button', { name: 'Verificar contra RNE' });
  const file = new File(['3005550142'], 'fixture.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => '3005550142' });
  fireEvent.change(screen.getByLabelText('Archivo del RNE'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByTestId('allowed').textContent).toBe('true'));
  const posted = jest.mocked(fetchJson).mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(JSON.parse(String(posted[1]?.body))).toMatchObject({ expected_updated_at: version, contenido: '3005550142' });
  expect(uploading.mock.calls.map(args => args[0])).toEqual([true, false]);
  expect((screen.getByRole('button', { name: 'Verificar contra RNE' }) as HTMLButtonElement).disabled).toBe(false);
});
