/**
 * Número del pedido web en el servidor: el RPC atómico, el respaldo al formato de siempre, el
 * reintento cuando el número choca con el índice único y los ajustes. Con mocks, sin base.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  INDICE_NUMERO_UNICO,
  INTENTOS_NUMERO,
  RPC_SIGUIENTE_NUMERO,
  esNumeroRepetido,
  generarNumeroPedido,
  guardarAjustesNumero,
  insertarConNumero,
  leerAjustesNumero,
  organizacionDeReferencia,
} from '../numeroPedidoServer';
import { fakeDbPedidos } from './fakeDbPedidos';

const AHORA = () => 1793979846000;
const LEGADO = /^WO-333-[A-Z0-9]+-[A-Z0-9]{4}$/;
const choque = { code: '23505', message: `duplicate key value violates unique constraint "${INDICE_NUMERO_UNICO}"` };

/** Consecutivo atómico como el del RPC: cada llamada entrega el siguiente. */
function dbConsecutivo(prefijo = 'PED') {
  let n = 0;
  return fakeDbPedidos({}, (fn) => (fn === RPC_SIGUIENTE_NUMERO ? { data: `${prefijo}-${String(++n).padStart(4, '0')}`, error: null } : { data: null, error: null }));
}

describe('generar el número', () => {
  test('con prefijo: el que entrega el RPC, para la organización de quien llama', async () => {
    const db = dbConsecutivo();
    expect(await generarNumeroPedido(db as unknown as SupabaseClient, 333, AHORA)).toBe('PED-0001');
    expect(await generarNumeroPedido(db as unknown as SupabaseClient, 333, AHORA)).toBe('PED-0002');
    expect(db.rpcs).toEqual([
      { fn: RPC_SIGUIENTE_NUMERO, args: { p_organization_id: 333 } },
      { fn: RPC_SIGUIENTE_NUMERO, args: { p_organization_id: 333 } },
    ]);
  });

  test('por defecto (RPC null), sin migración o con el RPC caído: el formato de siempre', async () => {
    const respuestas = [
      { data: null, error: null },
      { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.siguiente_numero_pedido_web' } },
      { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
    ];
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const r of respuestas) {
      const db = fakeDbPedidos({}, () => r as { data: unknown; error: { message: string } | null });
      expect(await generarNumeroPedido(db as unknown as SupabaseClient, 333, AHORA)).toMatch(LEGADO);
    }
    // Solo el error real se registra; la migración sin aplicar no ensucia los registros.
    expect(aviso).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });
});

describe('unicidad', () => {
  test('el choque del índice único de order_number se reconoce; otros no', () => {
    expect(esNumeroRepetido(choque)).toBe(true);
    expect(esNumeroRepetido({ code: '23505', message: 'x', details: 'Key (order_number)=(PED-0001) already exists.' })).toBe(true);
    expect(esNumeroRepetido({ code: '23505', message: 'duplicate key value violates unique constraint "idx_web_orders_round_key"' })).toBe(false);
    expect(esNumeroRepetido({ code: '23514', message: 'check' })).toBe(false);
    expect(esNumeroRepetido(null)).toBe(false);
  });

  test('si el número ya existe, se pide otro y el pedido queda con el nuevo', async () => {
    const db = dbConsecutivo();
    const existentes = new Set(['PED-0001']);
    const intentos: string[] = [];
    const r = await insertarConNumero(db as unknown as SupabaseClient, 333, async (n) => {
      intentos.push(n);
      if (existentes.has(n)) return { data: null, error: choque };
      existentes.add(n);
      return { data: { id: 'p1', order_number: n }, error: null };
    }, AHORA);
    expect(intentos).toEqual(['PED-0001', 'PED-0002']);
    expect(r).toMatchObject({ orderNumber: 'PED-0002', data: { order_number: 'PED-0002' }, error: null });
  });

  test('dos pedidos seguidos nunca comparten número', async () => {
    const db = dbConsecutivo();
    const usados: string[] = [];
    for (let i = 0; i < 5; i++) {
      await insertarConNumero(db as unknown as SupabaseClient, 333, async (n) => {
        usados.push(n);
        return { data: { id: String(i) }, error: null };
      }, AHORA);
    }
    expect(new Set(usados).size).toBe(5);
  });

  test('con tope de intentos, y sin reintentar errores que no son del número', async () => {
    let n = 0;
    const r = await insertarConNumero(dbConsecutivo() as unknown as SupabaseClient, 333, async () => {
      n++;
      return { data: null, error: choque };
    }, AHORA);
    expect(n).toBe(INTENTOS_NUMERO);
    expect(esNumeroRepetido(r.error)).toBe(true);

    let m = 0;
    await insertarConNumero(dbConsecutivo() as unknown as SupabaseClient, 333, async () => {
      m++;
      return { data: null, error: { code: '23503', message: 'fk' } };
    }, AHORA);
    expect(m).toBe(1);
  });
});

describe('ajustes', () => {
  test('sin fila: el formato de siempre', async () => {
    const db = fakeDbPedidos({ web_order_number_settings: [] });
    expect(await leerAjustesNumero(db as unknown as SupabaseClient, 333)).toEqual({ ajustes: { formato: 'actual', prefijo: null }, disponible: true });
  });

  test('migración sin aplicar: por defecto y no disponible; guardar responde no_disponible', async () => {
    const ausente = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.web_order_number_settings' in the schema cache" } };
    const db = {
      from: () => {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          upsert: async () => ausente,
          maybeSingle: async () => ausente,
        };
        return q;
      },
    } as unknown as SupabaseClient;
    expect(await leerAjustesNumero(db, 333)).toEqual({ ajustes: { formato: 'actual', prefijo: null }, disponible: false });
    expect(await guardarAjustesNumero(db, 333, 'u1', { formato: 'consecutivo', prefijo: 'PED' })).toEqual({ ok: false, codigo: 'no_disponible' });
  });

  test('guardar: upsert por organización; al cambiar de prefijo el consecutivo vuelve a 1; prefijo de otra tienda → prefijo_en_uso', async () => {
    const upserts: Array<Record<string, unknown>> = [];
    let previo: Record<string, unknown> | null = { format: 'consecutivo', prefix: 'PED' };
    let errorUpsert: { code: string; message: string } | null = null;
    const db = {
      from: () => {
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: previo, error: null }),
          upsert: async (fila: Record<string, unknown>, opciones: { onConflict: string }) => {
            expect(opciones.onConflict).toBe('organization_id');
            upserts.push(fila);
            return { data: null, error: errorUpsert };
          },
        };
        return q;
      },
    } as unknown as SupabaseClient;

    expect(await guardarAjustesNumero(db, 333, 'u1', { formato: 'consecutivo', prefijo: 'PED' })).toEqual({ ok: true });
    expect(upserts[0]).toMatchObject({ organization_id: 333, format: 'consecutivo', prefix: 'PED', updated_by: 'u1' });
    expect(upserts[0]).not.toHaveProperty('next_number');

    expect(await guardarAjustesNumero(db, 333, 'u1', { formato: 'consecutivo', prefijo: 'VENTA' })).toEqual({ ok: true });
    expect(upserts[1]).toMatchObject({ prefix: 'VENTA', next_number: 1 });

    previo = null;
    errorUpsert = { code: '23505', message: 'duplicate key value violates unique constraint "web_order_number_settings_prefix_key"' };
    expect(await guardarAjustesNumero(db, 339, 'u2', { formato: 'corto', prefijo: 'PED' })).toEqual({ ok: false, codigo: 'prefijo_en_uso' });
  });
});

describe('de qué tienda es una referencia (busca el pedido por order_number)', () => {
  const db = fakeDbPedidos({
    web_orders: [
      { id: 'a', organization_id: 333, order_number: 'PED-0007' },
      { id: 'b', organization_id: 339, order_number: 'WO-339-MW434LF5-3KDP' },
    ],
    web_order_number_settings: [{ organization_id: 339, format: 'corto', prefix: 'MI-TIENDA' }],
  }) as unknown as SupabaseClient;

  test('número nuevo: la organización del pedido', async () => {
    expect(await organizacionDeReferencia(db, 'PED-0007')).toMatchObject({ organizacion: 333, fuente: 'pedido' });
  });
  test('número viejo: la organización del pedido; sin pedido, la del prefijo WO-{org}-', async () => {
    expect(await organizacionDeReferencia(db, 'WO-339-MW434LF5-3KDP')).toMatchObject({ organizacion: 339, fuente: 'pedido' });
    expect(await organizacionDeReferencia(db, 'WO-333-PERDIDO-AAAA')).toMatchObject({ organizacion: 333, fuente: 'legado' });
  });
  test('número nuevo sin pedido: la tienda dueña del prefijo', async () => {
    expect(await organizacionDeReferencia(db, 'MI-TIENDA-K7M2QX')).toMatchObject({ organizacion: 339, fuente: 'prefijo' });
    expect(await organizacionDeReferencia(db, 'LINK_123')).toMatchObject({ organizacion: null });
  });
});
