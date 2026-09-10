/**
 * 6 plantillas base en español (FASE-07 §3.2). Idempotente por `name`
 * (org + channel='email'). Marcadas `metadata.is_system=true` (no borrables,
 * sí duplicables).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlockDocumentInput } from '../blocks';
import { parseBlockDocument } from '../blocks';
import { extractVariablePaths } from '../variables';

export interface EmailTemplateSeed {
  key: string;
  name: string;
  kind: 'transactional' | 'marketing';
  subject: string;
  preheader: string;
  description: string;
  blocks: BlockDocumentInput;
}

const settings = { width: 600, bg: '#f4f5f7', font: 'Inter, Arial, sans-serif', brand: { logo_url: '{{org.logo_url}}', primary_color: '#2563eb' } };
const header = { id: 'b_header', type: 'header' as const, props: { logo_url: '{{org.logo_url}}', alt: '{{org.name}}', align: 'left' as const } };
const signature = { id: 'b_sig', type: 'signature' as const, props: { source: 'user_default' as const } };
const footer = (unsubscribe = false) => ({ id: 'b_footer', type: 'footer_legal' as const, props: { company: '{{org.name}}', address: '{{org.address}}', unsubscribe } });
const text = (id: string, html: string) => ({ id, type: 'text' as const, props: { html } });
const button = (id: string, label: string, href: string) => ({ id, type: 'button' as const, props: { label, href, style: 'primary' as const, align: 'center' as const } });

export const EMAIL_TEMPLATE_SEEDS: EmailTemplateSeed[] = [
  {
    key: 'follow_up_call',
    name: 'Seguimiento tras llamada',
    kind: 'transactional',
    subject: 'Gracias por tu tiempo, {{contact.first_name|hola}}',
    preheader: 'Resumen y próximos pasos de nuestra conversación',
    description: 'Resumen de la llamada con próximos pasos y botón para agendar.',
    blocks: { version: 1, settings, blocks: [
      header,
      text('b1', '<p>Hola {{contact.first_name|hola}},</p><p>Gracias por la llamada de hoy. Te dejo el resumen de lo que conversamos:</p><p>{{custom.summary}}</p>'),
      text('b2', '<p><strong>Próximos pasos</strong></p><p>{{custom.next_steps|Te contacto en los próximos días para continuar.}}</p>'),
      button('b3', 'Agendar siguiente paso', '{{custom.next_step_url|https://}}'),
      signature, footer(false),
    ] },
  },
  {
    key: 'proposal_sent',
    name: 'Propuesta enviada',
    kind: 'transactional',
    subject: 'Propuesta {{opportunity.name}} para {{contact.company_name|tu empresa}}',
    preheader: 'Detalle de la propuesta y próximos pasos',
    description: 'Envío de propuesta con resumen de cotización y botón para verla.',
    blocks: { version: 1, settings, blocks: [
      header,
      text('b1', '<p>Hola {{contact.first_name|hola}},</p><p>Adjunto la propuesta de <strong>{{opportunity.name}}</strong> que preparamos para {{contact.company_name|tu empresa}}. Este es el resumen:</p>'),
      { id: 'b2', type: 'quote_summary', props: { title: 'Cotización {{quote.number}}', show_items: true, cta_label: 'Ver propuesta', cta_href: '{{quote.url}}' } },
      text('b3', '<p>Quedo atento a tus comentarios. Con gusto agendamos una llamada para resolver dudas.</p>'),
      signature, footer(false),
    ] },
  },
  {
    key: 'demo_reminder',
    name: 'Recordatorio de demo',
    kind: 'transactional',
    subject: 'Tu demo es {{custom.demo_date|pronto}}',
    preheader: 'Enlace y qué preparar para la demo',
    description: 'Recordatorio con enlace de reunión y qué preparar.',
    blocks: { version: 1, settings, blocks: [
      header,
      text('b1', '<p>Hola {{contact.first_name|hola}},</p><p>Te recuerdo que nuestra demo de <strong>{{opportunity.name}}</strong> es {{custom.demo_date|pronto}}.</p>'),
      button('b2', 'Unirme a la demo', '{{custom.meeting_url|https://}}'),
      { id: 'b3', type: 'divider', props: {} },
      text('b4', '<p><strong>Qué preparar</strong></p><ul><li>Tus preguntas sobre el producto</li><li>Un caso real para probar</li><li>Las personas de tu equipo que deben participar</li></ul>'),
      signature, footer(false),
    ] },
  },
  {
    key: 'reactivation',
    name: 'Reactivación',
    kind: 'marketing',
    subject: '¿Seguimos, {{contact.first_name|hola}}?',
    preheader: 'Retomemos la conversación cuando te venga bien',
    description: 'Correo de reactivación para oportunidades frías (marketing, con baja).',
    blocks: { version: 1, settings, blocks: [
      header,
      text('b1', '<p>Hola {{contact.first_name|hola}},</p><p>Hace un tiempo hablamos sobre <strong>{{opportunity.name|cómo podemos ayudarte}}</strong>. Quería saber si sigue siendo prioridad para ti y contarte qué hay de nuevo.</p>'),
      { id: 'b2', type: 'product_card', props: { name: '{{opportunity.name}}', description: 'Pensado para equipos como el tuyo.', price: '{{opportunity.amount|money}}', cta: 'Ver detalle', href: '{{opportunity.url}}' } },
      button('b3', 'Retomar la conversación', '{{custom.next_step_url|https://}}'),
      { id: 'b4', type: 'social', props: { links: [], align: 'center' } },
      footer(true),
    ] },
  },
  {
    key: 'thank_you_close',
    name: 'Agradecimiento por cierre',
    kind: 'transactional',
    subject: '¡Bienvenido a {{org.name}}!',
    preheader: 'Gracias por confiar en nosotros. Esto es lo que sigue',
    description: 'Bienvenida tras cerrar la venta con próximos pasos y contacto.',
    blocks: { version: 1, settings, blocks: [
      header,
      text('b1', '<p>Hola {{contact.first_name|hola}},</p><p>¡Gracias por confiar en {{org.name}}! Estamos felices de empezar a trabajar contigo en <strong>{{opportunity.name}}</strong>.</p>'),
      { id: 'b2', type: 'columns', props: { columns: [
        { title: 'Qué sigue', html: '<p>En los próximos días te contactará nuestro equipo para el arranque.</p>' },
        { title: 'Tu contacto', html: '<p>{{user.full_name}}<br/>{{user.email}}<br/>{{user.phone}}</p>' },
      ] } },
      signature, footer(false),
    ] },
  },
  {
    key: 'friendly_collection',
    name: 'Cobro amable',
    kind: 'transactional',
    subject: 'Recordatorio: pago pendiente {{opportunity.name}}',
    preheader: 'Un recordatorio amable sobre tu pago pendiente',
    description: 'Recordatorio de pago con monto y botón de pago.',
    blocks: { version: 1, settings, blocks: [
      header,
      text('b1', '<p>Hola {{contact.first_name|hola}},</p><p>Te escribo para recordarte que tienes un pago pendiente de <strong>{{opportunity.amount|money}}</strong> por <strong>{{opportunity.name}}</strong>.</p>'),
      button('b2', 'Pagar ahora', '{{custom.payment_url|https://}}'),
      text('b3', '<p>Si ya realizaste el pago, ignora este mensaje. Cualquier duda, responde a este correo y con gusto te ayudamos.</p>'),
      signature, footer(false),
    ] },
  },
];

/**
 * Inserta las plantillas que falten para la org. Devuelve cuántas creó.
 * Idempotente por (organization_id, channel='email', name).
 */
export async function seedEmailTemplates(orgId: number, supabase: SupabaseClient, userId?: string | null): Promise<number> {
  const { data: existing } = await supabase
    .from('templates')
    .select('name')
    .eq('organization_id', orgId)
    .eq('channel', 'email');
  const names = new Set(((existing ?? []) as { name: string }[]).map((r) => r.name.toLowerCase()));
  const rows = EMAIL_TEMPLATE_SEEDS.filter((s) => !names.has(s.name.toLowerCase())).map((s) => {
    const doc = parseBlockDocument(s.blocks);
    const variables = Array.from(new Set([...extractVariablePaths(JSON.stringify(doc)), ...extractVariablePaths(s.subject), ...extractVariablePaths(s.preheader)]));
    return {
      organization_id: orgId,
      name: s.name,
      channel: 'email',
      kind: s.kind,
      engine: 'blocks',
      subject: s.subject,
      preheader: s.preheader,
      description: s.description,
      body_html: '',
      blocks_json: doc,
      variables,
      is_active: true,
      version: 1,
      created_by: userId ?? null,
      metadata: { is_system: true, seed_key: s.key, usage_count: 0 },
    };
  });
  if (rows.length === 0) return 0;
  const { error } = await supabase.from('templates').insert(rows);
  if (error) throw new Error(`seedEmailTemplates: ${error.message}`);
  return rows.length;
}
