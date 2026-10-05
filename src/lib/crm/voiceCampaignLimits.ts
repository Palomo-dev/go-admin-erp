/** Valores iniciales de campaña; los presupuestos del agente y de la organización siguen vigentes. */
export const DEFAULT_VOICE_CAMPAIGN_LIMITS = {
  max_calls_per_day: 120,
  max_calls_per_hour: 40,
  max_concurrent: 5,
} as const;

export const MAX_VOICE_CAMPAIGN_LIMITS = {
  max_calls_per_day: 500,
  max_calls_per_hour: 500,
  max_concurrent: 100,
} as const;

export type VoiceCampaignLimits = { [K in keyof typeof DEFAULT_VOICE_CAMPAIGN_LIMITS]: number };

export function voiceCampaignLimitsValid(limits: VoiceCampaignLimits): boolean {
  return (Object.keys(MAX_VOICE_CAMPAIGN_LIMITS) as Array<keyof VoiceCampaignLimits>)
    .every(key => Number.isInteger(limits[key]) && limits[key] > 0 && limits[key] <= MAX_VOICE_CAMPAIGN_LIMITS[key]);
}
