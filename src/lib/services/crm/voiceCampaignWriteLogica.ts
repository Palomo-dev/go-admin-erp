import { z } from "zod";
const fields = {
  name: z.string().trim().min(1).max(200),
  voice_agent_id: z.string().uuid(),
  objective: z.string().max(2000).nullable().optional(),
  target_source: z
    .enum([
      "segment",
      "pipeline_stage",
      "manual_list",
      "sequence_step",
      "followup_due",
    ])
    .optional(),
  target_config: z.record(z.string(), z.unknown()).optional(),
  schedule: z.record(z.string(), z.unknown()).optional(),
  max_calls_per_day: z.number().int().min(1).max(500).optional(),
  max_calls_per_hour: z.number().int().min(1).max(500).optional(),
  max_concurrent: z.number().int().min(1).max(100).optional(),
  status: z
    .enum(["draft", "scheduled", "running", "paused", "completed"])
    .optional(),
  emergency_stop: z.literal(false).optional(),
};
export const voiceCampaignCreateSchema = z.object(fields).strict();
export const voiceCampaignUpdateSchema = voiceCampaignCreateSchema
  .partial()
  .strict();
