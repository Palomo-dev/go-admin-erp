/**
 * Tester · Fase 3, parte B — defectos 1 y 2 de la ronda 1, ya CORREGIDOS en
 * la ronda 2. Los asertos de este archivo fijaban a propósito la conducta
 * mala (para poder darles la vuelta de una línea); ahora fijan la buena y
 * vigilan que no se reincida.
 *
 * 1. `?pair` con un código ya consumido NO anula el token guardado: la
 *    intención de canje lleva el emparejamiento guardado como respaldo y un
 *    404 cae en él, en vez de dejar la pantalla pidiendo un código nuevo. Es
 *    el caso de la tableta en modo quiosco cuya URL de arranque lleva
 *    `?pair=<código>` y que se reinicia todos los días.
 * 2. Un JWT de canal caducado NO se queda como «vigente» en el cliente
 *    remoto: si `setAuth` lo rechaza se descarta —del nuestro y del
 *    `accessTokenValue` de realtime-js—, así el latido de socket de
 *    realtime-js (30 s, `setAuth()` sin await) no vuelve a rechazarlo.
 *
 * Fixtures sin nombres de organizaciones reales.
 */

import {
  isUnauthorizedFailure,
  pairWithCode,
  readStoredRemoteDisplay,
  resolveRemoteIntent,
  saveStoredRemoteDisplay,
  type FetchLike,
  type RemoteTokenStorage,
} from '@/lib/pos/display/remoteDisplay';
import { createRemoteDisplayClient } from '@/lib/pos/display/remoteDisplayClient';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TOKEN = 'B'.repeat(43);

function memoryStorage(): RemoteTokenStorage {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

function jwt(expSeconds: number): string {
  const head = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
  const body = Buffer.from(JSON.stringify({ role: 'anon', pos_terminal_id: TERMINAL, exp: expSeconds })).toString('base64url');
  return `${head}.${body}.firma`;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('tester F3-B r1 · defecto 1 (corregido): un `?pair` consumido ya no anula un emparejamiento válido', () => {
  it('con token guardado Y `?pair` en la URL, la intención de canje LLEVA el emparejamiento guardado como respaldo; el 404 del código gastado no lo toca', async () => {
    const storage = memoryStorage();
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL }, storage)).toBe(true);
    const stored = readStoredRemoteDisplay(storage);
    expect(stored).not.toBeNull();

    // Lo que decide el arranque (remoteDisplay.ts · resolveRemoteIntent):
    const intent = resolveRemoteIntent('?pair=123456', stored);
    // El código sigue mandando —re-emparejar es una intención legítima—, pero
    // ya no viaja solo: el token que había va con él como respaldo.
    expect(intent).toEqual({ kind: 'pair', code: '123456', fallback: stored });

    // El canje de un código ya consumido responde 404 (parte A: `codeRejected`).
    const fetchFn: FetchLike = async () => ({ status: 404, ok: false, json: async () => ({ code: 'CODE_INVALID' }) });
    const result = await pairWithCode('123456', fetchFn);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isUnauthorizedFailure(result)).toBe(false); // no es una revocación
    // El token sigue guardado y válido, y ahora `useRemoteDisplay.redeem` lo
    // relee en la rama de fallo y arranca en remoto con él (la simulación del
    // flujo completo está en f3b-remote-display.test.ts).
    expect(readStoredRemoteDisplay(storage)?.token).toBe(TOKEN);
  });

  it('sin `?pair` la misma pantalla arranca en remoto con ese token: la diferencia es solo la URL de arranque del quiosco', () => {
    const storage = memoryStorage();
    saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL }, storage);
    expect(resolveRemoteIntent('', readStoredRemoteDisplay(storage))).toEqual({ kind: 'remote', stored: expect.objectContaining({ token: TOKEN }) });
  });
});

describe('tester F3-B r1 · defecto 2 (corregido): el JWT caducado ya no se queda pegado en el cliente remoto', () => {
  it('setAuth rechaza un JWT vencido y el cliente lo DESCARTA: ni `token` ni el callback `accessToken` lo devuelven, y `setAuth()` sin argumento deja de rechazar', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createRemoteDisplayClient({ url: 'http://127.0.0.1:1', anonKey: 'anon-key' });
    expect(client).not.toBeNull();
    if (!client) return;

    const vencido = jwt(1); // 1970
    await client.setToken(vencido);
    // Se descarta: solo es «vigente» lo que Realtime aceptó y no ha vencido.
    expect(client.token).toBeNull();

    // El callback `accessToken` del cliente es lo que realtime-js consulta en
    // `setAuth()` sin argumento (join confirmado y latido de socket cada 30 s).
    const realtime = (
      client.client as unknown as {
        realtime: { accessToken?: () => Promise<string | null>; accessTokenValue: string | null; setAuth(t?: string | null): Promise<void> };
      }
    ).realtime;
    await expect(realtime.accessToken?.()).resolves.toBeNull();
    // Y tampoco queda en `accessTokenValue`, que es donde realtime-js cae
    // cuando el callback devuelve null: sin eso, `setAuth()` sin argumento
    // (el `this.setAuth()` sin await de sendHeartbeat) seguiría rechazando
    // cada 30 s con una promesa sin capturar.
    expect(realtime.accessTokenValue).toBeNull();
    await expect(realtime.setAuth()).resolves.toBeUndefined();

    // Con uno fresco vuelve a la normalidad (el latido HTTP de 60 s lo entrega).
    const fresco = jwt(Math.floor(Date.now() / 1000) + 300);
    await client.setToken(fresco);
    expect(client.token).toBe(fresco);
    await expect(realtime.setAuth()).resolves.toBeUndefined();
    await client.dispose();
  });
});
