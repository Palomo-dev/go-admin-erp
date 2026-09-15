/**
 * `getAccountCapabilities` y la caducidad de las cachés de `voiceLibraryService`
 * (ronda 3 de Voces: el tester no encontró NINGUNA prueba de ninguna de las dos).
 *
 * Sin red: el cliente de ElevenLabs se dobla; `Date.now` se controla para que
 * el TTL caduque de verdad y no por esperar.
 */

const mockClient = {
  getSubscription: jest.fn(),
  listSharedVoices: jest.fn(),
};
const mockGetClient = jest.fn(async () => mockClient);

jest.mock('@/lib/services/crm/voiceCatalogService', () => ({
  listVoices: jest.fn(),
  createVoice: jest.fn(),
  deleteVoice: jest.fn(),
}));

jest.mock('@/lib/services/integrations/elevenlabs/voiceCloneClient', () => ({
  ElevenLabsError: class extends Error {},
  getElevenLabsClientForOrg: (...args: unknown[]) => mockGetClient(...(args as [])),
}));

import { clearVoiceLibraryCaches, getAccountCapabilities, searchLibraryVoices } from '@/lib/services/crm/voiceLibraryService';

const ORG = 120;
let now = 1_700_000_000_000;

beforeEach(() => {
  jest.clearAllMocks();
  clearVoiceLibraryCaches();
  now = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockClient.listSharedVoices.mockResolvedValue({ voices: [], has_more: false, total_count: 0 });
});

afterEach(() => jest.restoreAllMocks());

describe('getAccountCapabilities: free, de pago y fallo', () => {
  test('plan free → free_tier y sin clonación, tal cual lo dice el proveedor', async () => {
    mockClient.getSubscription.mockResolvedValue({ tier: 'free', can_use_instant_voice_cloning: false });
    expect(await getAccountCapabilities(ORG)).toEqual({ tier: 'free', free_tier: true, can_clone: false });
  });

  test('plan de pago → no es free y puede clonar solo si el proveedor lo afirma', async () => {
    mockClient.getSubscription.mockResolvedValue({ tier: 'starter', can_use_instant_voice_cloning: true });
    expect(await getAccountCapabilities(ORG)).toEqual({ tier: 'starter', free_tier: false, can_clone: true });
    clearVoiceLibraryCaches();
    mockClient.getSubscription.mockResolvedValue({ tier: 'creator', can_use_instant_voice_cloning: false });
    expect(await getAccountCapabilities(ORG)).toEqual({ tier: 'creator', free_tier: false, can_clone: false });
  });

  test('fallo del proveedor o sin clave → null (no se bloquea nada que no se sepa) y no se cachea', async () => {
    mockGetClient.mockRejectedValueOnce(new Error('sin clave'));
    expect(await getAccountCapabilities(ORG)).toBeNull();
    mockClient.getSubscription.mockRejectedValueOnce(new Error('503'));
    expect(await getAccountCapabilities(ORG)).toBeNull();
    mockClient.getSubscription.mockResolvedValue({ tier: 'free', can_use_instant_voice_cloning: false });
    expect(await getAccountCapabilities(ORG)).not.toBeNull();
    expect(mockClient.getSubscription).toHaveBeenCalledTimes(2);
  });

  test('el plan se cachea por organización', async () => {
    mockClient.getSubscription.mockResolvedValue({ tier: 'free', can_use_instant_voice_cloning: false });
    await getAccountCapabilities(ORG);
    await getAccountCapabilities(ORG);
    await getAccountCapabilities(ORG + 1);
    expect(mockClient.getSubscription).toHaveBeenCalledTimes(2);
  });
});

describe('TTL de las cachés: caducan de verdad', () => {
  test('el plan se vuelve a pedir pasados 10 minutos, no antes', async () => {
    mockClient.getSubscription.mockResolvedValue({ tier: 'free', can_use_instant_voice_cloning: false });
    await getAccountCapabilities(ORG);
    now += 10 * 60 * 1000 - 1;
    await getAccountCapabilities(ORG);
    expect(mockClient.getSubscription).toHaveBeenCalledTimes(1);
    now += 2;
    await getAccountCapabilities(ORG);
    expect(mockClient.getSubscription).toHaveBeenCalledTimes(2);
  });

  test('la biblioteca se vuelve a pedir pasados 5 minutos, no antes', async () => {
    await searchLibraryVoices(ORG, { language: 'es' });
    now += 5 * 60 * 1000 - 1;
    await searchLibraryVoices(ORG, { language: 'es' });
    expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(1);
    now += 2;
    await searchLibraryVoices(ORG, { language: 'es' });
    expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(2);
  });
});
