'use client';

/**
 * Formulario de propiedades por tipo de bloque (panel derecho del editor).
 */

import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { VariablePicker } from '@/components/crm/email/VariablePicker';
import type { Block } from '@/lib/services/crm/email/blocks';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import { ALIGN_OPTIONS, ColorField, Field, NumberField, SelectField, SwitchField, TextAreaField, TextField } from './fields';

interface Props {
  block: Block;
  ctx: RenderContext | null;
  onChange: (props: Record<string, unknown>) => void;
}

const NETWORKS = ['website', 'instagram', 'facebook', 'linkedin', 'x', 'youtube', 'tiktok', 'whatsapp'] as const;

export function BlockPropsForm({ block, ctx, onChange }: Props) {
  // Acceso laxo a props: cada `case` conoce su tipo real (validado por zod al guardar).
  const p = block.props as unknown as Record<string, never>;
  const set = (k: string) => (v: unknown) => onChange({ [k]: v });

  switch (block.type) {
    case 'header':
      return (
        <>
          <TextField label="URL del logo" value={p.logo_url} onChange={set('logo_url')} hint="Admite {{org.logo_url}}" />
          <TextField label="Texto alternativo" value={p.alt} onChange={set('alt')} />
          <SelectField label="Alineación" value={p.align} onChange={set('align')} options={ALIGN_OPTIONS} />
          <NumberField label="Alto (px)" value={p.height} onChange={set('height')} min={20} max={160} />
        </>
      );
    case 'text':
      return (
        <>
          <Field label="Contenido">
            <RichTextEditor value={p.html} onChange={set('html')} minHeight={140} placeholder="Escribe el texto del correo…" />
          </Field>
          <VariablePicker values={ctx} withDefault onInsert={(expr) => onChange({ html: `${p.html ?? ''} ${expr}` })} />
          <SelectField label="Alineación" value={p.align} onChange={set('align')} options={ALIGN_OPTIONS} />
          <NumberField label="Tamaño de fuente" value={p.font_size} onChange={set('font_size')} min={10} max={32} />
          <ColorField label="Color del texto" value={p.color} onChange={set('color')} />
        </>
      );
    case 'button':
      return (
        <>
          <TextField label="Texto del botón" value={p.label} onChange={set('label')} />
          <TextField label="Enlace" value={p.href} onChange={set('href')} hint="https://… o una variable como {{quote.url}}" />
          <VariablePicker values={ctx} onInsert={(expr) => onChange({ href: expr })} />
          <SelectField label="Estilo" value={p.style} onChange={set('style')} options={[{ value: 'primary', label: 'Primario' }, { value: 'outline', label: 'Contorno' }, { value: 'link', label: 'Enlace' }]} />
          <SelectField label="Alineación" value={p.align} onChange={set('align')} options={ALIGN_OPTIONS} />
          <ColorField label="Color (opcional)" value={p.color ?? ''} onChange={(v) => onChange({ color: v || undefined })} />
        </>
      );
    case 'image':
      return (
        <>
          <TextField label="URL de la imagen" value={p.src} onChange={set('src')} placeholder="https://…" />
          <TextField label="Texto alternativo" value={p.alt} onChange={set('alt')} />
          <TextField label="Enlace al hacer clic (opcional)" value={p.href ?? ''} onChange={(v) => onChange({ href: v || undefined })} />
          <NumberField label="Ancho (px, opcional)" value={p.width ?? 0} onChange={(v) => onChange({ width: v > 0 ? v : undefined })} min={0} max={800} />
          <SelectField label="Alineación" value={p.align} onChange={set('align')} options={ALIGN_OPTIONS} />
        </>
      );
    case 'divider':
      return (
        <>
          <ColorField label="Color" value={p.color} onChange={set('color')} />
          <NumberField label="Grosor (px)" value={p.thickness} onChange={set('thickness')} min={1} max={8} />
        </>
      );
    case 'spacer':
      return <NumberField label="Alto (px)" value={p.height} onChange={set('height')} min={4} max={120} />;
    case 'columns': {
      const cols = p.columns as Array<{ title: string; html: string }>;
      const setCol = (i: number, patch: Partial<{ title: string; html: string }>) => onChange({ columns: cols.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
      return (
        <>
          {cols.map((c, i) => (
            <div key={i} className="space-y-2 rounded border border-gray-200 p-2 dark:border-gray-700">
              <TextField label={`Columna ${i + 1} · título`} value={c.title} onChange={(v) => setCol(i, { title: v })} />
              <TextAreaField label="Contenido (HTML simple)" value={c.html} onChange={(v) => setCol(i, { html: v })} rows={3} />
            </div>
          ))}
          <div className="flex gap-2">
            {cols.length < 3 && <Button type="button" size="sm" variant="outline" onClick={() => onChange({ columns: [...cols, { title: '', html: '' }] })}>Añadir columna</Button>}
            {cols.length > 2 && <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ columns: cols.slice(0, -1) })}>Quitar última</Button>}
          </div>
        </>
      );
    }
    case 'product_card':
      return (
        <>
          <TextField label="Nombre" value={p.name} onChange={set('name')} />
          <TextAreaField label="Descripción" value={p.description} onChange={set('description')} rows={3} />
          <TextField label="Precio" value={p.price} onChange={set('price')} hint="Ej. {{opportunity.amount|money}}" />
          <TextField label="Imagen (URL)" value={p.image_url} onChange={set('image_url')} />
          <TextField label="Enlace (opcional)" value={p.href ?? ''} onChange={(v) => onChange({ href: v || undefined })} />
          <TextField label="Texto del enlace" value={p.cta} onChange={set('cta')} />
        </>
      );
    case 'quote_summary':
      return (
        <>
          <TextField label="Título" value={p.title} onChange={set('title')} />
          <SwitchField label="Mostrar ítems" checked={p.show_items} onChange={set('show_items')} />
          <TextField label="Texto del botón" value={p.cta_label} onChange={set('cta_label')} />
          <TextField label="Enlace del botón" value={p.cta_href} onChange={set('cta_href')} />
        </>
      );
    case 'signature':
      return (
        <>
          <SelectField label="Origen" value={p.source} onChange={set('source')} options={[{ value: 'user_default', label: 'Firma del vendedor' }, { value: 'custom', label: 'Personalizada' }]} />
          {p.source === 'custom' && (
            <Field label="Firma personalizada">
              <RichTextEditor value={p.html} onChange={set('html')} minHeight={100} />
            </Field>
          )}
        </>
      );
    case 'social': {
      const links = p.links as Array<{ network: (typeof NETWORKS)[number]; href: string }>;
      const setLink = (i: number, patch: Partial<{ network: string; href: string }>) => onChange({ links: links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
      return (
        <>
          {links.map((l, i) => (
            <div key={i} className="space-y-2 rounded border border-gray-200 p-2 dark:border-gray-700">
              <SelectField label="Red" value={l.network} onChange={(v) => setLink(i, { network: v })} options={NETWORKS.map((n) => ({ value: n, label: n }))} />
              <TextField label="Enlace" value={l.href} onChange={(v) => setLink(i, { href: v })} />
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ links: links.filter((_, j) => j !== i) })}>Quitar</Button>
            </div>
          ))}
          {links.length < 8 && <Button type="button" size="sm" variant="outline" onClick={() => onChange({ links: [...links, { network: 'website', href: 'https://' }] })}>Añadir red</Button>}
          <SelectField label="Alineación" value={p.align} onChange={set('align')} options={ALIGN_OPTIONS} />
        </>
      );
    }
    case 'footer_legal':
      return (
        <>
          <TextField label="Empresa" value={p.company} onChange={set('company')} />
          <TextField label="Dirección" value={p.address} onChange={set('address')} />
          <TextAreaField label="Texto legal adicional" value={p.text} onChange={set('text')} rows={3} />
          <SwitchField label="Enlace de baja (marketing)" checked={p.unsubscribe} onChange={set('unsubscribe')} />
          {p.unsubscribe && <TextField label="Texto del enlace" value={p.unsubscribe_label} onChange={set('unsubscribe_label')} />}
        </>
      );
    case 'variable':
      return (
        <>
          <TextField label="Ruta" value={p.path} onChange={set('path')} hint="Ej. contact.first_name" />
          <VariablePicker values={ctx} onInsert={(expr) => onChange({ path: expr.replace(/^\{\{|\}\}$/g, '').split('|')[0] })} />
          <TextField label="Valor por defecto" value={p.fallback} onChange={set('fallback')} />
          <SelectField label="Filtro" value={p.filter} onChange={set('filter')} options={[{ value: '', label: 'Ninguno' }, { value: 'money', label: 'Moneda' }, { value: 'date', label: 'Fecha' }, { value: 'upper', label: 'Mayúsculas' }, { value: 'lower', label: 'Minúsculas' }]} />
        </>
      );
    default:
      return null;
  }
}
