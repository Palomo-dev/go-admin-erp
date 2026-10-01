/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { CampanasPage } from '../CampanasPage';
import { CampanasService } from '../CampanasService';
import { ApiError } from '@/components/crm/whatsapp/api';
import type { CampanasRespuesta } from '../useCampanasData';
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }) }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('../useCampanasData', () => ({ useCampanasData: () => ({ loading: false, error: false, forbidden: false, data }) }));
jest.mock('../CampanasService', () => ({ CampanasService: { deleteCampaign: jest.fn() } }));
jest.mock('../CampanasTable', () => ({ CampanasTable: ({ onAction }: { onAction: (row: object, action: string) => void }) =>
  <button onClick={() => onAction(data.rows[0], 'delete')}>acción de archivo</button> }));
const data: CampanasRespuesta = { total: 1, canManage: true, rows: [{
  id: 'fixture', name: 'Campaña de ejemplo', source: 'message', channel: 'whatsapp', status: 'draft',
  segmentName: '', contentName: null, scheduledAt: null, createdAt: '2026-10-01T00:00:00Z', stoppedReason: null,
  blockedReasons: [], progress: { done: 0, total: 0, pct: 0 }, result: { delivered: 0, read: 0, replied: 0 },
}] };
const labels = {
  es: ['Eliminar', 'Su historial se conserva.', 'conciliación', 'fue modificada'],
  en: ['Delete', 'Its history is preserved.', 'reconciliation', 'has changed'],
  fr: ['Supprimer', 'Son historique est conservé.', 'rapprochement', 'a été modifiée'],
  pt: ['Excluir', 'Seu histórico será preservado.', 'conciliação', 'foi modificada'],
};
beforeEach(() => jest.mocked(CampanasService.deleteCampaign).mockReset());
describe.each<IdiomaPrueba>(['es', 'en', 'fr', 'pt'])('archivo en %s', idioma => {
  test.each(['RECONCILIATION_REQUIRED', 'CAMPAIGN_MODIFIED'])('explica %s y mantiene el diálogo abierto', async code => {
    jest.mocked(CampanasService.deleteCampaign).mockRejectedValue(new ApiError('mensaje de servidor', code, 409));
    renderConIdioma(<CampanasPage />, { idioma });
    fireEvent.click(screen.getByRole('button', { name: 'acción de archivo' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(labels[idioma][1]);
    fireEvent.click(screen.getByRole('button', { name: labels[idioma][0] }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(labels[idioma][code === 'RECONCILIATION_REQUIRED' ? 2 : 3]));
    expect(CampanasService.deleteCampaign).toHaveBeenCalledWith('fixture');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(dialog.textContent).not.toContain('mensaje de servidor');
  });
});
