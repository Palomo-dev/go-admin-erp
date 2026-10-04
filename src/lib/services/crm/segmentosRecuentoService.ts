import { z } from "zod";
import type { JobContext } from "@/lib/jobs/types";
import { JobFatalError } from "@/lib/jobs/types";
import {
  leerPaginaSegmento,
  obtenerSegmento,
  sumarCifrasSegmento,
} from "./segmentosAudiencia";
import {
  normalizarFiltroSegmento,
  prefiltroIgualdadSegmento,
} from "./segmentosLogica";

const instant = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
const count = z.number().int().nonnegative().max(2147483647);
const payloadSchema = z.object({
  segment_id: z.string().uuid(),
  expected_updated_at: instant,
  as_of: instant,
  after: z.string().uuid().nullable(),
  counts: z.object({ total: count, base: count, with_phone: count, with_email: count,
    whatsapp_opt_in: count, rne_excluded: count, voice_contactable: count,
    email_contactable: count, whatsapp_contactable: count }).strict(),
});

/** Una página por trabajo; la RPC confirma versión y cursor junto con la siguiente página. */
export async function ejecutarRecuentoSegmento(ctx: JobContext) {
  const parsed = payloadSchema.safeParse(ctx.job.payload);
  if (!parsed.success || Date.parse(parsed.data.as_of) > Date.now())
    throw new JobFatalError("Recuento de segmento inválido");
  const payload = parsed.data;
  let segment;
  try {
    segment = await obtenerSegmento(
      ctx.orgId,
      payload.segment_id,
      ctx.supabase,
    );
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404)
      return { skipped: true, reason: "segment_deleted" };
    throw error;
  }
  if (
    segment.count_job_id !== ctx.job.id ||
    Date.parse(segment.updated_at) !== Date.parse(payload.expected_updated_at)
  )
    return { skipped: true, reason: "version_changed" };
  const args = {
    p_org: ctx.orgId,
    p_id: segment.id,
    p_job: ctx.job.id,
    p_expected: payload.expected_updated_at,
    p_as_of: payload.as_of,
    p_after: payload.after,
    p_counts: payload.counts,
    p_done: false,
    p_error: null as string | null,
  };
  try {
    ctx.signal.throwIfAborted();
    const staticId = segment.is_dynamic === false ? segment.id : null;
    if (staticId && !segment.members_snapshotted_at)
      throw new JobFatalError("Snapshot de segmento requerido");
    const filter = staticId
      ? null
      : normalizarFiltroSegmento(segment.filter_json);
    const page = await leerPaginaSegmento(ctx.orgId, ctx.supabase, {
      staticId,
      filter,
      after: payload.after,
      asOf: payload.as_of,
      signal: ctx.signal,
    });
    const counts = sumarCifrasSegmento(
      payload.counts,
      page.counts,
    );
    if (
      page.done &&
      (staticId || (filter && prefiltroIgualdadSegmento(filter)))
    ) {
      const base = await ctx.supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.orgId)
        .neq("status", "merged")
        .or(
          `created_at.is.null,created_at.lte.${new Date(payload.as_of).toISOString()}`,
        )
        .abortSignal(ctx.signal);
      if (base.error) throw base.error;
      if (base.count === null) throw new Error("Conteo de base no disponible");
      counts.base = base.count;
    }
    ctx.signal.throwIfAborted();
    const { data, error } = await ctx.supabase
      .rpc("crm_continue_segment_recount", {
        ...args,
        p_after: page.after,
        p_counts: counts,
        p_done: page.done,
      })
      .abortSignal(ctx.signal);
    if (error) throw error;
    return data as Record<string, unknown>;
  } catch (error) {
    // Un corte de presupuesto conserva el cursor para el reintento del runner.
    if (
      !ctx.signal.aborted &&
      (error instanceof JobFatalError ||
        ctx.job.attempts >= ctx.job.max_attempts)
    ) {
      const failed = await ctx.supabase.rpc("crm_continue_segment_recount", {
        ...args,
        p_error: "No se pudo actualizar el conteo",
      });
      if (failed.error) throw failed.error;
    }
    throw error;
  }
}
