/**
 * Listas de precios — lado servidor de /api/listas-precios/** y /api/clientes/[id]/lista-precios.
 *
 * La organización es SIEMPRE la de la sesión (`ctx.organizationId`, de `withOrg`); las RPC
 * (20261124213200) la vuelven a comprobar: miembro activo para leer y
 * `pos.listas_precios.gestionar` para escribir. Se llaman con el cliente de la sesión
 * (`ctx.supabase`), nunca con service role: `auth.uid()` decide el permiso en la base.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS } from '@/lib/security/organizationBody';
import { codigoErrorLista, type CodigoErrorLista } from './tipos';

export const SIN_CACHE = { 'Cache-Control': 'no-store' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ErrorListaServidor extends Error {
  constructor(public readonly codigo: CodigoErrorLista) {
    super(codigo);
  }
}

const ESTADO_HTTP: Partial<Record<CodigoErrorLista, number>> = {
  sin_permiso: 403,
  no_encontrada: 404,
  no_encontrado: 404,
  nombre_duplicado: 409,
  regla_duplicada: 409,
  escalon_duplicado: 409,
  error_desconocido: 500,
};

export function respuestaError(ctx: Pick<ServerOrgContext, 'organizationId' | 'userId'>, codigo: CodigoErrorLista, ruta?: string): Response {
  if (codigo === 'sin_permiso') {
    console.warn('[listas-precios] permiso faltante → 403', { ruta: ruta ?? null, organizationId: ctx.organizationId, userId: ctx.userId });
  }
  return NextResponse.json({ error: codigo, codigo }, { status: ESTADO_HTTP[codigo] ?? 400, headers: SIN_CACHE });
}

/** Ejecuta y convierte el error de la RPC en una respuesta con código estable. */
export async function responder<T>(ctx: ServerOrgContext, ruta: string, fn: () => Promise<T>, status = 200): Promise<Response> {
  try {
    return NextResponse.json(await fn(), { status, headers: SIN_CACHE });
  } catch (err) {
    const codigo = err instanceof ErrorListaServidor ? err.codigo : codigoErrorLista(err);
    if (codigo === 'error_desconocido') console.error('[listas-precios]', ruta, err);
    return respuestaError(ctx, codigo, ruta);
  }
}

async function rpc<T>(ctx: ServerOrgContext, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(fn, { p_org: ctx.organizationId, ...args });
  if (error) throw new ErrorListaServidor(codigoErrorLista(error));
  return data as T;
}

export async function idDeRuta(
  routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined,
  clave = 'id',
): Promise<string | null> {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params[clave] === 'string' ? (params[clave] as string) : '';
  return UUID_RE.test(id) ? id : null;
}

export function sinClavesDeOrganizacion(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
    : raw;
}

// ── Esquemas ────────────────────────────────────────────────────────────────────────────────
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const porcentaje = z.number().min(-100).max(1000);

export const datosListaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  is_active: z.boolean(),
  effective_from: fecha,
  effective_to: fecha.nullable(),
  base_mode: z.enum(['percent', 'fixed_only']),
  base_percent: porcentaje,
  rounding_step: z.number().min(0).max(1_000_000),
  rounding_mode: z.enum(['down', 'nearest', 'up']),
  applies_to_pos: z.boolean(),
  applies_to_web: z.boolean(),
  applies_to_documents: z.boolean(),
  branches: z.array(z.number().int().positive()).max(500).nullable(),
  rules: z
    .array(
      z.object({
        scope: z.enum(['category', 'brand']),
        category_id: z.number().int().positive().nullable(),
        brand: z.string().trim().max(120).nullable(),
        adjust_percent: porcentaje.nullable(),
        no_discount: z.boolean(),
      }),
    )
    .max(500),
  items: z
    .array(z.object({ product_id: z.number().int().positive(), min_qty: z.number().positive().max(1_000_000), price: z.number().min(0).max(1e12) }))
    .max(20_000),
});

export const importarSchema = z.object({
  filas: z
    .array(
      z.object({
        fila: z.number().int().positive(),
        sku: z.string().max(120).nullable(),
        price: z.string().max(40).nullable(),
        min_qty: z.string().max(40).nullable(),
      }),
    )
    .max(5000),
  reemplazar: z.boolean(),
  aplicar: z.boolean(),
});

export const asignarSchema = z.union([
  z.object({ customer_ids: z.array(z.string().regex(UUID_RE)).min(1).max(1000) }),
  z.object({ segment_id: z.string().regex(UUID_RE) }),
]);

export const quitarSchema = z.union([
  z.object({ customer_id: z.string().regex(UUID_RE) }),
  z.object({ segment_id: z.string().regex(UUID_RE) }),
]);

// ── Operaciones ─────────────────────────────────────────────────────────────────────────────
export const listasServidor = {
  resumen: (ctx: ServerOrgContext) => rpc(ctx, 'price_lists_overview', {}),
  detalle: (ctx: ServerOrgContext, id: string) => rpc(ctx, 'price_list_detail', { p_id: id }),
  clientes: (ctx: ServerOrgContext, id: string, q: string | null, limite: number, desde: number) =>
    rpc(ctx, 'price_list_customers', { p_id: id, p_search: q, p_limit: limite, p_offset: desde }),
  candidatosClientes: (ctx: ServerOrgContext, id: string, q: string | null) =>
    rpc(ctx, 'price_list_customer_candidates', { p_id: id, p_search: q, p_limit: 30 }),
  candidatosGrupos: (ctx: ServerOrgContext, id: string) => rpc(ctx, 'price_list_segment_candidates', { p_id: id }),
  guardar: async (ctx: ServerOrgContext, id: string | null, datos: z.infer<typeof datosListaSchema>) =>
    ({ id: await rpc<string>(ctx, 'price_list_save', { p_id: id, p_data: datos }) }),
  importar: (ctx: ServerOrgContext, id: string, d: z.infer<typeof importarSchema>) =>
    rpc(ctx, 'price_list_import', { p_id: id, p_rows: d.filas, p_replace: d.reemplazar, p_apply: d.aplicar }),
  asignar: async (ctx: ServerOrgContext, id: string, d: z.infer<typeof asignarSchema>) => {
    if ('segment_id' in d) {
      await rpc(ctx, 'price_list_assign_segment', { p_id: id, p_segment: d.segment_id });
      return { asignados: null };
    }
    return { asignados: await rpc<number>(ctx, 'price_list_assign_customers', { p_id: id, p_customer_ids: d.customer_ids }) };
  },
  quitar: async (ctx: ServerOrgContext, id: string, d: z.infer<typeof quitarSchema>) => {
    await rpc(ctx, 'price_list_remove_assignment', {
      p_id: id,
      p_customer: 'customer_id' in d ? d.customer_id : null,
      p_segment: 'segment_id' in d ? d.segment_id : null,
    });
    return { ok: true };
  },
  duplicar: async (ctx: ServerOrgContext, id: string, nombre: string) =>
    ({ id: await rpc<string>(ctx, 'price_list_duplicate', { p_id: id, p_name: nombre }) }),
  eliminar: async (ctx: ServerOrgContext, id: string) => {
    await rpc(ctx, 'price_list_delete', { p_id: id });
    return { ok: true };
  },
  ordenar: async (ctx: ServerOrgContext, ids: string[]) => {
    await rpc(ctx, 'price_list_reorder', { p_ids: ids });
    return { ok: true };
  },
  infoCliente: (ctx: ServerOrgContext, customerId: string) => rpc(ctx, 'customer_price_list_info', { p_customer: customerId }),
  cambiarListaCliente: async (ctx: ServerOrgContext, customerId: string, listaId: string | null) => {
    await rpc(ctx, 'customer_set_price_list', { p_customer: customerId, p_list: listaId });
    return { ok: true };
  },
};

export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
