/**
 * Lecturas del importador de leads. SOLO SERVIDOR, con el cliente de la sesión
 * (`ctx.supabase`, RLS) y SIEMPRE filtradas por la organización de la sesión.
 *
 * Todas las lecturas van por bloques y son prefiltros: la decisión fina
 * (¿es el mismo teléfono / NIT / correo?) la toma `clienteCoincidente` en
 * memoria. Un error de lectura se LANZA: sin saber si el cliente existe no se
 * crea nada (se duplicaría).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { phoneSuffixPattern } from './phoneNormalize';
import { patronCorreos, patronNits, type ClienteCandidato } from '@/lib/crm/importacionLeads/dedupe';
import type { VerticalRef } from '@/lib/crm/importacionLeads/mapeo';

export interface LookupContext {
  organizationId: number;
  supabase: SupabaseClient;
}

/** Valores por consulta: mantiene la URL de PostgREST corta (≈ 3 KB). */
const BLOQUE = 80;

const COLUMNAS_CLIENTE = 'id, full_name, phone, email, identification_number, importacion:metadata->importacion';

function trozos<T>(lista: readonly T[], n: number = BLOQUE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

export interface ClavesBusqueda {
  /** Dígitos E.164 sin «+». */
  telefonos: string[];
  nits: string[];
  correos: string[];
  idsExternos: string[];
  lote: string;
}

/** Clientes (no fusionados) de la organización que PODRÍAN coincidir con alguna clave. */
export async function buscarCandidatos(ctx: LookupContext, claves: ClavesBusqueda): Promise<ClienteCandidato[]> {
  const porId = new Map<string, ClienteCandidato>();
  const base = () =>
    ctx.supabase.from('customers').select(COLUMNAS_CLIENTE).eq('organization_id', ctx.organizationId).neq('status', 'merged');
  const guardar = (data: unknown) => {
    for (const r of (data ?? []) as Array<ClienteCandidato & { metadata?: { importacion?: ClienteCandidato['importacion'] } }>) {
      porId.set(r.id, { ...r, importacion: r.importacion ?? r.metadata?.importacion ?? null });
    }
  };

  const consultas: Array<PromiseLike<{ data: unknown; error: { message: string } | null }>> = [];
  for (const t of trozos(Array.from(new Set(claves.telefonos)))) {
    // Últimos 4 dígitos con cualquier separador (`phoneSuffixPattern`), en una alternancia.
    consultas.push(base().filter('phone', 'imatch', `(?:${t.map(phoneSuffixPattern).join('|')})`));
  }
  for (const t of trozos(Array.from(new Set(claves.nits)))) consultas.push(base().filter('identification_number', 'imatch', patronNits(t)));
  for (const t of trozos(Array.from(new Set(claves.correos)))) consultas.push(base().filter('email', 'imatch', patronCorreos(t)));
  if (claves.lote) {
    for (const t of trozos(Array.from(new Set(claves.idsExternos)), 200)) {
      consultas.push(base().eq('metadata->importacion->>lote', claves.lote).in('metadata->importacion->>id_externo', t));
    }
  }

  for (const r of await Promise.all(consultas)) {
    if (r.error) throw new Error(`[leadsImport] customers: ${r.error.message}`);
    guardar(r.data);
  }
  return Array.from(porId.values());
}

/**
 * Clientes que ya se trabajan como lead en la organización (CRM ola 1, D2):
 *  - ficha con origen de lead (`lead_source`) y sin descartar —el lead es el
 *    cliente; cualquier etapa: si ya avanzó a oportunidad o cliente, tampoco se
 *    vuelve a marcar—, o
 *  - con una oportunidad `record_type='lead'` abierta (las heredadas).
 * Una ficha SIN origen no cuenta: `lifecycle_stage` vale 'lead' por defecto en
 * toda ficha nueva, así que ese valor solo no dice que alguien la esté
 * trabajando como prospecto; la importación la marca como lead («ligar»). Así
 * reimportar el mismo archivo no vuelve a escribir las fichas ligadas.
 */
export async function clientesConLeadAbierto(ctx: LookupContext, customerIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const t of trozos(Array.from(new Set(customerIds)), 150)) {
    const [fichas, heredados] = await Promise.all([
      ctx.supabase
        .from('customers')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .not('lead_source', 'is', null)
        .is('lead_discarded_at', null)
        .in('id', t),
      ctx.supabase
        .from('opportunities')
        .select('customer_id')
        .eq('organization_id', ctx.organizationId)
        .eq('record_type', 'lead')
        .eq('status', 'open')
        .in('customer_id', t),
    ]);
    if (fichas.error) throw new Error(`[leadsImport] customers: ${fichas.error.message}`);
    if (heredados.error) throw new Error(`[leadsImport] opportunities: ${heredados.error.message}`);
    for (const r of (fichas.data ?? []) as Array<{ id: string }>) out.add(r.id);
    for (const r of (heredados.data ?? []) as Array<{ customer_id: string | null }>) if (r.customer_id) out.add(r.customer_id);
  }
  return out;
}

/**
 * Números E.164 de la lista de excluidos de la organización (RNE o alta
 * manual, `crm_excluded_numbers`). Si la lectura falla se devuelve `null`: la
 * fila sigue «pendiente» de verificación, que ya impide llamarla.
 */
export async function numerosExcluidos(ctx: LookupContext, e164s: readonly string[]): Promise<Set<string> | null> {
  const out = new Set<string>();
  for (const t of trozos(Array.from(new Set(e164s)), 150)) {
    const { data, error } = await ctx.supabase
      .from('crm_excluded_numbers')
      .select('phone_e164')
      .eq('organization_id', ctx.organizationId)
      .in('phone_e164', t);
    if (error) {
      console.warn('[leadsImport] crm_excluded_numbers no se pudo leer; todo queda pendiente de RNE:', error.message);
      return null;
    }
    for (const r of (data ?? []) as Array<{ phone_e164: string }>) out.add(r.phone_e164);
  }
  return out;
}

/** Verticales ACTIVAS de la organización, en su orden. */
export async function verticalesActivas(ctx: LookupContext): Promise<VerticalRef[]> {
  const { data, error } = await ctx.supabase
    .from('verticals')
    .select('id, name, slug, sort_order')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(`[leadsImport] verticals: ${error.message}`);
  return ((data ?? []) as VerticalRef[]).map((v) => ({ id: v.id, name: v.name, slug: v.slug }));
}

/** Monedas asignadas a la organización (`organization_currencies`), en mayúsculas. */
export async function monedasDeOrganizacion(ctx: LookupContext): Promise<Set<string>> {
  const { data, error } = await ctx.supabase
    .from('organization_currencies')
    .select('currency_code')
    .eq('organization_id', ctx.organizationId);
  if (error) throw new Error(`[leadsImport] organization_currencies: ${error.message}`);
  return new Set(((data ?? []) as Array<{ currency_code: string | null }>).map((r) => String(r.currency_code ?? '').trim().toUpperCase()).filter(Boolean));
}
