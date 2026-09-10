/**
 * "Redactar con IA" (FASE-07 §4.5): gpt-5.6-luna con structured outputs
 * (`responses.parse` + `zodTextFormat`, docs-openai.md), contexto de la
 * oportunidad (etapa, contacto, cotización, último análisis de llamada) y
 * débito de créditos con `withAiCharge` (REG aiCostService) ANTES de llamar.
 * Devuelve subject + preheader + bloques (BlockDocument listo para el editor).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { withAiCharge } from '@/lib/services/crm/aiCostService';
import { EmailError } from './types';
import { buildContext, VARIABLE_CATALOG, type RenderContext } from './variables';
import { newBlockId, parseBlockDocument, type BlockDocument } from './blocks';

export type DraftTone = 'formal' | 'cercano' | 'directo' | 'entusiasta';
export type DraftGoal = 'seguimiento' | 'propuesta' | 'demo' | 'reactivar' | 'cobrar' | 'agradecer' | 'custom';

export interface DraftEmailInput {
  opportunityId?: string | null;
  customerId?: string | null;
  tone?: DraftTone;
  goal?: DraftGoal;
  customGoal?: string;
  templateId?: string | null;
  language?: 'es' | 'en';
  extraInstructions?: string;
}

export interface DraftEmailOutput {
  subject: string;
  preheader: string;
  blocks: BlockDocument;
  plain_text: string;
  usage: { prompt_tokens: number; completion_tokens: number };
  credits_used: number;
  model: string;
}

export const DRAFT_MODEL = process.env.OPENAI_EMAIL_DRAFT_MODEL || 'gpt-5.6-luna';

const DraftSchema = z.object({
  subject: z.string().max(120),
  preheader: z.string().max(140),
  blocks: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('text'), html: z.string() }),
        z.object({ type: z.literal('button'), label: z.string().max(40), href: z.string() }),
        z.object({ type: z.literal('divider') }),
      ]),
    )
    .min(1)
    .max(8),
  plain_text: z.string(),
});

const SYSTEM_ES = `Eres un redactor comercial senior en español (Colombia). Escribes correos breves, claros y humanos para vendedores de un CRM.
Reglas:
- Usa SOLO variables del catálogo permitido con la sintaxis {{ruta}} o {{ruta|valor por defecto}} (ej. {{contact.first_name|hola}}). Nunca inventes datos: si no tienes un dato, usa una variable con default.
- Los bloques "text" llevan HTML simple (<p>, <strong>, <ul><li>). Sin scripts, sin estilos.
- Máximo 8 bloques, 1 botón como mucho, tono según lo pedido. No agregues firma ni pie legal (se añaden automáticamente).
- El asunto no supera 80 caracteres y no usa mayúsculas sostenidas ni spam words.`;

function summarizeContext(ctx: RenderContext, analysis: Record<string, unknown> | null) {
  return {
    contact: ctx.contact,
    opportunity: ctx.opportunity ?? null,
    org: { name: ctx.org.name, website: ctx.org.website },
    seller: ctx.user ? { name: ctx.user.full_name, job_title: ctx.user.job_title } : null,
    quote: ctx.quote ? { number: ctx.quote.number, total: ctx.quote.total, currency: ctx.quote.currency, valid_until: ctx.quote.valid_until, items: (ctx.quote.items ?? []).slice(0, 8) } : null,
    last_call_analysis: analysis,
  };
}

async function loadLastCallAnalysis(orgId: number, opportunityId: string | null, supabase: SupabaseClient): Promise<Record<string, unknown> | null> {
  if (!opportunityId) return null;
  const { data: calls } = await supabase.from('calls').select('id').eq('organization_id', orgId).eq('opportunity_id', opportunityId).order('started_at', { ascending: false }).limit(5);
  const ids = ((calls ?? []) as { id: string }[]).map((c) => c.id);
  if (ids.length === 0) return null;
  const { data } = await supabase.from('call_analyses').select('summary, sentiment, next_steps, detected_objections, created_at').eq('organization_id', orgId).in('call_id', ids).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export function draftToDocument(blocks: z.infer<typeof DraftSchema>['blocks']): BlockDocument {
  const items: Array<Record<string, unknown>> = [{ id: newBlockId('header'), type: 'header', props: {} }];
  for (const b of blocks) {
    if (b.type === 'text') items.push({ id: newBlockId('text'), type: 'text', props: { html: b.html } });
    else if (b.type === 'button') items.push({ id: newBlockId('button'), type: 'button', props: { label: b.label, href: /^(https?:|mailto:|tel:|\{\{)/.test(b.href) ? b.href : `{{custom.link|${b.href}}}` } });
    else items.push({ id: newBlockId('divider'), type: 'divider', props: {} });
  }
  items.push({ id: newBlockId('signature'), type: 'signature', props: { source: 'user_default' } });
  items.push({ id: newBlockId('footer_legal'), type: 'footer_legal', props: {} });
  return parseBlockDocument({ version: 1, settings: {}, blocks: items });
}

export async function draftEmail(orgId: number, userId: string | null, input: DraftEmailInput, supabase: SupabaseClient): Promise<DraftEmailOutput> {
  if (!process.env.OPENAI_API_KEY) throw new EmailError('AI_UNAVAILABLE', 'OPENAI_API_KEY no configurada', 503);
  const opportunityId = input.opportunityId ?? null;
  const ctx = await buildContext(orgId, { customerId: input.customerId ?? null, opportunityId, userId }, supabase);
  if (opportunityId && !ctx.opportunity) throw new EmailError('NOT_FOUND', 'Oportunidad no encontrada', 404);
  const analysis = await loadLastCallAnalysis(orgId, opportunityId, supabase);
  const goal = input.goal === 'custom' ? input.customGoal || 'seguimiento' : input.goal || 'seguimiento';
  const userPayload = {
    tone: input.tone ?? 'cercano', goal, language: input.language ?? 'es', extra_instructions: input.extraInstructions ?? null,
    context: summarizeContext(ctx, analysis), variables_allowed: VARIABLE_CATALOG.map((v) => v.path),
  };
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return withAiCharge(
    { orgId, actionType: 'email_draft', model: DRAFT_MODEL, units: 3000, unitSku: 'gpt_5_6_luna_in', provider: 'openai', credits: 1, userId, metadata: { opportunity_id: opportunityId, goal } },
    async (charge) => {
      const res = await openai.responses.parse({
        model: DRAFT_MODEL,
        reasoning: { effort: 'none' as never },
        store: false,
        input: [
          { role: 'system', content: SYSTEM_ES },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
        text: { format: zodTextFormat(DraftSchema, 'email_draft') },
      });
      const parsed = res.output_parsed;
      if (!parsed) {
        const refusal = res.output?.some((o) => (o as { type?: string }).type === 'refusal' || ((o as { content?: Array<{ type?: string }> }).content ?? []).some((c) => c.type === 'refusal'));
        throw new EmailError(refusal ? 'AI_REFUSED' : 'AI_EMPTY', 'La IA no devolvió un borrador válido', 422);
      }
      return {
        subject: parsed.subject, preheader: parsed.preheader, blocks: draftToDocument(parsed.blocks), plain_text: parsed.plain_text,
        usage: { prompt_tokens: res.usage?.input_tokens ?? 0, completion_tokens: res.usage?.output_tokens ?? 0 }, credits_used: charge.credits, model: DRAFT_MODEL,
      };
    },
  );
}
