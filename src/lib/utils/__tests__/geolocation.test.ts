/// <reference types="jest" />
/**
 * Ubicación sin diálogo propio (2026-11-06). El permiso es solo el del navegador:
 * sin preferencia guardada se le pide la posición directamente, y un rechazo
 * guardado evita volver a preguntar en cada inicio de sesión.
 */
import { getLocationFromBrowser, getGeolocationPreference } from '../geolocation';

jest.mock('@/lib/utils/mobile', () => ({ isMobile: () => false, getMobilePlugin: () => null }));

type Exito = (p: { coords: { latitude: number; longitude: number } }) => void;
type Fallo = (e: { code: number; message: string }) => void;

const globales = globalThis as unknown as Record<string, unknown>;

function preparar(cookie: string, responder: (ok: Exito, ko: Fallo) => void) {
  const getCurrentPosition = jest.fn(responder);
  const doc = { cookie };
  globales.document = doc;
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: { getCurrentPosition } },
    configurable: true,
  });
  return { getCurrentPosition, doc };
}

const conPosicion = (ok: Exito) => ok({ coords: { latitude: 4.711, longitude: -74.0721 } });

afterEach(() => {
  delete globales.document;
});

describe('getLocationFromBrowser', () => {
  it('sin preferencia guardada pide la posición al navegador', async () => {
    const { getCurrentPosition, doc } = preparar('', conPosicion);
    await expect(getLocationFromBrowser()).resolves.toBe('Coordenadas GPS: 4.7110, -74.0721');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(doc.cookie).toContain('geolocation_preference=allowed');
  });

  it('respeta a quien ya rechazó, sin volver a preguntar', async () => {
    const { getCurrentPosition } = preparar('geolocation_preference=denied', conPosicion);
    await expect(getLocationFromBrowser()).resolves.toBe('Usuario denegó el acceso a la ubicación');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('un rechazo en el navegador queda guardado', async () => {
    const { doc } = preparar('', (_ok, ko) => ko({ code: 1, message: 'denied' }));
    await expect(getLocationFromBrowser()).resolves.toBe('Error al obtener ubicación GPS');
    expect(doc.cookie).toContain('geolocation_preference=denied');
  });

  it('un tiempo agotado no cuenta como rechazo', async () => {
    const { doc } = preparar('', (_ok, ko) => ko({ code: 3, message: 'timeout' }));
    await getLocationFromBrowser();
    expect(doc.cookie).toBe('');
    expect(getGeolocationPreference()).toBeNull();
  });
});
