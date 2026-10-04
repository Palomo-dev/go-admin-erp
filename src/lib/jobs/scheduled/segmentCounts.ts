import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobLogger } from "../types";

export async function runSegmentCounts(
  sb: SupabaseClient,
  log: JobLogger,
  signal: AbortSignal,
  opts: { budgetMs: number },
) {
  const deadline = Date.now() + Math.max(0, opts.budgetMs);
  let enqueued = 0;
  while (!signal.aborted && Date.now() < deadline) {
    const { data, error } = await sb
      .rpc("crm_enqueue_due_segment_recounts", { p_limit: 50 })
      .abortSignal(signal);
    if (error) throw error;
    const count = (data as { enqueued?: unknown } | null)?.enqueued;
    if (
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 50
    )
      throw new Error("Productor de segmentos inválido");
    enqueued += count;
    if (count < 50) {
      log.info("segment_counts_enqueued", { enqueued });
      return { enqueued, truncated: false };
    }
  }
  log.info("segment_counts_enqueue_deferred", { enqueued });
  return { enqueued, truncated: true };
}
