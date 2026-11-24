/**
 * Duplicados y fusión de clientes (Figma CRM 1436:19 «Duplicados — listo»,
 * 1438:1553 «Fusión — error, nada cambió»). Todo en RPC transaccionales
 * aplicadas (verificadas por MCP el 2026-10-06), con la sesión del usuario:
 *  - `crm_find_duplicates(p_org)`: grupos por teléfono (8 últimos dígitos),
 *    correo y documento, con conteos (permiso `crm.customers.view`);
 *  - `crm_merge_customers(p_org, p_primary, p_secondaries[1], p_choices)`:
 *    mueve conversaciones, oportunidades, llamadas, identidades, facturas en
 *    borrador, actividades y contactos de campaña; aplica los campos elegidos;
 *    archiva el secundario (no lo borra) y deja la foto para deshacer
 *    (`crm.customers.merge`; bloquea si hay factura emitida);
 *  - `crm_unmerge_customer(p_org, p_merge)`: deshace dentro de 30 días (solo
 *    administrador);
 *  - `crm_exclude_customer_pair`: «no son el mismo».
 * Lecturas de las pantallas (Figma 1436:843123 «Comparar y fusionar» y
 * 1436:843665 «Historial y deshacer»): `compararClientes` y `listarFusiones`,
 * con el cliente de la sesión (RLS de `customer_merges`: `crm.customers.merge`).
 * Antes la fusión eran N escrituras sueltas desde el navegador, sin
 * transacción ni forma de deshacer. SOLO servidor.
 */
export { CAMPOS_FUSION, type CampoFusion, type ClienteDuplicado, type GrupoDuplicados } from './customerMergeLogica';
import { z } from 'zod';
import {
  CAMPOS_FUSION,
  TABLAS_MOVIDAS,
  estadoDeshacer,
  idsConDependientes,
  sinParejasExcluidas,
  type ClienteComparado,
  type FusionHistorial,
  type GrupoDuplicados,
  type MotivoFusion,
  type TablaMovida,
} from './customerMergeLogica';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, tienePermisoCrm, type CrmSesion } from './crmRouteSupport';

export const fusionSchema = z
  .object({
    primary_id: z.string().uuid(),
    secondary_id: z.string().uuid(),
    choices: z.record(z.enum(CAMPOS_FUSION), z.string().uuid()).default({}),
  })
  .strict()
  .refine((v) => v.primary_id !== v.secondary_id, { message: 'seleccion_invalida' })
  .refine((v) => Object.values(v.choices).every((id) => id === v.primary_id || id === v.secondary_id), { message: 'eleccion_invalida' });

export const exclusionSchema = z.object({ a: z.string().uuid(), b: z.string().uuid() }).strict().refine((v) => v.a !== v.b);

/** Mismo criterio que `crm_unmerge_customer` (rol 1 o 2, o superadministrador): solo decide qué se pinta; la RPC lo vuelve a exigir. */
function esAdministradorOrg(ctx: CrmSesion): boolean {
  return ctx.isSuperAdmin || ctx.roleId === 1 || ctx.roleId === 2;
}

export async function buscarDuplicados(
  ctx: CrmSesion,
): Promise<{ grupos: GrupoDuplicados[]; puedeFusionar: boolean; puedeDeshacer: boolean; clientesRevisados: number | null }> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'buscar duplicados');
  const [dup, excl, puedeFusionar, revisados] = await Promise.all([
    ctx.supabase.rpc('crm_find_duplicates', { p_org: ctx.organizationId }),
    ctx.supabase.from('customer_merge_exclusions').select('customer_a,customer_b').eq('organization_id', ctx.organizationId),
    tienePermisoCrm(ctx, CRM_PERMISOS.clientesFusionar),
    // Lo mismo que revisa la RPC (clientes no archivados por una fusión), sin traer filas.
    ctx.supabase.from('customers').select('id', { count: 'estimated', head: true }).eq('organization_id', ctx.organizationId).neq('status', 'merged'),
  ]);
  if (dup.error) throw dup.error;
  if (excl.error) throw excl.error;
  const grupos = sinParejasExcluidas((dup.data ?? []) as GrupoDuplicados[], (excl.data ?? []) as { customer_a: string; customer_b: string }[]);
  return {
    grupos,
    puedeFusionar,
    puedeDeshacer: puedeFusionar && esAdministradorOrg(ctx),
    clientesRevisados: revisados.error ? null : (revisados.count ?? null),
  };
}

export async function fusionarClientes(ctx: CrmSesion, body: unknown) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'fusionar clientes');
  const p = fusionSchema.safeParse(body);
  if (!p.success) throw new CrmHttpError(400, 'seleccion_invalida', 'Selección de fusión inválida');
  const v = p.data;
  const { data, error } = await ctx.supabase.rpc('crm_merge_customers', {
    p_org: ctx.organizationId,
    p_primary: v.primary_id,
    p_secondaries: [v.secondary_id],
    p_choices: v.choices,
  });
  if (error) throw error;
  return data as { id: string; primary_customer_id: string; moved_counts: { table: string; count: number }[] | null };
}

export async function deshacerFusion(ctx: CrmSesion, mergeId: string) {
  exigirUuid(mergeId, 'Fusión');
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'deshacer fusión');
  const { data, error } = await ctx.supabase.rpc('crm_unmerge_customer', { p_org: ctx.organizationId, p_merge: mergeId });
  if (error) throw error;
  return data as { id: string; undone: boolean };
}

export async function excluirPareja(ctx: CrmSesion, body: unknown) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'marcar no duplicados');
  const p = exclusionSchema.safeParse(body);
  if (!p.success) throw new CrmHttpError(400, 'seleccion_invalida', 'Pareja inválida');
  const v = p.data;
  const { error } = await ctx.supabase.rpc('crm_exclude_customer_pair', { p_org: ctx.organizationId, p_a: v.a, p_b: v.b });
  if (error) throw error;
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Comparar (solo lectura)
// ---------------------------------------------------------------------------

const CAMPOS_COMPARADOS =
  'id, full_name, first_name, last_name, email, phone, company_name, trade_name, identification_type, identification_number, address, city, created_at, customer_type, lead_source, status';

/** Ids de la comparación: 2 a 10 uuid distintos (un grupo de duplicados). */
export const compararSchema = z
  .array(z.string().uuid())
  .min(2)
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length);

type FilaComparada = Omit<ClienteComparado, 'whatsapp' | 'conteos' | 'conversations_count' | 'opportunities_count'> & { status: string | null };
type ConteosCliente = ClienteComparado['conteos'];

/**
 * Los registros de un grupo, lado a lado, con lo que la fusión movería y lo
 * que se queda en el archivado (Figma 1436:843123). Solo lectura: la
 * organización sale de la sesión y cada id se valida contra ella.
 */
export async function compararClientes(ctx: CrmSesion, idsCrudos: unknown): Promise<{ clientes: ClienteComparado[]; puedeFusionar: boolean; puedeDeshacer: boolean }> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesVer], 'comparar clientes');
  const p = compararSchema.safeParse(idsCrudos);
  if (!p.success) throw new CrmHttpError(400, 'seleccion_invalida', 'Elige entre 2 y 10 clientes distintos');
  const ids = p.data;
  const org = ctx.organizationId;
  const db = ctx.supabase;

  const [clientes, identidades, puedeFusionar] = await Promise.all([
    db.from('customers').select(CAMPOS_COMPARADOS).eq('organization_id', org).in('id', ids),
    db.from('customer_channel_identities').select('customer_id, identity_value, channel:channels(type)').eq('organization_id', org).in('customer_id', ids),
    tienePermisoCrm(ctx, CRM_PERMISOS.clientesFusionar),
  ]);
  if (clientes.error) throw clientes.error;
  if (identidades.error) throw identidades.error;
  const filas = (clientes.data ?? []) as unknown as FilaComparada[];
  if (filas.length !== ids.length) throw new CrmHttpError(404, 'cliente_no_encontrado', 'Uno de los clientes ya no existe');
  if (filas.some((f) => f.status === 'merged')) throw new CrmHttpError(409, 'registro_cambio', 'Uno de los clientes ya fue fusionado');

  const contar = async (tabla: string, id: string, soloEmitidas = false): Promise<number> => {
    let q = db.from(tabla).select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('customer_id', id);
    // El mismo criterio con el que la RPC bloquea la fusión: no borrador o con rastro DIAN.
    if (soloEmitidas) q = q.or('status.neq.draft,xml_uuid.not.is.null,einvoice_status.not.is.null');
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };

  const conteos: ConteosCliente[] = await Promise.all(
    filas.map(async (c) => {
      const [conversaciones, oportunidades, llamadas, idents, facturas, facturasEmitidas, ventas, cartera] = await Promise.all([
        contar('conversations', c.id),
        contar('opportunities', c.id),
        contar('calls', c.id),
        contar('customer_channel_identities', c.id),
        contar('invoice_sales', c.id),
        contar('invoice_sales', c.id, true),
        contar('sales', c.id),
        contar('accounts_receivable', c.id),
      ]);
      return { conversaciones, oportunidades, llamadas, identidades: idents, facturas, facturasEmitidas, ventas, cartera };
    }),
  );

  const whatsapp = new Map<string, string[]>();
  type FilaIdentidad = { customer_id: string; identity_value: string; channel: { type: string | null } | { type: string | null }[] | null };
  for (const i of (identidades.data ?? []) as unknown as FilaIdentidad[]) {
    const canal = Array.isArray(i.channel) ? i.channel[0] : i.channel;
    if (canal?.type !== 'whatsapp') continue;
    whatsapp.set(i.customer_id, [...(whatsapp.get(i.customer_id) ?? []), i.identity_value]);
  }

  // Mismo orden en que llegaron los ids (la pantalla propone el principal).
  const porId = new Map(filas.map((f, i) => [f.id, { f, n: conteos[i] }]));
  return {
    puedeFusionar,
    puedeDeshacer: puedeFusionar && esAdministradorOrg(ctx),
    clientes: ids.map((id) => {
      const { f, n } = porId.get(id)!;
      const { status: _s, ...resto } = f;
      void _s;
      return { ...resto, whatsapp: whatsapp.get(id) ?? [], conteos: n, conversations_count: n.conversaciones, opportunities_count: n.oportunidades };
    }),
  };
}

// ---------------------------------------------------------------------------
// Historial (solo lectura)
// ---------------------------------------------------------------------------

const MOTIVOS: readonly MotivoFusion[] = ['document', 'email', 'phone', 'manual'];
export const DIAS_HISTORIAL = 90;

type Perfil = { id: string; first_name: string | null; last_name: string | null; email: string | null };

/**
 * Historial de fusiones de los últimos 90 días (Figma 1436:843665). Del
 * snapshot solo se piden rutas pequeñas (nombres, motivo, ids movidos): las
 * copias completas de las filas movidas no viajan.
 */
export async function listarFusiones(ctx: CrmSesion): Promise<{ fusiones: FusionHistorial[]; puedeDeshacer: boolean; dias: number }> {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.clientesFusionar], 'historial de fusiones');
  const desde = new Date(Date.now() - DIAS_HISTORIAL * 86_400_000).toISOString();
  const movidos = TABLAS_MOVIDAS.map((_, i) => `t${i}:moved_rows->${i}->>table, n${i}:moved_rows->${i}->ids`).join(', ');
  const nombres = (['primary', 'secondary'] as const)
    .flatMap((l) => ['full_name', 'company_name', 'trade_name'].map((c) => `${l[0]}_${c}:snapshot->before->${l}->>${c}`))
    .join(', ');
  const { data, error } = await ctx.supabase
    .from('customer_merges')
    .select(`id, primary_customer_id, secondary_customer_id, merged_by, merged_at, undone_at, reason:snapshot->>reason, depends_on:snapshot->depends_on, ${nombres}, ${movidos}`)
    .eq('organization_id', ctx.organizationId)
    .gte('merged_at', desde)
    .order('merged_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const filas = (data ?? []) as unknown as Record<string, unknown>[];

  const usuarios = [...new Set(filas.map((f) => f.merged_by).filter((v): v is string => typeof v === 'string'))];
  let perfiles: Perfil[] = [];
  if (usuarios.length) {
    const r = await ctx.supabase.from('profiles').select('id, first_name, last_name, email').in('id', usuarios);
    if (r.error) throw r.error;
    perfiles = (r.data ?? []) as Perfil[];
  }
  const nombreUsuario = new Map(perfiles.map((u) => [u.id, [u.first_name, u.last_name].map((v) => v?.trim()).filter(Boolean).join(' ') || u.email || null]));

  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const nombre = (f: Record<string, unknown>, l: 'p' | 's') => texto(f[`${l}_full_name`]) ?? texto(f[`${l}_company_name`]) ?? texto(f[`${l}_trade_name`]);
  const lista = filas.map((f) => ({
    f,
    undone_at: (f.undone_at as string | null) ?? null,
    depends_on: Array.isArray(f.depends_on) ? (f.depends_on as unknown[]).filter((x): x is string => typeof x === 'string') : [],
  }));
  const conDependientes = idsConDependientes(lista);
  const admin = esAdministradorOrg(ctx);

  const fusiones: FusionHistorial[] = lista.map(({ f, undone_at }) => {
    const movidosFila: { tabla: TablaMovida; n: number }[] = [];
    TABLAS_MOVIDAS.forEach((_, i) => {
      const tabla = f[`t${i}`];
      const idsMovidos = f[`n${i}`];
      if (typeof tabla === 'string' && (TABLAS_MOVIDAS as readonly string[]).includes(tabla) && Array.isArray(idsMovidos) && idsMovidos.length > 0) {
        movidosFila.push({ tabla: tabla as TablaMovida, n: idsMovidos.length });
      }
    });
    const base = { id: f.id as string, merged_at: f.merged_at as string, undone_at };
    return {
      ...base,
      principal: { id: f.primary_customer_id as string, nombre: nombre(f, 'p') },
      secundario: { id: f.secondary_customer_id as string, nombre: nombre(f, 's') },
      motivo: MOTIVOS.includes(f.reason as MotivoFusion) ? (f.reason as MotivoFusion) : 'manual',
      movidos: movidosFila,
      quien: nombreUsuario.get(f.merged_by as string) ?? null,
      estado: estadoDeshacer(base, conDependientes, admin),
    };
  });
  return { fusiones, puedeDeshacer: admin, dias: DIAS_HISTORIAL };
}
