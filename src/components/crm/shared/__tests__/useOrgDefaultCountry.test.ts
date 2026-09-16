/**
 * FASE-16 · ronda 5 · T-3: `QuickActionsBar` y `MobileCallDialog` llamaban a
 * `normalizePhone(customer.phone)` sin el indicativo de la organización, así
 * que un número nacional de 10 dígitos siempre se completaba con `57`. Ahora
 * el indicativo sale de `GET /api/crm/whatsapp/settings`
 * (`settings.default_country_code`) a través de `loadOrgDefaultCountry`, con
 * caché por organización: la barra se monta en CADA tarjeta del Kanban y sin
 * caché serían N peticiones por tablero.
 *
 * Sin @testing-library (jest en node): se prueba la carga/caché pura, no el
 * hook de React.
 */
const mockSettings = jest.fn();
jest.mock('@/components/crm/whatsapp/api', () => ({ waApi: { settings: () => mockSettings() } }));
// `useOrganization` arrastra el cliente Supabase de navegador; aquí solo hace falta el id.
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 7 }));

import { loadOrgDefaultCountry, resetOrgDefaultCountryCache, orgDefaultCountryFromSettings } from '../useOrgDefaultCountry';

beforeEach(() => { mockSettings.mockReset(); resetOrgDefaultCountryCache(); });

describe('orgDefaultCountryFromSettings (puro)', () => {
  it.each([
    [{ settings: { default_country_code: '52' } }, '52'],
    [{ settings: { default_country_code: '+1' } }, '1'],
    [{ settings: { default_country_code: '' } }, null],
    [{ settings: { default_country_code: null } }, null],
    [{ settings: {} }, null],
    [{}, null],
    [null, null],
  ])('%p → %p', (payload, esperado) => {
    expect(orgDefaultCountryFromSettings(payload as never)).toBe(esperado);
  });
});

describe('loadOrgDefaultCountry (caché por organización)', () => {
  it('devuelve el indicativo de la org y NO vuelve a pedirlo en la segunda llamada', async () => {
    mockSettings.mockResolvedValue({ settings: { default_country_code: '52' } });
    expect(await loadOrgDefaultCountry(7)).toBe('52');
    expect(await loadOrgDefaultCountry(7)).toBe('52');
    expect(mockSettings).toHaveBeenCalledTimes(1);
  });

  it('llamadas CONCURRENTES (10 tarjetas del Kanban) comparten una sola petición', async () => {
    let resolver: (v: unknown) => void = () => undefined;
    mockSettings.mockImplementation(() => new Promise((r) => { resolver = r; }));
    const ps = Array.from({ length: 10 }, () => loadOrgDefaultCountry(7));
    expect(mockSettings).toHaveBeenCalledTimes(1);
    resolver({ settings: { default_country_code: '1' } });
    expect(await Promise.all(ps)).toEqual(Array(10).fill('1'));
  });

  it('otra organización tiene su propia entrada de caché', async () => {
    mockSettings.mockResolvedValueOnce({ settings: { default_country_code: '52' } }).mockResolvedValueOnce({ settings: { default_country_code: '1' } });
    expect(await loadOrgDefaultCountry(7)).toBe('52');
    expect(await loadOrgDefaultCountry(8)).toBe('1');
    expect(await loadOrgDefaultCountry(7)).toBe('52');
    expect(mockSettings).toHaveBeenCalledTimes(2);
  });

  it('si la API falla (p. ej. la org no tiene el módulo de WhatsApp) devuelve null sin lanzar y NO cachea el fallo', async () => {
    mockSettings.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce({ settings: { default_country_code: '52' } });
    expect(await loadOrgDefaultCountry(7)).toBeNull();
    expect(await loadOrgDefaultCountry(7)).toBe('52');
    expect(mockSettings).toHaveBeenCalledTimes(2);
  });

  it('sin organización (0) no llama a la API', async () => {
    expect(await loadOrgDefaultCountry(0)).toBeNull();
    expect(mockSettings).not.toHaveBeenCalled();
  });

  it('sin indicativo configurado devuelve null (y lo cachea: no es un fallo)', async () => {
    mockSettings.mockResolvedValue({ settings: { default_country_code: null } });
    expect(await loadOrgDefaultCountry(7)).toBeNull();
    expect(await loadOrgDefaultCountry(7)).toBeNull();
    expect(mockSettings).toHaveBeenCalledTimes(1);
  });
});
