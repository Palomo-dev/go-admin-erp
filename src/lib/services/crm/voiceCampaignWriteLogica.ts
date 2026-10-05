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
  .extend({ expected_updated_at: z.string().datetime({ offset: true }).optional() })
  .strict();
export const voiceCampaignVersionSchema = voiceCampaignUpdateSchema.pick({ expected_updated_at: true });
export const voiceCampaignStopSchema = voiceCampaignVersionSchema.extend({ reason: z.string().trim().min(3).max(2000) }).strict();
/** Claves traducidas; los mensajes internos de Postgres no se muestran en la interfaz. */
export function voiceCampaignErrorKey(code: string | null): string {
  const keys: Record<string, string> = {
    campana_modificada: 'archivoConflicto', llamadas_activas: 'archivoVozConciliacion', creditos_pendientes: 'archivoVozConciliacion',
    verificacion_rne_requerida: 'bloqueos.rne', politica_datos_requerida: 'bloqueos.policy',
    agente_no_encontrado: 'bloqueos.agent', canal_no_disponible: 'bloqueos.channel', saldo_insuficiente: 'bloqueos.balance',
    audiencia_vacia: 'bloqueos.audience', audiencia_no_editable: 'bloqueos.audienceLocked', estado_invalido: 'bloqueos.state',
  };
  return code ? keys[code] ?? 'errorAccion' : 'errorAccion';
}
