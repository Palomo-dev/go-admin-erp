/**
 * Política de inteligencia de llamadas por organización — SOLO SERVIDOR.
 *
 * DESVIACIÓN respecto a FASE-04 §3.1: las columnas `comm_settings.call_ai_*`
 * NO existen en la BD (verificado 2026-09-08) y F4 no ejecuta DDL. Mientras DB
 * no las cree, la política vive en `provider_configs.settings`:
 *   - category `stt`      → { language_code, dual_transcribe, auto_transcribe, min_duration_seconds, async_webhook }
 *   - category `analysis` → { model, auto_apply: 'auto'|'suggest', stage_confidence_threshold, auto_analyze }
 * Se editan con PUT /api/crm/config/providers (REG) o desde `CallAiPolicyCard`.
 */

import { getProviderSettings } from '@/lib/services/providerCredentials.server';

export type ApplyPolicy = 'auto' | 'suggest';

export interface CallAiPolicy {
  /** Proveedor STT preferido (`elevenlabs` | `google` | `openai`). */
  sttProvider: string;
  /** Proveedor de análisis (`google` | `openai`). */
  analysisProvider: string;
  analysisModel: string;
  language: string;
  dualTranscribe: boolean;
  autoTranscribe: boolean;
  autoAnalyze: boolean;
  apply: ApplyPolicy;
  stageConfidenceThreshold: number;
  minDurationSeconds: number;
  /** Webhook async de ElevenLabs (requiere ELEVENLABS_STT_WEBHOOK_ID). */
  asyncWebhook: boolean;
  source: { stt: 'org' | 'env' | 'none'; analysis: 'org' | 'env' | 'none' };
}

export const DEFAULT_CALL_AI_POLICY: Omit<CallAiPolicy, 'source'> = {
  sttProvider: 'elevenlabs',
  analysisProvider: 'google',
  // gemini-3.8-flash: GA 2-sep-2026, único Flash con SKU sembrado y verificado en
  // `provider_pricing` (gemini_3_8_flash_in/out). `gemini-2.5-flash` aparece en
  // ListModels pero responde 404 "no longer available to new users" con la key
  // del proyecto (comprobado en la E2E de F4), así que no sirve como default.
  analysisModel: 'gemini-3.8-flash',
  language: 'spa',
  dualTranscribe: true,
  autoTranscribe: true,
  autoAnalyze: true,
  apply: 'suggest',
  stageConfidenceThreshold: 0.8,
  minDurationSeconds: 5,
  asyncWebhook: false,
};

function bool(v: unknown, d: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return d;
}
function num(v: unknown, d: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
}

/** Construye la política desde los settings efectivos (puro; testeable). */
export function policyFromSettings(
  stt: { provider: string; settings: Record<string, unknown>; source: 'org' | 'env' | 'none' },
  analysis: { provider: string; settings: Record<string, unknown>; source: 'org' | 'env' | 'none' },
): CallAiPolicy {
  const d = DEFAULT_CALL_AI_POLICY;
  const s = stt.settings ?? {};
  const a = analysis.settings ?? {};
  const applyRaw = String(a.auto_apply ?? a.apply_policy ?? d.apply);
  return {
    sttProvider: stt.provider && stt.provider !== 'none' ? stt.provider : d.sttProvider,
    analysisProvider: analysis.provider && analysis.provider !== 'none' ? analysis.provider : d.analysisProvider,
    analysisModel: typeof a.model === 'string' && a.model ? a.model : d.analysisModel,
    language: typeof s.language_code === 'string' && s.language_code ? s.language_code : d.language,
    dualTranscribe: bool(s.dual_transcribe, d.dualTranscribe),
    autoTranscribe: bool(s.auto_transcribe, d.autoTranscribe),
    autoAnalyze: bool(a.auto_analyze, d.autoAnalyze),
    apply: applyRaw === 'auto' ? 'auto' : 'suggest',
    stageConfidenceThreshold: num(a.stage_confidence_threshold, d.stageConfidenceThreshold, 0, 1),
    minDurationSeconds: num(s.min_duration_seconds, d.minDurationSeconds, 0, 3600),
    asyncWebhook: bool(s.async_webhook, d.asyncWebhook) && !!process.env.ELEVENLABS_STT_WEBHOOK_ID,
    source: { stt: stt.source, analysis: analysis.source },
  };
}

export async function getCallAiPolicy(orgId: number): Promise<CallAiPolicy> {
  const [stt, analysis] = await Promise.all([
    getProviderSettings(orgId, 'stt').catch(() => ({ provider: 'none', settings: {}, source: 'none' as const })),
    getProviderSettings(orgId, 'analysis').catch(() => ({ provider: 'none', settings: {}, source: 'none' as const })),
  ]);
  return policyFromSettings(stt, analysis);
}
