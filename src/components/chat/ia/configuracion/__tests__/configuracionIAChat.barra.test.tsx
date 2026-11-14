/**
 * @jest-environment jsdom
 */
/**
 * Configuración › Chat › IA dentro del diálogo (Figma 92-config-dialogo-01):
 * el panel registra sus cambios en la barra del diálogo («N cambios sin
 * guardar · Descartar · Guardar cambios») y no pinta la suya; fuera del
 * diálogo conserva su propia barra. Qué se guarda no cambia.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CambiosContext, type CambiosPanel } from '@/components/configuracion/dialogo/cambiosSinGuardar';

const mockUpdate = jest.fn();
const AJUSTES = {
  provider: 'openai',
  model: 'gpt-5.6-luna',
  temperature: 0.7,
  max_tokens: 500,
  max_fragments_context: 5,
  tone: 'professional',
  language: 'es',
  system_rules: 'Sé breve.',
  fallback_message: 'Un asesor te escribe pronto.',
  auto_response_enabled: true,
  auto_response_delay_seconds: 5,
  confidence_threshold: 0.7,
  is_active: true,
};

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
const mockToast = { toast: jest.fn() };
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => mockToast }));
const mockOrg = { organization: { id: 120 } };
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => mockOrg }));
jest.mock('@/lib/services/aiSettingsService', () =>
  jest.fn().mockImplementation(() => ({
    getSettings: async () => ({ ...AJUSTES }),
    getChannels: async () => [],
    updateSettings: (...a: unknown[]) => mockUpdate(...a),
  })),
);
// Las piezas de cada pestaña: un control por ajuste basta para la barra.
jest.mock('@/components/chat/ia/configuracion', () => ({
  AISettingsHeader: () => null,
  ChannelAIModeTable: () => null,
  BehaviorSettings: () => null,
  ModelSettings: ({ temperature, onTemperatureChange }: { temperature: number; onTemperatureChange: (v: number) => void }) => (
    <label>
      creatividad
      <input type="number" value={temperature} onChange={(e) => onTemperatureChange(Number(e.target.value))} />
    </label>
  ),
}));

import { ConfiguracionIAChat } from '../ConfiguracionIAChat';

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue(undefined);
});

test('en el diálogo: registra los cambios en la barra del diálogo y no pinta la suya', async () => {
  const registros: (CambiosPanel | null)[] = [];
  const registrar = jest.fn((c: CambiosPanel | null) => registros.push(c));
  render(
    <CambiosContext.Provider value={registrar}>
      <ConfiguracionIAChat />
    </CambiosContext.Provider>,
  );
  const campo = await screen.findByRole('spinbutton', { name: 'creatividad' });
  await waitFor(() => expect((campo as HTMLInputElement).value).toBe('0.7'));
  const ultimo = () => registros[registros.length - 1];
  expect(ultimo()?.cambios).toBe(0);

  fireEvent.change(campo, { target: { value: '0.3' } });
  await waitFor(() => expect(ultimo()?.cambios).toBe(1));
  expect(screen.queryByText('Tienes cambios sin guardar')).toBeNull();

  // Volver al valor guardado ya no es un cambio.
  fireEvent.change(campo, { target: { value: '0.7' } });
  await waitFor(() => expect(ultimo()?.cambios).toBe(0));

  // «Descartar» de la barra devuelve lo guardado.
  fireEvent.change(campo, { target: { value: '1' } });
  await waitFor(() => expect(ultimo()?.cambios).toBe(1));
  act(() => ultimo()!.descartar());
  await waitFor(() => expect((campo as HTMLInputElement).value).toBe('0.7'));

  // «Guardar» de la barra guarda lo mismo y por el mismo servicio que antes.
  fireEvent.change(campo, { target: { value: '0.3' } });
  await waitFor(() => expect(ultimo()?.cambios).toBe(1));
  await act(async () => {
    await ultimo()!.guardar();
  });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.3, model: 'gpt-5.6-luna', system_rules: 'Sé breve.', is_active: true }));
});

test('fuera del diálogo: conserva su propia barra', async () => {
  render(<ConfiguracionIAChat />);
  const campo = await screen.findByRole('spinbutton', { name: 'creatividad' });
  await waitFor(() => expect((campo as HTMLInputElement).value).toBe('0.7'));
  fireEvent.change(campo, { target: { value: '0.3' } });
  expect(await screen.findByText('Tienes cambios sin guardar')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
  await waitFor(() => expect(screen.queryByText('Tienes cambios sin guardar')).toBeNull());
});
