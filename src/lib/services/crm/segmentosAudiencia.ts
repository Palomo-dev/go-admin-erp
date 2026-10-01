import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError, exigirUuid } from './crmErrors';
import { coincideSegmento, normalizarFiltroSegmento, prefiltroIgualdadSegmento, type ClienteSegmento } from './segmentosLogica';
import { normalizarNumeroRne } from './voiceAgent/rne';

export interface SegmentoRegistro {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  filter_json: unknown;
  is_dynamic: boolean;
  customer_count: number;
  members_snapshotted_at: string | null;
  updated_at: string;
  created_at: string;
  last_run_at: string | null;
}
export interface CifrasSegmento {
  total: number;
  base: number;
  with_phone: number;
  with_email: number;
  whatsapp_opt_in: number;
  rne_excluded: number;
  voice_contactable: number;
  email_contactable: number;
  whatsapp_contactable: number;
}
export interface LecturaSegmento {
  counts: CifrasSegmento;
  samples: ClienteSegmento[];
  members: ClienteSegmento[];
  ids: string[];
  as_of: string;
  has_more: boolean;
}
export async function obtenerSegmento(orgId: number, id: string, client: SupabaseClient): Promise<SegmentoRegistro> {
  exigirUuid(id);
  const { data, error } = await client
    .from('segments')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CrmHttpError(404, 'segmento_no_encontrado', 'Segmento no encontrado');
  return data as SegmentoRegistro;
}

/** Cursor de UUID: ninguna audiencia depende del máximo de 1.000 filas de PostgREST. */
export async function leerAudienciaSegmento(
  orgId: number,
  client: SupabaseClient,
  options: {
    filter?: unknown;
    segment?: SegmentoRegistro;
    page?: number;
    pageSize?: number;
    collectIds?: boolean;
    maxIds?: number;
    signal?: AbortSignal;
  },
): Promise<LecturaSegmento> {
  const segment = options.segment;
  const staticId = segment?.is_dynamic === false ? segment.id : null;
  if (segment && segment.organization_id !== orgId)
    throw new CrmHttpError(404, 'segmento_no_encontrado', 'Segmento no encontrado');
  if (staticId && !segment?.members_snapshotted_at)
    throw new CrmHttpError(409, 'snapshot_requerido', 'Este segmento estático necesita guardar sus miembros');
  const filter = staticId ? null : normalizarFiltroSegmento(options.filter ?? segment?.filter_json);
  const prefilter = filter ? prefiltroIgualdadSegmento(filter) : null;
  const batchSize = 1000;
  const now = new Date();
  const asOf = now.toISOString();
  const counts: CifrasSegmento = {
    total: 0,
    base: 0,
    with_phone: 0,
    with_email: 0,
    whatsapp_opt_in: 0,
    rne_excluded: 0,
    voice_contactable: 0,
    email_contactable: 0,
    whatsapp_contactable: 0,
  };
  const members: ClienteSegmento[] = [],
    samples: ClienteSegmento[] = [],
    ids: string[] = [];
  const size = options.pageSize ?? 25,
    start = ((options.page ?? 1) - 1) * size;
  let after: string | null = null;
  for (;;) {
    options.signal?.throwIfAborted();
    let candidates: string[] | null = null;
    if (prefilter) {
      let query = client.from('customers').select('id').eq('organization_id', orgId).neq('status', 'merged')
        .eq(prefilter.field, prefilter.value).order('id').limit(batchSize);
      if (after) query = query.gt('id', after);
      if (options.signal) query = query.abortSignal(options.signal);
      const result = await query;
      if (result.error) throw result.error;
      candidates = (result.data ?? []).map((row: { id: string }) => row.id);
      if (!candidates.length) break;
    }
    let rpc = client.rpc('crm_segment_context_page', {
      p_org: orgId,
      p_after: after,
      p_limit: batchSize,
      p_customers: candidates,
      p_segment: staticId,
      p_as_of: asOf,
    });
    if (options.signal) rpc = rpc.abortSignal(options.signal);
    const { data, error } = await rpc;
    if (error) throw error;
    if (!Array.isArray(data)) throw new CrmHttpError(500, 'contexto_invalido', 'No se pudo leer la audiencia');
    const rows = data as ClienteSegmento[];
    if (!rows.length && !candidates) break;
    counts.base += rows.length;
    const matches = filter ? rows.filter((c) => coincideSegmento(filter, c, orgId, now)) : rows;
    const phones = [...new Set(matches.map((c) => normalizarNumeroRne(c.phone)).filter((p): p is string => !!p))];
    const excluded = new Set<string>();
    if (phones.length) {
      let query = client.rpc('crm_segment_excluded_phones', {
        p_org: orgId,
        p_phones: phones,
      });
      if (options.signal) query = query.abortSignal(options.signal);
      const result = await query;
      if (result.error) throw result.error;
      if (!Array.isArray(result.data))
        throw new CrmHttpError(500, 'exclusiones_invalidas', 'No se pudo comprobar la audiencia');
      for (const entry of result.data as Array<{ phone: string }>) excluded.add(entry.phone);
    }
    for (const row of matches) {
      const phone = normalizarNumeroRne(row.phone),
        blocked = !!phone && excluded.has(phone);
      const email = !!row.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email);
      const whatsappOptIn = row.consent?.whatsapp === 'opted_in';
      const member = {
        ...row,
        rne_excluded: blocked,
        voice_contactable: !!phone && !blocked && row.can_voice,
        email_contactable: email && !row.email_bounced && row.can_email,
        whatsapp_contactable: !!phone && !blocked && whatsappOptIn && row.can_whatsapp,
      };
      if (samples.length < 3) samples.push(member);
      if (counts.total >= start && members.length < size) members.push(member);
      counts.total++;
      counts.with_phone += Number(!!phone);
      counts.with_email += Number(email);
      counts.whatsapp_opt_in += Number(whatsappOptIn);
      counts.rne_excluded += Number(blocked);
      counts.voice_contactable += Number(member.voice_contactable);
      counts.email_contactable += Number(member.email_contactable);
      counts.whatsapp_contactable += Number(member.whatsapp_contactable);
      if (options.collectIds) {
        if (ids.length >= (options.maxIds ?? 100000))
          throw new CrmHttpError(413, 'audiencia_demasiado_grande', 'Reduce el tamaño de la audiencia');
        ids.push(row.id);
      }
    }
    const next = candidates?.at(-1) ?? rows.at(-1)?.id;
    if (!next || (after && next <= after))
      throw new CrmHttpError(500, 'cursor_invalido', 'No se pudo continuar la lectura');
    after = next;
    if ((candidates?.length ?? rows.length) < batchSize) break;
  }
  if (staticId || prefilter) {
    const result = await client
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .neq('status', 'merged').or(`created_at.is.null,created_at.lte.${asOf}`);
    if (result.error) throw result.error;
    if (result.count === null)
      throw new CrmHttpError(500, 'conteo_no_disponible', 'No se pudo contar la base de clientes');
    counts.base = result.count;
  }
  return {
    counts,
    samples,
    members,
    ids,
    as_of: asOf,
    has_more: counts.total > start + size,
  };
}
