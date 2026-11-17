/**
 * @jest-environment jsdom
 */
/**
 * «Marcar turno» según la sede (Figma 20.30): sin los datos de M0 la pantalla
 * es la de siempre; con ellos, selector por método, NFC sin Web NFC (20.30.3),
 * sede solo QR (20.30.6), QR ya usado (20.30.11), etiqueta abierta por URL
 * (`?nfc=`, con ubicación) y etiqueta de otra sede (20.30.5). Render real con
 * next-intl; `fetch`, la cámara y el GPS simulados. Datos ficticios.
 */
const reemplazar = jest.fn();
let consulta = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useSearchParams: () => consulta,
  useRouter: () => ({ replace: reemplazar, push: jest.fn() }),
  usePathname: () => '/marcar',
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), message: jest.fn() }) }));
jest.mock('../QRScanner', () => ({
  QRScanner: ({ onScan }: { onScan: (d: string) => void }) => (
    <button type="button" onClick={() => onScan('codigo-qr-de-prueba')}>
      escáner simulado
    </button>
  ),
}));

import type React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { MarcarTurno } from '../MarcarTurno';
import { toPlainDate } from '@/lib/utils/dateCore';

const RELOJ = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CODIGO = 'abcdefghijklmnop1234';

function estado(extra: Record<string, unknown> = {}) {
  const ahora = Date.now();
  return {
    vinculo: { id: 'v-1', sede_id: 1, sede: 'Sede Centro', nombre: 'Persona de prueba' },
    zona: 'UTC',
    hoy: toPlainDate(new Date(ahora), 'UTC'),
    sede: { id: 1, nombre: 'Sede Centro', lat: 4.6, lng: -74.08, radio_m: 150 },
    modalidad: 'presencial',
    mecanismos: ['app', 'qr', 'nfc'],
    ubicacion: { autorizada: true, version: 'v1', fecha: null },
    ultima: null,
    siguiente: 'check_in',
    turno: {
      id: 't-1',
      fecha: toPlainDate(new Date(ahora), 'UTC'),
      inicio: new Date(ahora + 3_600_000).toISOString(),
      fin: new Date(ahora + 8 * 3_600_000).toISOString(),
      dia_descanso: false,
      descanso_min: 30,
      plantilla: 'Apertura',
    },
    marcas: [],
    tolerancia_min: 5,
    ...extra,
  };
}

let respuestaGet: Record<string, unknown> = estado();
let respuestaPost: { status: number; cuerpo: Record<string, unknown> } = { status: 200, cuerpo: {} };
const posts: Array<Record<string, unknown>> = [];

beforeEach(() => {
  consulta = new URLSearchParams();
  reemplazar.mockClear();
  posts.length = 0;
  (toast.error as jest.Mock).mockClear();
  (toast.success as jest.Mock).mockClear();
  respuestaGet = estado();
  respuestaPost = { status: 200, cuerpo: { tipo: 'check_in', hora: new Date().toISOString(), ubicacion_guardada: true, reloj: 'Puerta principal' } };
  simularAncho(390);
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void) => ok({ coords: { latitude: 4.6001, longitude: -74.0801, accuracy: 12 } }) },
  });
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST' && u === '/api/hrm/marcacion') {
      posts.push(JSON.parse(String(init.body)));
      return { ok: respuestaPost.status < 400, status: respuestaPost.status, json: async () => respuestaPost.cuerpo } as Response;
    }
    return { ok: true, status: 200, json: async () => respuestaGet } as Response;
  }) as typeof fetch;
});

const M0 = (m: { ubicacion: boolean; qr: boolean; nfc: boolean }, preferido: string | null = null) => ({
  metodos_sede: m,
  metodo_preferido: preferido,
  reglas: { qr_exige_ubicacion: false, nfc_exige_ubicacion: true, permitir_computador: true },
});

test('sin los datos de M0: «Cómo marcas» con Ubicación y QR, como antes', async () => {
  respuestaGet = estado({ mecanismos: ['app', 'qr'] });
  renderConIdioma(<MarcarTurno />);
  expect(await screen.findByText('Cómo marcas')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Ubicación' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'QR de la sede' })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'NFC' })).toBeNull();
  expect(screen.getByRole('button', { name: /Marcar entrada/ })).toBeTruthy();
});

test('métodos de la sede: Ubicación · QR · NFC y título con la sede (20.30.1)', async () => {
  respuestaGet = estado(M0({ ubicacion: true, qr: true, nfc: true }, 'ubicacion'));
  renderConIdioma(<MarcarTurno />);
  expect(await screen.findByText('Cómo marcas en Sede Centro')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'NFC' })).toBeTruthy();
});

test('?metodo=nfc sin Web NFC: 20.30.3 con QR y ubicación', async () => {
  consulta = new URLSearchParams('metodo=nfc');
  respuestaGet = estado(M0({ ubicacion: true, qr: true, nfc: true }, 'ubicacion'));
  renderConIdioma(<MarcarTurno />);
  expect(await screen.findByText('Este celular no puede leer etiquetas NFC desde el navegador')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Marcar con el QR de la sede/ }));
  expect(await screen.findByText('escáner simulado')).toBeTruthy();
});

test('sede solo QR: sin selector, nota de 30 s; código ya usado → 20.30.11 y «Escanear de nuevo»', async () => {
  respuestaGet = estado(M0({ ubicacion: false, qr: true, nfc: false }, 'qr'));
  respuestaPost = { status: 409, cuerpo: { code: 'qr_ya_usado' } };
  renderConIdioma(<MarcarTurno />);
  expect(await screen.findByText(/se marca escaneando el QR de la entrada/)).toBeTruthy();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  fireEvent.click(screen.getByText('escáner simulado'));
  expect(await screen.findByText('Este código ya se usó')).toBeTruthy();
  expect(posts[0]).toMatchObject({ qr: 'codigo-qr-de-prueba', tipo: 'check_in' });
  expect(posts[0].ubicacion).toBeUndefined();
  fireEvent.click(screen.getByRole('button', { name: /Escanear de nuevo/ }));
  expect(await screen.findByText('escáner simulado')).toBeTruthy();
});

test('?nfc=: marca una sola vez con la ubicación del momento y limpia la URL (20.30.4)', async () => {
  consulta = new URLSearchParams(`nfc=${RELOJ}.${CODIGO}`);
  respuestaGet = estado(M0({ ubicacion: true, qr: true, nfc: true }, 'ubicacion'));
  renderConIdioma(<MarcarTurno />);
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({ nfc: `${RELOJ}.${CODIGO}`, tipo: 'check_in', ubicacion: { lat: 4.6001, lng: -74.0801, precision: 12 } });
  expect(reemplazar).toHaveBeenCalledWith('/marcar', { scroll: false });
  await waitFor(() => expect(toast.success).toHaveBeenCalled());
  expect((toast.success as jest.Mock).mock.calls[0][1]).toEqual({ description: 'Con la etiqueta NFC de Puerta principal · Sede Centro' });
  await act(async () => undefined);
  expect(posts).toHaveLength(1);
});

test('?nfc= sin permiso de ubicación: primero el permiso (20.30.9), no se manda nada', async () => {
  consulta = new URLSearchParams(`nfc=${RELOJ}.${CODIGO}`);
  respuestaGet = estado({ ...M0({ ubicacion: true, qr: true, nfc: true }, 'ubicacion'), ubicacion: { autorizada: false, version: null, fecha: null } });
  renderConIdioma(<MarcarTurno />);
  expect(await screen.findByText(/Nunca para rastrearte/)).toBeTruthy();
  expect(posts).toHaveLength(0);
});

test('etiqueta de otra sede: 20.30.5 con el nombre que trae el error', async () => {
  consulta = new URLSearchParams(`nfc=${RELOJ}.${CODIGO}`);
  respuestaGet = estado(M0({ ubicacion: true, qr: true, nfc: true }, 'ubicacion'));
  respuestaPost = { status: 422, cuerpo: { code: 'etiqueta_otra_sede', sede: 'Sede Norte' } };
  renderConIdioma(<MarcarTurno />);
  expect(await screen.findByText('Esta etiqueta es de Sede Norte')).toBeTruthy();
  expect(screen.getByText(/No registramos nada/)).toBeTruthy();
});

test('?nfc= que no es una etiqueta: se avisa y no se manda', async () => {
  consulta = new URLSearchParams('nfc=cualquier-cosa');
  renderConIdioma(<MarcarTurno />);
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(posts).toHaveLength(0);
  expect(reemplazar).toHaveBeenCalledWith('/marcar', { scroll: false });
});
