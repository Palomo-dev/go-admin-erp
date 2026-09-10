/**
 * Documento de bloques de email (FASE-07 §3.2). Compartido server/cliente.
 *
 * document = { version, settings{width,bg,font,brand{logo_url,primary_color}}, blocks[] }
 * Tipos: header, text, button, image, divider, spacer, columns, product_card,
 * quote_summary, signature, social, footer_legal, variable.
 */

import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Color hex inválido');
const align = z.enum(['left', 'center', 'right']);

/**
 * `settings.font` acaba dentro de `style="font-family:…"` en el HTML del correo
 * (renderBlocks.ts y render.ts). Antes era `z.string()` libre y permitía cerrar
 * el atributo e inyectar un manejador de eventos (tester r1 #2, ALTO).
 * Allow-list: letras (con acentos), dígitos, espacio, coma, guion, punto y
 * comilla simple — nunca `"`, `;`, `<`, `>`, `(`, `)`, `:`, `/`, `\`, `{`, `}`.
 */
export const FONT_STACK_RE = /^[A-Za-z0-9À-ɏ .,'-]{1,120}$/;
export const DEFAULT_FONT = 'Inter, Arial, sans-serif';
/** Un valor fuera de la allow-list se normaliza al stack por defecto (no rompe documentos ya guardados). */
const fontStack = z.string().max(120).regex(FONT_STACK_RE, 'Fuente no válida').default(DEFAULT_FONT).catch(DEFAULT_FONT);
const href = z
  .string()
  .max(2048)
  .refine((v) => /^(https?:|mailto:|tel:|\{\{)/i.test(v.trim()) || v.trim() === '', 'Enlace no permitido');

export const BlockSettingsSchema = z.object({
  width: z.number().int().min(320).max(800).default(600),
  bg: hex.default('#f4f5f7'),
  font: fontStack,
  brand: z
    .object({
      logo_url: z.string().max(2048).default(''),
      primary_color: hex.default('#2563eb'),
    })
    .default({ logo_url: '', primary_color: '#2563eb' }),
});

const base = { id: z.string().min(1).max(40) };

export const HeaderBlock = z.object({ ...base, type: z.literal('header'), props: z.object({
  logo_url: z.string().max(2048).default('{{org.logo_url}}'),
  alt: z.string().max(200).default('{{org.name}}'),
  align: align.default('left'),
  height: z.number().int().min(20).max(160).default(40),
  bg: hex.optional(),
}).default({}) });

export const TextBlock = z.object({ ...base, type: z.literal('text'), props: z.object({
  html: z.string().max(20000).default('<p>Escribe aquí tu texto</p>'),
  align: align.default('left'),
  font_size: z.number().int().min(10).max(32).default(15),
  color: hex.default('#1f2937'),
}).default({}) });

export const ButtonBlock = z.object({ ...base, type: z.literal('button'), props: z.object({
  label: z.string().max(80).default('Ver más'),
  href: href.default('https://'),
  style: z.enum(['primary', 'outline', 'link']).default('primary'),
  align: align.default('center'),
  color: hex.optional(),
}).default({}) });

export const ImageBlock = z.object({ ...base, type: z.literal('image'), props: z.object({
  src: z.string().max(2048).default(''),
  alt: z.string().max(200).default(''),
  href: href.optional(),
  width: z.number().int().min(40).max(800).optional(),
  align: align.default('center'),
}).default({}) });

export const DividerBlock = z.object({ ...base, type: z.literal('divider'), props: z.object({
  color: hex.default('#e5e7eb'),
  thickness: z.number().int().min(1).max(8).default(1),
}).default({}) });

export const SpacerBlock = z.object({ ...base, type: z.literal('spacer'), props: z.object({
  height: z.number().int().min(4).max(120).default(16),
}).default({}) });

export const ColumnsBlock = z.object({ ...base, type: z.literal('columns'), props: z.object({
  columns: z.array(z.object({
    title: z.string().max(120).default(''),
    html: z.string().max(10000).default(''),
  })).min(2).max(3).default([{ title: '', html: '' }, { title: '', html: '' }]),
}).default({}) });

export const ProductCardBlock = z.object({ ...base, type: z.literal('product_card'), props: z.object({
  name: z.string().max(200).default('{{opportunity.name}}'),
  description: z.string().max(2000).default(''),
  price: z.string().max(60).default('{{opportunity.amount|money}}'),
  image_url: z.string().max(2048).default(''),
  href: href.optional(),
  cta: z.string().max(60).default('Ver detalle'),
}).default({}) });

export const QuoteSummaryBlock = z.object({ ...base, type: z.literal('quote_summary'), props: z.object({
  title: z.string().max(120).default('Cotización {{quote.number}}'),
  show_items: z.boolean().default(true),
  cta_label: z.string().max(60).default('Ver propuesta'),
  cta_href: href.default('{{quote.url}}'),
}).default({}) });

export const SignatureBlock = z.object({ ...base, type: z.literal('signature'), props: z.object({
  source: z.enum(['user_default', 'custom']).default('user_default'),
  html: z.string().max(10000).default(''),
}).default({}) });

export const SocialBlock = z.object({ ...base, type: z.literal('social'), props: z.object({
  links: z.array(z.object({
    network: z.enum(['website', 'instagram', 'facebook', 'linkedin', 'x', 'youtube', 'tiktok', 'whatsapp']),
    href: href,
  })).max(8).default([]),
  align: align.default('center'),
}).default({}) });

export const FooterLegalBlock = z.object({ ...base, type: z.literal('footer_legal'), props: z.object({
  company: z.string().max(200).default('{{org.name}}'),
  address: z.string().max(400).default('{{org.address}}'),
  text: z.string().max(1000).default(''),
  unsubscribe: z.boolean().default(false),
  unsubscribe_label: z.string().max(80).default('Darse de baja'),
}).default({}) });

export const VariableBlock = z.object({ ...base, type: z.literal('variable'), props: z.object({
  path: z.string().max(80).default('contact.first_name'),
  fallback: z.string().max(120).default(''),
  filter: z.enum(['', 'money', 'date', 'upper', 'lower']).default(''),
}).default({}) });

export const BlockSchema = z.discriminatedUnion('type', [
  HeaderBlock, TextBlock, ButtonBlock, ImageBlock, DividerBlock, SpacerBlock, ColumnsBlock,
  ProductCardBlock, QuoteSummaryBlock, SignatureBlock, SocialBlock, FooterLegalBlock, VariableBlock,
]);

export const BlockDocumentSchema = z.object({
  version: z.literal(1).default(1),
  settings: BlockSettingsSchema.default({}),
  blocks: z.array(BlockSchema).max(60).default([]),
});

export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block['type'];
export type BlockSettings = z.infer<typeof BlockSettingsSchema>;
export type BlockDocument = z.infer<typeof BlockDocumentSchema>;
export type BlockInput = z.input<typeof BlockSchema>;
export type BlockDocumentInput = z.input<typeof BlockDocumentSchema>;

export const BLOCK_TYPES: BlockType[] = [
  'header', 'text', 'button', 'image', 'divider', 'spacer', 'columns',
  'product_card', 'quote_summary', 'signature', 'social', 'footer_legal', 'variable',
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  header: 'Encabezado',
  text: 'Texto',
  button: 'Botón',
  image: 'Imagen',
  divider: 'Divisor',
  spacer: 'Espacio',
  columns: 'Columnas',
  product_card: 'Producto',
  quote_summary: 'Cotización',
  signature: 'Firma',
  social: 'Redes',
  footer_legal: 'Pie legal',
  variable: 'Variable',
};

let counter = 0;
export function newBlockId(type: BlockType): string {
  counter = (counter + 1) % 100000;
  return `${type}_${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Bloque con props por defecto (según el schema). */
export function createBlock(type: BlockType): Block {
  return BlockSchema.parse({ id: newBlockId(type), type, props: {} });
}

export function emptyDocument(): BlockDocument {
  return BlockDocumentSchema.parse({ version: 1, settings: {}, blocks: [] });
}

/** Valida y normaliza; lanza ZodError si es inválido. */
export function parseBlockDocument(input: unknown): BlockDocument {
  return BlockDocumentSchema.parse(input);
}

export function safeParseBlockDocument(input: unknown): { ok: true; doc: BlockDocument } | { ok: false; error: string } {
  const r = BlockDocumentSchema.safeParse(input);
  if (r.success) return { ok: true, doc: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
