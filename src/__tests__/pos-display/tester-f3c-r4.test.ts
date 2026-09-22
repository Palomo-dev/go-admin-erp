/**
 * TESTER · Fase 3, parte C (lado caja: emparejar y emitir en remoto), ronda 4.
 * Fase de SEGURIDAD: se intenta romper. NO se corrige nada aquí, solo se fija
 * lo que falla con pasos reproducibles.
 *
 * Los `it` que empiezan por DEFECTO documentan un fallo REAL del código de
 * esta parte: describen lo que el código HACE hoy, no lo que debería hacer.
 * Quien lo arregle tiene que darles la vuelta.
 *
 * Sin nombres de organizaciones: ids y números.
 */

import fs from 'fs';
import path from 'path';
import { createCajaDisplayChannel } from '@/lib/pos/display/cajaChannel';
import { createListenerGatedChannel, upMessageListenerGate } from '@/lib/pos/display/multiChannel';
import { PROTOCOL_VERSION, type DisplayCapabilities } from '@/lib/pos/display/protocol';
import {
  clearRemoteDisplayRevoked,
  isRemoteDisplayRevoked,
  markRemoteDisplayRevoked,
  resetRemoteDisplayRevocations,
  type RevocationStorage,
} from '@/lib/pos/display/revocation';
import { BroadcastChannelTransport, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';

const RAIZ = path.resolve(__dirname, '../../..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

const TERMINAL = '9a9a9a9a-bbbb-4ccc-8ddd-eeeeeeee0001';
const TABLETA: DisplayCapabilities = { touch: true, width: 800, height: 1280 };
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

class CanalFalso implements DisplayChannel {
  posted: unknown[] = [];
  closed = false;
  onmessage: ((e: DisplayChannelEvent) => void) | null = null;
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  inject(data: unknown, origin: 'local' | 'remote' = 'remote'): void {
    this.onmessage?.({ data, origin });
  }
}

function almacenFalso(inicial: Record<string, string> = {}): RevocationStorage & { datos: Map<string, string> } {
  const datos = new Map<string, string>(Object.entries(inicial));
  return {
    datos,
    setItem: (k: string, v: string) => void datos.set(k, v),
    getItem: (k: string) => datos.get(k) ?? null,
  };
}

const alive = (extra: Record<string, unknown> = {}): unknown => ({
  v: PROTOCOL_VERSION,
  terminalId: TERMINAL,
  t: 'display_alive',
  at: Date.now(),
  capabilities: TABLETA,
  ...extra,
});

beforeEach(() => {
  resetRemoteDisplayRevocations();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// 1. Revocar y volver a emparejar: el camino feliz de la propia función
// ---------------------------------------------------------------------------

/**
 * Regla EXACTA que hoy aplica PairingCodeDialog.tsx para soltar el pestillo.
 * Se copia del fuente (se comprueba abajo que sigue siendo esa) para poder
 * ejecutar el flujo sin montar React.
 */
const sueltaElPestillo = (respuesta: { reused: boolean }, opciones: { reuse?: boolean }) =>
  respuesta.reused === false && opciones.reuse !== true;

describe('Revocar y volver a emparejar desde el mismo navegador', () => {
  it('la regla del diálogo es la del fuente: solo suelta con `reused === false` Y sin pedir `reuse`', () => {
    const src = leer('src/components/pos/display/PairingCodeDialog.tsx');
    expect(src).toMatch(/const emitidoNuevo = next\.reused === false && options\.reuse !== true;/);
    expect(src).toMatch(/if \(emitidoNuevo\) clearRemoteDisplayRevoked\(terminalId\);/);
    // Y al abrirse el diálogo siempre pide `reuse: true`.
    expect(src).toMatch(/void request\(\{ reuse: true \}\)/);
  });

  it('DEFECTO · tras «Revocar», abrir «Emparejar otro dispositivo» emite un código NUEVO y el pestillo NO se suelta', () => {
    const almacen = almacenFalso();
    markRemoteDisplayRevoked(TERMINAL, almacen);
    expect(isRemoteDisplayRevoked(TERMINAL, almacen)).toBe(true);

    // `/revoke` dejó `pairing_code` en NULL, así que la petición de apertura
    // del diálogo (`reuse: true`) no encuentra código vigente y la ruta emite
    // uno nuevo: responde `reused: false`.
    const respuesta = { reused: false };
    const opciones = { reuse: true };
    if (sueltaElPestillo(respuesta, opciones)) clearRemoteDisplayRevoked(TERMINAL, almacen);

    // El administrador dicta ESE código y la tableta nueva se empareja de
    // verdad… pero la caja sigue con el pestillo echado.
    expect(isRemoteDisplayRevoked(TERMINAL, almacen)).toBe(true);
  });

  it('DEFECTO · con el pestillo echado la pata remota nace sorda y muda: la tableta recién emparejada no recibe nada', async () => {
    const almacen = almacenFalso();
    markRemoteDisplayRevoked(TERMINAL, almacen);

    const remoto = new CanalFalso();
    const local = new CanalFalso();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => local,
      realtime: { channel: () => remoto as never } as never,
      isRegisteredTerminal: async () => true,
    });
    await canal.remoteAttached;

    // La tableta NUEVA (emparejada con el código que el diálogo acaba de
    // enseñar) saluda por el canal de su terminal.
    remoto.inject(alive());
    canal.postMessage({ t: 'state', state: { total: 12345 } });
    await flush();

    // Nada sale por la pata remota: la tableta se queda en blanco y el
    // indicador del POS dirá «sin pantalla» para siempre.
    expect(remoto.posted).toEqual([]);
  });

  it('solo «Generar otro código» (sin `reuse`) suelta el pestillo, y eso invalida el código ya dictado', () => {
    const almacen = almacenFalso();
    markRemoteDisplayRevoked(TERMINAL, almacen);
    // Apertura del diálogo: no suelta.
    if (sueltaElPestillo({ reused: false }, { reuse: true })) clearRemoteDisplayRevoked(TERMINAL, almacen);
    expect(isRemoteDisplayRevoked(TERMINAL, almacen)).toBe(true);
    // «Generar otro código»: suelta, pero la ruta acaba de pisar el código
    // anterior, así que la tableta que ya tenía el primero queda fuera.
    if (sueltaElPestillo({ reused: false }, {})) clearRemoteDisplayRevoked(TERMINAL, almacen);
    expect(isRemoteDisplayRevoked(TERMINAL, almacen)).toBe(false);
  });

  it('DEFECTO · el pestillo es DURADERO, así que recargar el POS tampoco deshace el bloqueo', () => {
    const almacen = almacenFalso();
    markRemoteDisplayRevoked(TERMINAL, almacen);
    // Recarga: registro nuevo, mismo localStorage.
    resetRemoteDisplayRevocations();
    expect(isRemoteDisplayRevoked(TERMINAL, almacen)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. La firma del `display_bye` frente al adversario que la cabecera nombra
// ---------------------------------------------------------------------------

describe('Firma del display_bye · quién puede escribir el canal también puede leerlo', () => {
  it('la política de LECTURA y la de ESCRITURA del canal de la caja son el mismo predicado', () => {
    const sql = leer('supabase/migrations/20260922200000_pos_display_caja_sucursal_del_usuario.sql');
    const cuerpo = (nombre: string) => {
      const desde = sql.indexOf(`create policy ${nombre} on realtime.messages`);
      expect(desde).toBeGreaterThan(-1);
      const hasta = sql.indexOf('\n\n', desde);
      return sql
        .slice(desde, hasta === -1 ? undefined : hasta)
        .replace(`create policy ${nombre} on realtime.messages`, '')
        .replace(/for select to authenticated\s+using/, 'GUARDA')
        .replace(/for insert to authenticated\s+with check/, 'GUARDA')
        .replace(/\s+/g, ' ')
        .trim();
    };
    // Mismo EXISTS palabra por palabra: nadie puede insertar sin poder leer.
    expect(cuerpo('pos_display_caja_envia')).toBe(cuerpo('pos_display_caja_recibe'));
  });

  it('DEFECTO · el `instanceId` que autentica la despedida viaja en claro por ese mismo canal', () => {
    const remoto = new CanalFalso();
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => remoto });
    transporte.announce({ t: 'hello', capabilities: { tip: false } } as never, { total: 0 } as never);
    const hello = remoto.posted.find((m) => (m as { t?: string }).t === 'hello') as { instanceId?: string };
    expect(typeof hello.instanceId).toBe('string');
    expect(hello.instanceId).toBe(transporte.instanceId);
    transporte.close();
  });

  it('DEFECTO · con ese `instanceId` copiado del hello, un tercero apaga la pantalla remota', () => {
    const interior = new CanalFalso();
    const instancia = 'inst-de-la-caja';
    const compuerta = createListenerGatedChannel(interior, { gate: upMessageListenerGate(TERMINAL, instancia) });

    interior.inject(alive()); // la tableta real despierta la pata
    expect(compuerta.hasListener).toBe(true);

    // El tercero leyó el hello en el canal y reproduce su `instanceId`.
    interior.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye', ackInstanceId: instancia });
    expect(compuerta.hasListener).toBe(false);
  });

  it('DEFECTO · un `display_alive` forjado enciende la emisión aunque no haya NINGUNA pantalla emparejada', () => {
    const interior = new CanalFalso();
    const compuerta = createListenerGatedChannel(interior, { gate: upMessageListenerGate(TERMINAL, 'inst') });

    // Sin tableta el tubo no publica nada: es lo que promete la compuerta.
    compuerta.postMessage({ t: 'state', state: { total: 1 } });
    expect(interior.posted).toEqual([]);

    // Un miembro de la sucursal manda un `display_alive` bien formado. La
    // compuerta se abre y además REPONE el carrito retenido: el forjador
    // recibe hasta el estado que la caja se había guardado mientras dormía.
    interior.inject(alive());
    compuerta.postMessage({ t: 'state', state: { total: 99999 } });
    expect(interior.posted).toEqual([{ t: 'state', state: { total: 1 } }, { t: 'state', state: { total: 99999 } }]);
  });
});

// ---------------------------------------------------------------------------
// 3. Canal ajeno, instancia ajena, mensajes basura
// ---------------------------------------------------------------------------

describe('Mensajes de otra terminal o de otra instancia', () => {
  const otraTerminal = '9a9a9a9a-bbbb-4ccc-8ddd-eeeeeeee0002';

  it('un `display_alive` de OTRA terminal no abre la compuerta', () => {
    const interior = new CanalFalso();
    const compuerta = createListenerGatedChannel(interior, { gate: upMessageListenerGate(TERMINAL, 'inst') });
    interior.inject(alive({ terminalId: otraTerminal }));
    expect(compuerta.hasListener).toBe(false);
  });

  it('un `up` dirigido a OTRA instancia no abre la compuerta', () => {
    const interior = new CanalFalso();
    const compuerta = createListenerGatedChannel(interior, { gate: upMessageListenerGate(TERMINAL, 'inst-A') });
    interior.inject(alive({ toInstanceId: 'inst-B' }));
    expect(compuerta.hasListener).toBe(false);
  });

  it('con la instancia aún sin resolver, un `up` CON destinatario falla cerrado', () => {
    const interior = new CanalFalso();
    const compuerta = createListenerGatedChannel(interior, { gate: upMessageListenerGate(TERMINAL, () => null) });
    interior.inject(alive({ toInstanceId: 'inst-B' }));
    expect(compuerta.hasListener).toBe(false);
  });

  it('el mismo id en MAYÚSCULAS no cuela: el canal es por igualdad exacta', () => {
    const interior = new CanalFalso();
    const compuerta = createListenerGatedChannel(interior, { gate: upMessageListenerGate(TERMINAL, 'inst') });
    interior.inject(alive({ terminalId: TERMINAL.toUpperCase() }));
    expect(compuerta.hasListener).toBe(false);
  });

  it('basura (cadena, número, objeto sin sobre) ni abre ni cierra', () => {
    const interior = new CanalFalso();
    const compuerta = createListenerGatedChannel(interior, { gate: upMessageListenerGate(TERMINAL, 'inst') });
    for (const basura of ['abre', 7, null, {}, { t: 'display_alive' }, [alive()]]) interior.inject(basura);
    expect(compuerta.hasListener).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Guardarraíles de superficie: el navegador nunca toca los secretos
// ---------------------------------------------------------------------------

describe('Superficie del secreto y del middleware', () => {
  it('`pos_terminal_secrets` solo se CONSULTA desde rutas de servidor con service-role', () => {
    const salida: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(completo);
        else if (/\.(ts|tsx)$/.test(entrada.name) && !completo.includes('__tests__')) {
          const src = fs.readFileSync(completo, 'utf8');
          if (/\.from\(\s*['"]pos_terminal_secrets['"]\s*\)/.test(src)) salida.push(path.relative(RAIZ, completo).replace(/\\/g, '/'));
        }
      }
    };
    recorrer(path.join(RAIZ, 'src'));
    expect(salida.sort()).toEqual([
      'src/app/api/pos/display/pair/route.ts',
      'src/app/api/pos/display/revoke/route.ts',
      'src/app/api/pos/terminals/[id]/pairing-code/route.ts',
      'src/lib/pos/display/server/displayAuth.ts',
    ]);
    // Y ninguno de esos ficheros es de navegador.
    for (const rel of salida) expect(leer(rel)).not.toMatch(/^['"]use client['"]/m);
  });

  it('el middleware excluye /api/pos/display/ del matcher', () => {
    const src = leer('src/middleware.ts');
    const matcher = src.slice(src.indexOf('export const config'));
    expect(matcher).toMatch(/api\/pos\/display\//);
    // Y la ruta con sesión (pairing-code) NO está excluida: la protege el middleware además del handler.
    expect(matcher).not.toMatch(/api\/pos\/terminals/);
  });

  it('el JWT de Realtime no lleva ningún claim que alguna política lea como confianza', async () => {
    const { REALTIME_JWT_FORBIDDEN_CLAIMS, REALTIME_JWT_PAYLOAD_KEYS, decodeJwtPayload, signRealtimeJwt, REALTIME_JWT_TTL_SECONDS } = await import(
      '@/lib/pos/display/server/displayTokens'
    );
    const { token } = signRealtimeJwt('x'.repeat(40), { terminalId: TERMINAL.toUpperCase(), now: 1_700_000_000_000 });
    const payload = decodeJwtPayload(token)!;
    expect(Object.keys(payload).sort()).toEqual([...REALTIME_JWT_PAYLOAD_KEYS].sort());
    for (const prohibido of REALTIME_JWT_FORBIDDEN_CLAIMS) expect(payload[prohibido]).toBeUndefined();
    // El claim del canal va en minúsculas, como el topic.
    expect(payload.pos_terminal_id).toBe(TERMINAL);
    expect(payload.role).toBe('anon');
    expect(Number(payload.exp) - Number(payload.iat)).toBe(REALTIME_JWT_TTL_SECONDS);
  });
});
