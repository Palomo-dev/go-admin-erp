/**
 * Número del pedido web — SOLO servidor. Un único punto para generarlo, leer y guardar los
 * ajustes de la organización y averiguar de qué tienda es una referencia de pago (regla 7).
 * Lo puro (formatos, validación, resolución) vive en `@/lib/pos/pedidosWeb/numeroPedido`.
 *
 * Mientras la migración `web_order_number_settings` + `siguiente_numero_pedido_web` no esté
 * aplicada, todo se comporta como antes: número `WO-{org}-…`, ajustes por defecto y «Guardar»
 * responde `no_disponible`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AJUSTES_NUMERO_POR_DEFECTO,
  numeroLegado,
  prefijosCandidatos,
  resolverOrganizacionReferencia,
  type AjustesNumeroPedido,
  type FormatoNumeroPedido,
  type ReferenciaResuelta,
} from '@/lib/pos/pedidosWeb/numeroPedido';

export const TABLA_AJUSTES_NUMERO = 'web_order_number_settings';
export const RPC_SIGUIENTE_NUMERO = 'siguiente_numero_pedido_web';
/** Índice único de `web_orders.order_number` (la migración lo crea con este nombre). */
export const INDICE_NUMERO_UNICO = 'web_orders_order_number_key';
/** Intentos de guardar el pedido si el número chocó (código corto repetido o carrera). */
export const INTENTOS_NUMERO = 3;

type ErrorPg = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

const NO_EXISTE = /does not exist|could not find|schema cache/i;

/** La tabla o la función aún no existen (migración sin aplicar). */
export function objetoAusente(error: ErrorPg): boolean {
  return !!error && (error.code === '42P01' || error.code === '42883' || error.code === 'PGRST202' || error.code === 'PGRST205' || NO_EXISTE.test(error.message ?? ''));
}

/** ¿El insert falló porque el número ya existe? (no otro índice único, p. ej. el de la ronda de mesa) */
export function esNumeroRepetido(error: ErrorPg): boolean {
  if (!error || error.code !== '23505') return false;
  const texto = `${error.message ?? ''} ${error.details ?? ''}`;
  return texto.includes(INDICE_NUMERO_UNICO) || /\(order_number\)/.test(texto);
}

/**
 * Número para un pedido nuevo de la organización. El RPC entrega el consecutivo de forma atómica
 * o un código corto libre; devuelve null cuando la organización usa el formato de siempre. Si el
 * RPC no existe o falla, el formato de siempre: un pedido nunca se queda sin crear por el número.
 * Necesita un cliente con service role (el RPC solo se concede a `service_role`).
 */
export async function generarNumeroPedido(db: SupabaseClient, organizationId: number, ahora: () => number = Date.now): Promise<string> {
  const { data, error } = await db.rpc(RPC_SIGUIENTE_NUMERO, { p_organization_id: organizationId });
  if (!error && typeof data === 'string' && data.trim()) return data.trim();
  if (error && !objetoAusente(error)) {
    console.warn('[numeroPedido] RPC falló; se usa el formato de siempre', { organizationId, code: error.code });
  }
  return numeroLegado(organizationId, ahora());
}

/**
 * Inserta el pedido pidiendo el número justo antes; si choca con uno existente (código corto
 * repetido, carrera), pide otro, hasta `INTENTOS_NUMERO` veces. `insertar` recibe el número.
 */
export async function insertarConNumero<T>(
  db: SupabaseClient,
  organizationId: number,
  insertar: (orderNumber: string) => PromiseLike<{ data: T | null; error: ErrorPg }>,
  ahora: () => number = Date.now,
): Promise<{ data: T | null; error: ErrorPg; orderNumber: string }> {
  let ultimo: { data: T | null; error: ErrorPg; orderNumber: string } = { data: null, error: null, orderNumber: '' };
  for (let i = 0; i < INTENTOS_NUMERO; i++) {
    const orderNumber = await generarNumeroPedido(db, organizationId, ahora);
    const r = await insertar(orderNumber);
    ultimo = { data: r.data, error: r.error, orderNumber };
    if (!esNumeroRepetido(r.error)) return ultimo;
  }
  return ultimo;
}

// ─── Ajustes ────────────────────────────────────────────────────────────────

export interface LecturaAjustesNumero {
  ajustes: AjustesNumeroPedido;
  /** false: la migración no está aplicada (se muestran los de siempre y no se puede guardar). */
  disponible: boolean;
}

export async function leerAjustesNumero(db: SupabaseClient, organizationId: number): Promise<LecturaAjustesNumero> {
  const { data, error } = await db.from(TABLA_AJUSTES_NUMERO).select('format, prefix').eq('organization_id', organizationId).maybeSingle();
  if (error) {
    if (objetoAusente(error)) return { ajustes: AJUSTES_NUMERO_POR_DEFECTO, disponible: false };
    throw new Error(error.message);
  }
  if (!data) return { ajustes: AJUSTES_NUMERO_POR_DEFECTO, disponible: true };
  const fila = data as { format: FormatoNumeroPedido; prefix: string | null };
  return { ajustes: { formato: fila.format, prefijo: fila.prefix ?? null }, disponible: true };
}

export type ResultadoGuardarNumero = { ok: true } | { ok: false; codigo: 'no_disponible' | 'prefijo_en_uso' | 'error' };

/**
 * Guarda los ajustes. Al cambiar de prefijo (o de formato) el consecutivo vuelve a 1; el RPC se
 * salta los números que ya existan. Los pedidos existentes NO se renombran.
 * `db` con service role: se llama después de validar organización y permiso.
 */
export async function guardarAjustesNumero(
  db: SupabaseClient,
  organizationId: number,
  userId: string | null,
  ajustes: AjustesNumeroPedido,
): Promise<ResultadoGuardarNumero> {
  const { data: previo, error: errLeer } = await db.from(TABLA_AJUSTES_NUMERO).select('format, prefix').eq('organization_id', organizationId).maybeSingle();
  if (errLeer) return { ok: false, codigo: objetoAusente(errLeer) ? 'no_disponible' : 'error' };
  const p = previo as { format: string; prefix: string | null } | null;
  const reinicia = !p || p.format !== ajustes.formato || (p.prefix ?? null) !== ajustes.prefijo;
  const fila: Record<string, unknown> = {
    organization_id: organizationId,
    format: ajustes.formato,
    prefix: ajustes.prefijo,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    ...(reinicia ? { next_number: 1 } : {}),
  };
  const { error } = await db.from(TABLA_AJUSTES_NUMERO).upsert(fila, { onConflict: 'organization_id' });
  if (!error) return { ok: true };
  if (objetoAusente(error)) return { ok: false, codigo: 'no_disponible' };
  if (error.code === '23505') return { ok: false, codigo: 'prefijo_en_uso' };
  console.error('[numeroPedido] no se guardaron los ajustes', { organizationId, code: error.code });
  return { ok: false, codigo: 'error' };
}

// ─── ¿De qué tienda es una referencia? ──────────────────────────────────────

/** Ajustes cuyos prefijos podrían ser los de estas referencias (vacío si la tabla no existe). */
export async function prefijosDeReferencias(db: SupabaseClient, referencias: ReadonlyArray<string | null | undefined>): Promise<Array<{ organization_id: number; prefix: string | null }>> {
  const candidatos = Array.from(new Set(referencias.flatMap((r) => prefijosCandidatos(r))));
  if (candidatos.length === 0) return [];
  const salida: Array<{ organization_id: number; prefix: string | null }> = [];
  for (let i = 0; i < candidatos.length; i += 200) {
    const { data, error } = await db.from(TABLA_AJUSTES_NUMERO).select('organization_id, prefix').in('prefix', candidatos.slice(i, i + 200));
    if (error) {
      if (objetoAusente(error)) return [];
      throw new Error(error.message);
    }
    for (const f of (data as Array<{ organization_id: number; prefix: string | null }> | null) ?? []) salida.push({ organization_id: Number(f.organization_id), prefix: f.prefix });
  }
  return salida;
}

/**
 * De qué tienda es una referencia de pago: busca el pedido por `order_number` en `web_orders` (de
 * cualquier organización) y toma su `organization_id`; si no hay pedido, el prefijo viejo
 * `WO-{org}-` o el prefijo configurado. `pedidos` evita repetir la consulta si ya se hizo.
 */
export async function organizacionDeReferencia(
  db: SupabaseClient,
  referencia: string | null | undefined,
  pedidos?: ReadonlyArray<{ organization_id: number; order_number: string }>,
): Promise<ReferenciaResuelta> {
  const ref = String(referencia ?? '').trim();
  if (!ref) return resolverOrganizacionReferencia({ referencia: ref });
  let conNumero = pedidos;
  if (!conNumero) {
    const { data, error } = await db.from('web_orders').select('organization_id, order_number').eq('order_number', ref).limit(5);
    if (error) throw new Error(error.message);
    conNumero = ((data as Array<{ organization_id: number; order_number: string }> | null) ?? []).map((f) => ({ organization_id: Number(f.organization_id), order_number: String(f.order_number) }));
  }
  const prefijos = await prefijosDeReferencias(db, [ref]);
  return resolverOrganizacionReferencia({ referencia: ref, pedidos: conNumero, prefijos });
}
