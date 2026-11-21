/// <reference types="jest" />
/**
 * Ubicación al iniciar sesión SIN abrir el aviso de permiso (2026-11-20). En
 * iPhone el aviso salía sobre «Elige una organización» y volvía a salir tras la
 * redirección: solo se lee la posición si el permiso ya estaba concedido.
 */
import { getLocationFromBrowser, getGeolocationPreference } from '../geolocation';

jest.mock('@/lib/utils/mobile', () => ({ isMobile: () => false, getMobilePlugin: () => null }));

type Exito = (p: { coords: { latitude: number; longitude: number } }) => void;
type Fallo = (e: { code: number; message: string }) => void;

const globales = globalThis as unknown as Record<string, unknown>;

function preparar(cookie: string, responder: (ok: Exito, ko: Fallo) => void, permiso: PermissionState | null = 'granted') {
  const getCurrentPosition = jest.fn(responder);
  const doc = { cookie };
  globales.document = doc;
  const permissions = permiso === null ? undefined : { query: jest.fn(async () => ({ state: permiso })) };
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: { getCurrentPosition }, permissions },
    configurable: true,
  });
  return { getCurrentPosition, doc };
}

const conPosicion = (ok: Exito) => ok({ coords: { latitude: 4.711, longitude: -74.0721 } });

afterEach(() => {
  delete globales.document;
});

describe('getLocationFromBrowser', () => {
  it('sin permiso concedido NO abre el aviso del navegador', async () => {
    const { getCurrentPosition, doc } = preparar('', conPosicion, 'prompt');
    await expect(getLocationFromBrowser()).resolves.toBe('Ubicación no solicitada al iniciar sesión');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(doc.cookie).toBe('');
  });

  it('sin Permissions API (no se puede saber) tampoco pregunta', async () => {
    const { getCurrentPosition } = preparar('', conPosicion, null);
    await expect(getLocationFromBrowser()).resolves.toBe('Ubicación no solicitada al iniciar sesión');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('con el permiso ya concedido lee la posición', async () => {
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
