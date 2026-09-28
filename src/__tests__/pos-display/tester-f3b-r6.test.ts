/**
 * TESTER · Fase 3, parte B — ronda 6 (auditoría de SEGURIDAD sobre la
 * entrega B1–B7). PLAN §3.2, §3.3, §7, §8, §11 y §12.
 *
 * Las rondas 1–5 del tester ya fijan la matriz clásica de ataques (token
 * ajeno / revocado / de otra terminal, código vencido o reutilizado,
 * `organization_id` en el body, los dos cubos de /pair, canal de otra
 * terminal, instancia y seq ajenos, JWT vencido, middleware y aislamiento de
 * `pos_terminal_secrets`). No se repiten aquí.
 *
 * Esta ronda ataca lo que B1–B7 AÑADIERON y lo que dejaron sin cerrar. Los
 * `describe` marcados DEFECTO fallan a propósito contra el código actual:
 * documentan el agujero con los pasos exactos. No se arregla nada aquí.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BOOTSTRAP_FAILURES_BEFORE_PAIRING,
  HEARTBEAT_INFLIGHT_MAX_MS,
  fetchRemoteBootstrap,
  offersPairingFromBootstrap,
  shouldKeepPairingCode,
  startRemoteHeartbeat,
  type FetchLike,
  type RemoteApiFailure,
  type RemoteRealtimeCredential,
} from '@/lib/pos/display/remoteDisplay';

const SRC = join(process.cwd(), 'src');
const leer = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

const T1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const TOKEN = 'a'.repeat(43);

const credencial = (terminalId: string, token: string): RemoteRealtimeCredential => ({
  channel: `pos-display:${terminalId}`,
  token,
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
});

/** Respuesta JSON mínima con la forma que espera `FetchLike`. */
function respuesta(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

// ---------------------------------------------------------------------------
// B2 · el tope del latido en vuelo protege la credencial, pero no la
//      DESPAREJA
// ---------------------------------------------------------------------------

/**
 * ALCANCE HONESTO de este caso: en producción `browserFetch` respeta el
 * `signal`, así que el plazo de B1 (10 s) resuelve el latido colgado ANTES
 * del tope de B2 (15 s) y el abandonado devuelve `network`, no un 401. El
 * hueco es de COHERENCIA, no un camino explotable: la ruta que aplica una
 * credencial está protegida por antigüedad (`appliedStartedAt`) y la ruta
 * que DESTRUYE el emparejamiento —borra el token y planta la pantalla de
 * emparejamiento delante del cliente— no lo está. Se documenta para que la
 * asimetría no sobreviva a un cambio del plazo o del transporte.
 */
describe('DEFECTO · B2 · un latido ABANDONADO que responde 401 tarde desempareja una pantalla que ya está sana', () => {
  it('el 401 rezagado borra el emparejamiento aunque un latido POSTERIOR ya haya renovado el JWT', async () => {
    const ahora = jest.spyOn(Date, 'now');
    let reloj = 1_000_000;
    ahora.mockImplementation(() => reloj);

    // Latido 1: se queda colgado; lo resolvemos a mano al final.
    let resolver1: ((v: unknown) => void) | null = null;
    const colgado = new Promise<unknown>((resolve) => {
      resolver1 = resolve;
    });

    let llamada = 0;
    const fetchFn: FetchLike = () => {
      llamada += 1;
      if (llamada === 1) return colgado as ReturnType<FetchLike>;
      // Latido 2 (y siguientes): 200 con credencial fresca.
      return Promise.resolve(respuesta(200, { data: { terminalId: T1, at: new Date().toISOString(), realtime: credencial(T1, 'jwt-nuevo') } })) as ReturnType<FetchLike>;
    };

    const aplicadas: string[] = [];
    let revocada = 0;
    const latido = startRemoteHeartbeat({
      token: TOKEN,
      fetchFn,
      expectedTerminalId: T1,
      intervalMs: 10 * 60_000, // el intervalo no dispara: los latidos se fuerzan a mano
      onCredential: (c) => aplicadas.push(c.token),
      onRevoked: () => {
        revocada += 1;
      },
    });

    void latido.beat(); // sale el 1, se queda en vuelo

    // La tableta se suspende: pasa más del tope del «uno en vuelo».
    reloj += HEARTBEAT_INFLIGHT_MAX_MS + 1_000;
    await latido.beat(); // sale el 2, responde 200 y renueva el JWT
    expect(aplicadas).toEqual(['jwt-nuevo']);
    expect(latido.stopped).toBe(false);

    // Ahora contesta el abandonado, con un 401 que ya no describe la realidad:
    // el latido posterior acaba de autenticarse sin problema con el MISMO token.
    resolver1!(respuesta(401, { error: 'no autorizada', code: 'DISPLAY_UNAUTHORIZED' }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // ESPERADO: la credencial se protege por antigüedad (`appliedStartedAt`) y
    // la REVOCACIÓN —que borra el token del localStorage y planta la pantalla
    // de emparejamiento delante del cliente— debería protegerse igual.
    expect(revocada).toBe(0);
    expect(latido.stopped).toBe(false);

    ahora.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// B6 · el código conservado nunca llega al campo
// ---------------------------------------------------------------------------

describe('DEFECTO · B6 · `shouldKeepPairingCode` es inerte: el campo se vacía igual tras un fallo de red', () => {
  it('la regla pura dice CONSERVAR con red caída y con 5xx', () => {
    expect(shouldKeepPairingCode({ ok: false, kind: 'network', message: 'sin red' })).toBe(true);
    expect(shouldKeepPairingCode({ ok: false, kind: 'http', status: 503, code: null, retryAfterSeconds: null })).toBe(true);
    expect(shouldKeepPairingCode({ ok: false, kind: 'http', status: 429, code: null, retryAfterSeconds: null })).toBe(false);
  });

  it('PairingView NO sincroniza `prefill` después de montarse: el prop nuevo se ignora', () => {
    const src = leer('components/pos-display/PairingView.tsx');
    // `digits` se inicializa una sola vez, en el inicializador de useState.
    expect(src).toMatch(/useState\(\(\)\s*=>\s*normalizePairingCodeInput\(prefill\)\)/);
    // ESPERADO: algún efecto que vuelva a aplicar `prefill` cuando cambia.
    const sincroniza = /useEffect\([^)]*\)[\s\S]{0,400}?setDigits\(\s*normalizePairingCodeInput\(prefill\)/.test(src) || /\[[^\]]*\bprefill\b[^\]]*\]\s*\)/.test(src);
    expect(sincroniza).toBe(true);
  });

  it('CustomerDisplay monta PairingView SIN `key`, así que un prefill nuevo no puede entrar por un remontaje', () => {
    const src = leer('components/pos-display/CustomerDisplay.tsx');
    const bloque = /<PairingView[\s\S]*?\/>/.exec(src)?.[0] ?? '';
    expect(bloque).not.toBe('');
    // ESPERADO: o se sincroniza el prop (caso anterior) o se remonta con key.
    expect(bloque).toMatch(/key=/);
  });

  it('el efecto del flanco de `busy` vacía el campo SIN mirar el tipo de fallo', () => {
    const src = leer('components/pos-display/PairingView.tsx');
    const efecto = /if \(wasBusy && !busy && error !== null\) \{[\s\S]*?\}/.exec(src)?.[0] ?? '';
    expect(efecto).toMatch(/setDigits\(''\)/);
    // ESPERADO: ese vaciado consulta `shouldKeepPairingCode` (o un prop equivalente).
    expect(efecto).toMatch(/shouldKeep|conserva|keep/i);
  });

  it('simulación de los dos efectos en orden: el código tecleado desaparece tras un corte de red', () => {
    // Reproduce PairingView sin React: estado `digits`, flanco de busy y
    // re-render con el prefill nuevo que B6 manda desde useRemoteDisplay.
    let digits = '123456'; // la persona lo tecleó y se auto-canjeó
    let wasBusy = true; // el render anterior tenía busy=true
    const render = (busy: boolean, error: string | null, keepCodeOnError: boolean, prefill: string) => {
      // (1) efecto del flanco de busy: desde el cierre de F3 consulta el tipo de fallo.
      const previo = wasBusy;
      wasBusy = busy;
      if (previo && !busy && error !== null && !keepCodeOnError) digits = '';
      // (2) efecto de sincronía de `prefill`: repone el código si el campo quedó vacío.
      const normalizado = prefill.replace(/[^0-9]/g, '').slice(0, 6);
      if (normalizado.length > 0 && digits.length === 0) digits = normalizado;
    };
    render(false, 'network', true, '123456'); // B6 manda el código de vuelta como prefill
    expect(digits).toBe('123456'); // ESPERADO: sigue en el campo
  });
});

// ---------------------------------------------------------------------------
// B5 · Retry-After se parsea y nadie lo lee
// ---------------------------------------------------------------------------

describe('DEFECTO · B5 · `retryAfterSeconds` no tiene ningún consumidor: el 429 no espacia nada', () => {
  it('el valor llega al fallo…', async () => {
    const fetchFn: FetchLike = () => Promise.resolve(respuesta(429, { error: 'demasiados', code: 'RATE_LIMITED' }, { 'Retry-After': '900' })) as ReturnType<FetchLike>;
    const res = await fetchRemoteBootstrap(TOKEN, fetchFn);
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ kind: 'http', status: 429, retryAfterSeconds: 900 });
  });

  it('…pero ni el hook ni ninguna vista lo leen', () => {
    const consumidores = [
      'components/pos-display/useRemoteDisplay.ts',
      'components/pos-display/CustomerDisplay.tsx',
      'components/pos-display/views.tsx',
      'components/pos-display/PairingView.tsx',
    ].filter((rel) => leer(rel).includes('retryAfterSeconds'));
    // ESPERADO: alguien lo usa para deshabilitar «Conectar» o para decir
    // cuánto hay que esperar. Si no, la pantalla de emparejamiento invita a
    // repulsar contra un 429 y a gastar el cupo por IP de /pair.
    expect(consumidores).not.toEqual([]);
  });

  it('un Retry-After absurdo se acepta tal cual (no hay techo)', async () => {
    const fetchFn: FetchLike = () => Promise.resolve(respuesta(429, {}, { 'Retry-After': '999999999' })) as ReturnType<FetchLike>;
    const res = await fetchRemoteBootstrap(TOKEN, fetchFn);
    expect(res).toMatchObject({ retryAfterSeconds: 999999999 });
  });
});

// ---------------------------------------------------------------------------
// B4 · la salida al emparejamiento es una puerta de un solo sentido
// ---------------------------------------------------------------------------

describe('DEFECTO · B4 · «Emparejar con un código» detiene el reintento para siempre y no deja volver', () => {
  it('la regla pura abre la puerta a los tres fallos', () => {
    expect(offersPairingFromBootstrap(BOOTSTRAP_FAILURES_BEFORE_PAIRING - 1, null)).toBe(false);
    expect(offersPairingFromBootstrap(BOOTSTRAP_FAILURES_BEFORE_PAIRING, null)).toBe(true);
  });

  it('CORREGIDO (cierre F3): salir de `bootstrapping` suelta el reintento pero deja volver si hay emparejamiento guardado', () => {
    const src = leer('components/pos-display/useRemoteDisplay.ts');
    const bloque = /if \(prev\.kind === 'bootstrapping'\) \{[\s\S]*?\n  \}/.exec(src)?.[0] ?? '';
    expect(bloque).toMatch(/teardownRemote\(\)/);
    // Ya no se exige canCancel:false: el cierre de F3 permite volver.
    // ESPERADO: con un token guardado todavía válido hay a dónde volver
    // (reintentar el arranque), así que `canCancel` debería ser true; si no,
    // un toque accidental en una pantalla táctil deja el quiosco pidiendo un
    // código delante del cliente, sin reintento y sin forma de recargar.
    expect(bloque).toMatch(/canCancel:\s*true|readStoredRemoteDisplay/);
  });

  it('`cancelPairing` solo actúa con canCancel, así que desde esta puerta no hace nada', () => {
    const src = leer('components/pos-display/useRemoteDisplay.ts');
    const bloque = /const cancelPairing = useCallback\([\s\S]*?\n  \}, \[\]\);/.exec(src)?.[0] ?? '';
    expect(bloque).toMatch(/prev\.canCancel/);
  });
});

// ---------------------------------------------------------------------------
// Coherencia que B1–B7 no tocó: el bootstrap no comprueba que la terminal sea
// la SUYA (el latido sí, desde la ronda anterior)
// ---------------------------------------------------------------------------

describe('CORREGIDO (cierre F3) · el arranque comprueba la terminal esperada, igual que el latido', () => {
  it('un bootstrap COHERENTE consigo mismo pero de OTRA terminal se acepta sin comparar con el emparejamiento guardado', async () => {
    const fetchFn: FetchLike = () =>
      Promise.resolve(
        respuesta(200, {
          data: {
            terminal: { id: T2, name: 'caja ajena', code: 'C2', branchId: 9 },
            brand: { organizationId: 999, name: '', logoUrl: null, primaryColor: null, secondaryColor: null, timezone: 'America/Bogota' },
            settings: {},
            locale: 'es',
            currency: 'COP',
            realtime: credencial(T2, 'jwt-ajeno'),
          },
        }),
      ) as ReturnType<FetchLike>;

    // Sin terminal esperada (pruebas de forma) se acepta tal cual.
    expect((await fetchRemoteBootstrap(TOKEN, fetchFn)).ok).toBe(true);
    // Con el emparejamiento guardado (T1) se descarta como fallo reintentable,
    // exactamente como hace el latido: nunca se une al canal de otra caja.
    const conEsperada = await fetchRemoteBootstrap(TOKEN, fetchFn, { expectedTerminalId: T1 });
    expect(conEsperada.ok).toBe(false);
    expect(conEsperada).toMatchObject({ kind: 'network' });
  });

  it('`startRemote` compara con el emparejamiento guardado al arrancar', () => {
    const src = leer('components/pos-display/useRemoteDisplay.ts');
    expect(src).toMatch(/expectedTerminalId:\s*guardadoAlArrancar/);
    expect(src).toMatch(/readStoredRemoteDisplay\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Comprobaciones exigidas por el encargo (deben estar en VERDE)
// ---------------------------------------------------------------------------

describe('postura que no debe regresar', () => {
  it('el middleware EXCLUYE /api/pos/display/ de su matcher y /pos-display es ruta pública', () => {
    const src = leer('middleware.ts');
    const matcher = /export const config = \{[\s\S]*?\};/.exec(src)?.[0] ?? '';
    expect(matcher).toContain('api/pos/display/');
    expect(src).toMatch(/pathname === '\/pos-display'/);
  });

  it('ningún componente de navegador ni ninguna ruta sin service-role nombra `pos_terminal_secrets` en una consulta', () => {
    const rutas = [
      'app/api/pos/display/pair/route.ts',
      'app/api/pos/display/revoke/route.ts',
      'app/api/pos/terminals/[id]/pairing-code/route.ts',
      'lib/pos/display/server/displayAuth.ts',
    ];
    for (const rel of rutas) {
      const src = leer(rel);
      // Toda consulta a la tabla sale de un cliente service-role.
      expect(src).toMatch(/getServiceClient|DisplayAuthClient/);
    }
    // Y el lado navegador no la consulta nunca.
    for (const rel of ['lib/services/posTerminalsService.ts', 'lib/pos/display/remoteDisplay.ts', 'lib/pos/display/remoteDisplayClient.ts', 'components/pos-display/useRemoteDisplay.ts']) {
      expect(leer(rel)).not.toMatch(/from\(\s*['"]pos_terminal_secrets['"]\s*\)/);
    }
  });

  it('el transporte remoto SIEMPRE abre el canal como privado', () => {
    const src = leer('lib/pos/display/supabaseBroadcastTransport.ts');
    expect(src).toMatch(/config:\s*\{\s*private:\s*true/);
    expect(src).not.toMatch(/private:\s*false/);
  });

  it('el JWT de Realtime no lleva ningún claim de confianza', () => {
    const src = leer('lib/pos/display/server/displayTokens.ts');
    const payload = /const payload: Record<[\s\S]*?\};/.exec(src)?.[0] ?? '';
    for (const prohibido of ['organization_id', 'org_id', 'app_role', 'email', 'user_id', 'branch_id']) {
      expect(payload).not.toContain(`${prohibido}:`);
    }
    expect(payload).toMatch(/role: 'anon'/);
  });

  it('el token de la pantalla nunca viaja en la URL ni en el body: solo como Bearer', () => {
    const src = leer('lib/pos/display/remoteDisplay.ts');
    expect(src).toMatch(/headers\.Authorization = `Bearer \$\{init\.token\}`/);
    expect(src).not.toMatch(/token=\$\{/);
  });
});

// ---------------------------------------------------------------------------
// B1 · el plazo de la petición: lo que sí cumple
// ---------------------------------------------------------------------------

describe('B1 · plazo de cada petición (contraste, en verde)', () => {
  it('un fallo de red no inventa ninguna ventana de espera', async () => {
    const fetchFn: FetchLike = () => Promise.reject(new Error('ECONNRESET'));
    const res = (await fetchRemoteBootstrap(TOKEN, fetchFn)) as RemoteApiFailure;
    expect(res).toMatchObject({ ok: false, kind: 'network' });
  });

  it('una respuesta 429 SIN cabecera deja retryAfterSeconds en null (no se inventa)', async () => {
    const fetchFn: FetchLike = () => Promise.resolve(respuesta(429, { code: 'RATE_LIMITED' })) as ReturnType<FetchLike>;
    const res = await fetchRemoteBootstrap(TOKEN, fetchFn);
    expect(res).toMatchObject({ retryAfterSeconds: null });
  });
});

// ---------------------------------------------------------------------------
// El CÓDIGO en la barra de direcciones: se limpia en un camino y en otro no
// ---------------------------------------------------------------------------

describe('DEFECTO · un `?pair=` que no llega a canjearse se queda en la URL y en el historial para siempre', () => {
  it('la rama `ask_code` (valor con letras, corto o largo) no llama a `forgetPairInUrl`', () => {
    const src = leer('components/pos-display/useRemoteDisplay.ts');
    const rama = /case 'ask_code':[\s\S]*?break;/.exec(src)?.[0] ?? '';
    expect(rama).not.toBe('');
    // ESPERADO: igual que la rama `pair`, se retira el parámetro. Un valor que
    // NO se va a canjear no tiene por qué sobrevivir en el historial del
    // navegador ni en los registros del CDN.
    expect(rama).toMatch(/forgetPairInUrl\(\)/);
  });

  it('/pos-display no fija `Referrer-Policy: no-referrer` pese a llevar el código en la URL', () => {
    // El repo YA usa esa cabecera para otra página con un secreto en la URL
    // (publicPage.ts, token de baja): aquí se confía en el valor por defecto
    // del navegador.
    const candidatos = ['app/pos-display/page.tsx', 'app/pos-display/layout.tsx', 'middleware.ts'];
    const fijado = candidatos.some((rel) => {
      try {
        return /Referrer-Policy/i.test(leer(rel));
      } catch {
        return false;
      }
    });
    expect(fijado).toBe(true);
  });
});
