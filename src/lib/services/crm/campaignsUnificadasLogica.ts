/** Proyección única de campañas; mantiene los estados del motor de mensajes. */
import { effectiveCampaignStatus, type CampaignConfig } from "./whatsapp/types";
import { TERMINAL_VAC_STATUSES } from "./voiceAgent/callStatusMap";
import { politicaDatosValida } from "./voiceAgent/cumplimiento";
import { verificacionRneRegistradaVigente } from "./voiceAgent/rne";
export interface CampanaUnificadaRaw {
  id: string;
  name: string;
  source: "voice" | "message";
  channel: "voice" | "whatsapp" | "email";
  status: string;
  created_at: string;
  scheduled_at: string | null;
  stats: CampaignConfig | null;
  segment_name: string;
  content_name: string | null;
  emergency_stop: boolean;
  stopped_reason: string | null;
  rne_valid_until: string | null;
  rne_numbers_in_file: number | null;
  voice_counts: Record<string, number>;
  data_policy_url: string | null;
}
export function proyectarCampana(c: CampanaUnificadaRaw, now: Date) {
  const counts = c.stats?.counts;
  const voiceTotal = Object.values(c.voice_counts).reduce(
    (sum, n) => sum + Number(n),
    0,
  );
  const voiceDone = (
    [...TERMINAL_VAC_STATUSES, "transferred", "skipped"] as string[]
  ).reduce((sum, k) => sum + Number(c.voice_counts[k] ?? 0), 0);
  const total =
    c.source === "voice"
      ? voiceTotal
      : (c.stats?.total_contacts ?? counts?.total ?? 0);
  const done =
    c.source === "voice"
      ? voiceDone
      : counts
        ? Number(counts.sent ?? 0) + Number(counts.failed ?? 0) + Number(counts.skipped ?? 0)
        : (c.stats?.sent_count ?? 0);
  const reasons =
    c.source === "voice"
      ? [
          ...(!verificacionRneRegistradaVigente(c.rne_valid_until && c.rne_numbers_in_file !== null
            ? { valid_until: c.rne_valid_until, numbers_in_file: c.rne_numbers_in_file } : null, now) ? ["rne"] : []),
          ...(!politicaDatosValida(c.data_policy_url) ? ["policy"] : []),
        ]
      : [];
  const state =
    c.source === "voice"
      ? c.emergency_stop
        ? "stopped"
        : ["running", "scheduled"].includes(c.status) && reasons.length
          ? "blocked"
          : c.status
      : effectiveCampaignStatus(c.status, c.stats);
  return {
    id: c.id,
    name: c.name,
    source: c.source,
    channel: c.channel,
    status: state,
    segmentName: c.segment_name,
    contentName: c.content_name,
    scheduledAt: c.scheduled_at,
    createdAt: c.created_at,
    stoppedReason: c.stopped_reason,
    blockedReasons: reasons,
    progress: {
      done,
      total,
      pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
    },
    result:
      c.source === "voice"
        ? {
            completed:
              Number(c.voice_counts.completed ?? 0) +
              Number(c.voice_counts.transferred ?? 0),
            failed: Number(c.voice_counts.failed ?? 0),
            active: Number(c.voice_counts.in_progress ?? 0),
          }
        : {
            delivered: counts?.delivered ?? 0,
            read: counts?.read ?? 0,
            replied: counts?.replied ?? 0,
          },
  };
}
