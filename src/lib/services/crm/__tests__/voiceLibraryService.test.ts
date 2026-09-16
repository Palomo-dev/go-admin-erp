/**
 * voiceLibraryService — pruebas del tester del rediseño UX de Voces (2026-09-14).
 *
 * Lo que aquí se comprueba es destructivo o cruza organizaciones, así que no
 * se prueba en vivo: `removeVoice` borra en ElevenLabs (cuenta compartida de
 * plataforma) y la caché de la biblioteca es global al proceso.
 *
 * Sin red: el cliente de ElevenLabs y el catálogo se sustituyen por mocks.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const mockListVoices = jest.fn();
const mockCreateVoice = jest.fn();
const mockDeleteVoice = jest.fn();
const mockClient = {
  listVoices: jest.fn(),
  listSharedVoices: jest.fn(),
  addSharedVoice: jest.fn(),
  deleteVoice: jest.fn(),
  synthesize: jest.fn(),
};
const mockGetClient = jest.fn(async () => mockClient);

jest.mock('@/lib/services/crm/voiceCatalogService', () => ({
  listVoices: (...args: unknown[]) => mockListVoices(...args),
  createVoice: (...args: unknown[]) => mockCreateVoice(...args),
  deleteVoice: (...args: unknown[]) => mockDeleteVoice(...args),
}));

jest.mock('@/lib/services/integrations/elevenlabs/voiceCloneClient', () => {
  class ElevenLabsError extends Error {
    status: number;
    code?: string;
    constructor(status: number, message: string, _detail?: unknown, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    ElevenLabsError,
    getElevenLabsClientForOrg: (...args: unknown[]) => mockGetClient(...(args as [])),
  };
});

import {
  addLibraryVoiceToCatalog,
  clearVoiceLibraryCaches,
  previewCatalogVoice,
  removeVoice,
  searchLibraryVoices,
} from '@/lib/services/crm/voiceLibraryService';
import { ElevenLabsError } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';

const supabase = {} as SupabaseClient;
const ORG = 120;

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'row-1',
  organization_id: ORG,
  provider: 'elevenlabs',
  provider_voice_id: 'VOICE-A',
  name: 'Voz A',
  kind: 'library',
  model_id: 'eleven_flash_v2_5',
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  clearVoiceLibraryCaches();
  mockClient.listVoices.mockResolvedValue([
    { voice_id: 'VOICE-A', name: 'Voz A', category: 'professional', labels: {}, preview_url: 'https://cdn/a.mp3' },
    { voice_id: 'VOICE-CLON', name: 'Clon', category: 'cloned', labels: {}, preview_url: null },
    { voice_id: 'VOICE-PRE', name: 'Premade', category: 'premade', labels: {}, preview_url: 'https://cdn/p.mp3' },
  ]);
});

describe('removeVoice: borra en ElevenLabs solo si nadie más la referencia', () => {
  test('la fila se borra siempre; en el proveedor solo cuando no hay otras referencias', async () => {
    mockListVoices.mockResolvedValue([row()]);
    const count = jest.fn(async () => 0);
    const out = await removeVoice(supabase, ORG, 'row-1', count);
    expect(mockDeleteVoice).toHaveBeenCalledWith(supabase, ORG, 'row-1');
    expect(count).toHaveBeenCalledWith('VOICE-A');
    expect(mockClient.deleteVoice).toHaveBeenCalledWith('VOICE-A');
    expect(out).toEqual({ removed_from_provider: true });
  });

  test('otra organización la referencia → se conserva en el proveedor', async () => {
    mockListVoices.mockResolvedValue([row()]);
    const out = await removeVoice(supabase, ORG, 'row-1', async () => 1);
    expect(mockDeleteVoice).toHaveBeenCalledTimes(1);
    expect(mockClient.deleteVoice).not.toHaveBeenCalled();
    expect(out).toEqual({ removed_from_provider: false });
  });

  test('una voz «premade» del proveedor nunca se intenta borrar allí', async () => {
    mockListVoices.mockResolvedValue([row({ provider_voice_id: 'VOICE-PRE' })]);
    const count = jest.fn(async () => 0);
    const out = await removeVoice(supabase, ORG, 'row-1', count);
    expect(count).not.toHaveBeenCalled();
    expect(mockClient.deleteVoice).not.toHaveBeenCalled();
    expect(out.removed_from_provider).toBe(false);
  });

  test('una voz que el workspace ya no tiene: solo se borra la fila', async () => {
    mockListVoices.mockResolvedValue([row({ provider_voice_id: 'VOICE-DESAPARECIDA' })]);
    const out = await removeVoice(supabase, ORG, 'row-1', async () => 0);
    expect(mockClient.deleteVoice).not.toHaveBeenCalled();
    expect(out.removed_from_provider).toBe(false);
  });

  test('si el conteo de referencias falla, NO se borra en el proveedor (fallo cerrado)', async () => {
    mockListVoices.mockResolvedValue([row()]);
    const out = await removeVoice(supabase, ORG, 'row-1', async () => {
      throw new Error('service role caído');
    });
    expect(mockClient.deleteVoice).not.toHaveBeenCalled();
    expect(out.removed_from_provider).toBe(false);
  });

  test('si el proveedor rechaza el borrado, la fila ya está borrada y se informa false', async () => {
    mockListVoices.mockResolvedValue([row()]);
    mockClient.deleteVoice.mockRejectedValueOnce(new ElevenLabsError(400, 'nope'));
    const out = await removeVoice(supabase, ORG, 'row-1', async () => 0);
    expect(mockDeleteVoice).toHaveBeenCalledTimes(1);
    expect(out.removed_from_provider).toBe(false);
  });

  test('una voz de otro proveedor no toca ElevenLabs', async () => {
    mockListVoices.mockResolvedValue([row({ provider: 'google' })]);
    const count = jest.fn(async () => 0);
    const out = await removeVoice(supabase, ORG, 'row-1', count);
    expect(count).not.toHaveBeenCalled();
    expect(mockGetClient).not.toHaveBeenCalled();
    expect(out.removed_from_provider).toBe(false);
  });

  test('un id que no es de la organización no borra nada', async () => {
    mockListVoices.mockResolvedValue([row()]);
    await expect(removeVoice(supabase, ORG, 'row-de-otra-org', async () => 0)).rejects.toThrow(/no existe/);
    expect(mockDeleteVoice).not.toHaveBeenCalled();
    expect(mockClient.deleteVoice).not.toHaveBeenCalled();
  });

  test('tras borrar en el proveedor, la caché del workspace se invalida', async () => {
    mockListVoices.mockResolvedValue([row()]);
    await removeVoice(supabase, ORG, 'row-1', async () => 0);
    expect(mockClient.listVoices).toHaveBeenCalledTimes(1);
    // Una lectura posterior vuelve al proveedor: no se sirve el mapa viejo con la voz borrada.
    mockListVoices.mockResolvedValue([row({ id: 'row-2', provider_voice_id: 'VOICE-CLON' })]);
    await previewCatalogVoice(supabase, ORG, 'row-2').catch(() => undefined);
    expect(mockClient.listVoices).toHaveBeenCalledTimes(2);
  });
});

describe('searchLibraryVoices: caché de 5 minutos', () => {
  const page = { voices: [{ voice_id: 'v1', public_owner_id: 'o', name: 'Uno' }], has_more: false, total_count: 1 };

  test('la misma consulta se sirve de caché sin volver al proveedor', async () => {
    mockClient.listSharedVoices.mockResolvedValue(page);
    await searchLibraryVoices(ORG, { search: 'uno' });
    await searchLibraryVoices(ORG, { search: 'uno' });
    expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(1);
  });

  test('consultas distintas no comparten entrada', async () => {
    mockClient.listSharedVoices.mockResolvedValue(page);
    await searchLibraryVoices(ORG, { search: 'uno' });
    await searchLibraryVoices(ORG, { search: 'dos' });
    expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(2);
  });

  test('DOCUMENTA: la caché de la biblioteca es global al proceso, no por organización', async () => {
    // Es aceptable porque /v1/shared-voices es público y no depende de la clave,
    // pero conviene saberlo: la organización 2 recibe lo que cargó la 1, y con
    // la clave de la org 2 no se llama al proveedor.
    mockClient.listSharedVoices.mockResolvedValue(page);
    await searchLibraryVoices(1, { search: 'uno' });
    await searchLibraryVoices(2, { search: 'uno' });
    expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(1);
    expect(mockGetClient).toHaveBeenCalledTimes(1);
    expect(mockGetClient).toHaveBeenCalledWith(1);
  });

  test('un error del proveedor no se cachea', async () => {
    mockClient.listSharedVoices.mockRejectedValueOnce(new ElevenLabsError(429, 'slow'));
    await expect(searchLibraryVoices(ORG, {})).rejects.toBeInstanceOf(ElevenLabsError);
    mockClient.listSharedVoices.mockResolvedValue(page);
    const out = await searchLibraryVoices(ORG, {});
    expect(out.voices).toHaveLength(1);
  });
});

describe('previewCatalogVoice: la síntesis va por organización y con caché', () => {
  test('con preview_url pública no se sintetiza (no gasta caracteres)', async () => {
    mockListVoices.mockResolvedValue([row()]);
    const out = await previewCatalogVoice(supabase, ORG, 'row-1');
    expect(out).toEqual({ kind: 'url', url: 'https://cdn/a.mp3' });
    expect(mockClient.synthesize).not.toHaveBeenCalled();
  });

  test('una voz clonada sin preview sintetiza una vez y luego sirve de caché', async () => {
    mockListVoices.mockResolvedValue([row({ provider_voice_id: 'VOICE-CLON', kind: 'cloned' })]);
    mockClient.synthesize.mockResolvedValue(new ArrayBuffer(8));
    await previewCatalogVoice(supabase, ORG, 'row-1');
    await previewCatalogVoice(supabase, ORG, 'row-1');
    expect(mockClient.synthesize).toHaveBeenCalledTimes(1);
  });

  test('la caché de síntesis no cruza organizaciones', async () => {
    mockListVoices.mockResolvedValue([row({ provider_voice_id: 'VOICE-CLON', kind: 'cloned' })]);
    mockClient.synthesize.mockResolvedValue(new ArrayBuffer(8));
    await previewCatalogVoice(supabase, 1, 'row-1');
    await previewCatalogVoice(supabase, 2, 'row-1');
    expect(mockClient.synthesize).toHaveBeenCalledTimes(2);
  });
});

describe('addLibraryVoiceToCatalog: idempotente', () => {
  test('si ya está en el catálogo no llama al proveedor ni crea fila', async () => {
    mockListVoices.mockResolvedValue([row()]);
    const out = await addLibraryVoiceToCatalog(supabase, ORG, { voice_id: 'VOICE-A', public_owner_id: 'o', name: 'Voz A' });
    expect(out.already_in_catalog).toBe(true);
    expect(mockClient.addSharedVoice).not.toHaveBeenCalled();
    expect(mockCreateVoice).not.toHaveBeenCalled();
  });

  test('si el proveedor dice que ya existe en el workspace, igualmente se registra la fila', async () => {
    mockListVoices.mockResolvedValue([]);
    mockClient.addSharedVoice.mockRejectedValueOnce(new ElevenLabsError(400, 'Voice already exists in workspace'));
    mockCreateVoice.mockResolvedValue(row({ provider_voice_id: 'VOICE-B' }));
    const out = await addLibraryVoiceToCatalog(supabase, ORG, { voice_id: 'VOICE-B', public_owner_id: 'o', name: 'B' });
    expect(out.already_in_catalog).toBe(false);
    expect(mockCreateVoice).toHaveBeenCalledTimes(1);
  });

  test('un rechazo real del proveedor (plan) no deja fila huérfana', async () => {
    mockListVoices.mockResolvedValue([]);
    mockClient.addSharedVoice.mockRejectedValueOnce(new ElevenLabsError(402, 'paid', undefined, 'free_users_not_allowed'));
    await expect(
      addLibraryVoiceToCatalog(supabase, ORG, { voice_id: 'VOICE-B', public_owner_id: 'o', name: 'B' })
    ).rejects.toBeInstanceOf(ElevenLabsError);
    expect(mockCreateVoice).not.toHaveBeenCalled();
  });
});
