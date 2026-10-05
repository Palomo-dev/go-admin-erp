import { cifrasSegmentoVacias, sumarCifrasSegmento, type CifrasSegmento } from './segmentosCifrasLogica';
export { cifrasSegmentoVacias, sumarCifrasSegmento } from './segmentosCifrasLogica';
export type { CifrasSegmento } from './segmentosCifrasLogica';
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmHttpError, exigirUuid } from "./crmErrors";
import {
  coincideSegmento,
  normalizarFiltroSegmento,
  prefiltroIgualdadSegmento,
  type ClienteSegmento,
} from "./segmentosLogica";
import type { ConditionGroup } from "./automation/conditionsDsl";
import { normalizarNumeroRne } from "./voiceAgent/rne";

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
  counts_json?: CifrasSegmento | null;
  counted_at?: string | null;
  count_error?: string | null;
  count_job_id?: string | null;
  usage?: { campaigns: number; voice_campaigns: number; sequences: number };
}
export interface LecturaSegmento {
  counts: CifrasSegmento;
  samples: ClienteSegmento[];
  members: ClienteSegmento[];
  ids: string[];
  as_of: string;
  has_more: boolean;
}
export async function obtenerSegmento(
  orgId: number,
  id: string,
  client: SupabaseClient,
): Promise<SegmentoRegistro> {
  exigirUuid(id);
  const { data, error } = await client
    .from("segments")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new CrmHttpError(
      404,
      "segmento_no_encontrado",
      "Segmento no encontrado",
    );
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
    throw new CrmHttpError(
      404,
      "segmento_no_encontrado",
      "Segmento no encontrado",
    );
  if (staticId && !segment?.members_snapshotted_at)
    throw new CrmHttpError(
      409,
      "snapshot_requerido",
      "Este segmento estático necesita guardar sus miembros",
    );
  const filter = staticId
    ? null
    : normalizarFiltroSegmento(options.filter ?? segment?.filter_json);
  const prefilter = filter ? prefiltroIgualdadSegmento(filter) : null;
  const now = new Date();
  const asOf = now.toISOString();
  let counts = cifrasSegmentoVacias();
  const members: ClienteSegmento[] = [],
    samples: ClienteSegmento[] = [],
    ids: string[] = [];
  const size = options.pageSize ?? 25,
    start = ((options.page ?? 1) - 1) * size;
  let after: string | null = null;
  for (;;) {
    const page = await leerPaginaSegmento(orgId, client, {
      filter,
      staticId,
      after,
      asOf,
      signal: options.signal,
    });
    const previous = counts.total;
    counts = sumarCifrasSegmento(counts, page.counts);
    page.members.forEach((row, index) => {
      if (samples.length < 3) samples.push(row);
      if (previous + index >= start && members.length < size) members.push(row);
      if (options.collectIds) {
        if (ids.length >= (options.maxIds ?? 100000))
          throw new CrmHttpError(
            413,
            "audiencia_demasiado_grande",
            "Reduce el tamaño de la audiencia",
          );
        ids.push(row.id);
      }
    });
    after = page.after;
    if (page.done) break;
  }
  if (staticId || prefilter) {
    const result = await client
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .neq("status", "merged")
      .or(`created_at.is.null,created_at.lte.${asOf}`);
    if (result.error) throw result.error;
    if (result.count === null)
      throw new CrmHttpError(
        500,
        "conteo_no_disponible",
        "No se pudo contar la base de clientes",
      );
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

/** Una página sirve al preview, materialización y recálculo reanudable; el evaluador es único. */
export async function leerPaginaSegmento(
  orgId: number,
  client: SupabaseClient,
  input: {
    filter: ConditionGroup | null;
    staticId?: string | null;
    after?: string | null;
    asOf: string;
    signal?: AbortSignal;
  },
): Promise<{
  counts: CifrasSegmento;
  members: ClienteSegmento[];
  after: string | null;
  done: boolean;
}> {
  const counts = cifrasSegmentoVacias(),
    members: ClienteSegmento[] = [];
  const prefilter = input.filter
    ? prefiltroIgualdadSegmento(input.filter)
    : null;
  const batchSize = 1000;
  input.signal?.throwIfAborted();
  let candidates: string[] | null = null;
  if (prefilter) {
    let query = client
      .from("customers")
      .select("id")
      .eq("organization_id", orgId)
      .neq("status", "merged")
      .eq(prefilter.field, prefilter.value)
      .order("id")
      .limit(batchSize);
    if (input.after) query = query.gt("id", input.after);
    if (input.signal) query = query.abortSignal(input.signal);
    const result = await query;
    if (result.error) throw result.error;
    candidates = (result.data ?? []).map((row: { id: string }) => row.id);
    if (!candidates.length)
      return { counts, members: [], after: input.after ?? null, done: true };
  }
  let rpc = client.rpc("crm_segment_context_page", {
    p_org: orgId,
    p_after: input.after ?? null,
    p_limit: batchSize,
    p_customers: candidates,
    p_segment: input.staticId ?? null,
    p_as_of: input.asOf,
  });
  if (input.signal) rpc = rpc.abortSignal(input.signal);
  const { data, error } = await rpc;
  if (error) throw error;
  if (!Array.isArray(data))
    throw new CrmHttpError(
      500,
      "contexto_invalido",
      "No se pudo leer la audiencia",
    );
  const rows = data as ClienteSegmento[];
  if (!rows.length && !candidates)
    return { counts, members: [], after: input.after ?? null, done: true };
  counts.base += rows.length;
  const matches = input.filter
    ? rows.filter((c) =>
        coincideSegmento(input.filter!, c, orgId, new Date(input.asOf)),
      )
    : rows;
  const phones = [
    ...new Set(
      matches
        .map((c) => normalizarNumeroRne(c.phone))
        .filter((p): p is string => !!p),
    ),
  ];
  const excluded = new Set<string>();
  if (phones.length) {
    let query = client.rpc("crm_segment_excluded_phones", {
      p_org: orgId,
      p_phones: phones,
    });
    if (input.signal) query = query.abortSignal(input.signal);
    const result = await query;
    if (result.error) throw result.error;
    if (!Array.isArray(result.data))
      throw new CrmHttpError(
        500,
        "exclusiones_invalidas",
        "No se pudo comprobar la audiencia",
      );
    for (const entry of result.data as Array<{ phone: string }>)
      excluded.add(entry.phone);
  }
  for (const row of matches) {
    const phone = normalizarNumeroRne(row.phone),
      blocked = !!phone && excluded.has(phone);
    const email = !!row.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email);
    const whatsappOptIn = row.consent?.whatsapp === "opted_in";
    const member = {
      ...row,
      rne_excluded: blocked,
      voice_contactable: !!phone && !blocked && row.can_voice,
      email_contactable: email && !row.email_bounced && row.can_email,
      whatsapp_contactable:
        !!phone && !blocked && whatsappOptIn && row.can_whatsapp,
    };
    members.push(member);
    counts.total++;
    counts.with_phone += Number(!!phone);
    counts.with_email += Number(email);
    counts.whatsapp_opt_in += Number(whatsappOptIn);
    counts.rne_excluded += Number(blocked);
    counts.voice_contactable += Number(member.voice_contactable);
    counts.email_contactable += Number(member.email_contactable);
    counts.whatsapp_contactable += Number(member.whatsapp_contactable);
  }
  const next = candidates?.at(-1) ?? rows.at(-1)?.id;
  if (!next || (input.after && next <= input.after))
    throw new CrmHttpError(
      500,
      "cursor_invalido",
      "No se pudo continuar la lectura",
    );
  return {
    counts,
    members,
    after: next,
    done: (candidates?.length ?? rows.length) < batchSize,
  };
}
