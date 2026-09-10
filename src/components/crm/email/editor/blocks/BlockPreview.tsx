'use client';

/**
 * Vista aproximada de cada bloque dentro del canvas (modo edición). La vista
 * definitiva la genera el servidor (/api/email/templates/preview).
 */

import { useEffect, useState } from 'react';
import type { Block, BlockSettings } from '@/lib/services/crm/email/blocks';
import { BLOCK_LABELS } from '@/lib/services/crm/email/blocks';
import { renderVariables, type RenderContext } from '@/lib/services/crm/email/variables';
import { previewTextFallback, sanitizePreviewHtml } from './previewSanitize';

interface Props {
  block: Block;
  settings: BlockSettings;
  ctx: RenderContext | null;
}

/**
 * Valor para un NODO DE TEXTO de JSX: React lo escapa al pintarlo, así que aquí
 * NO se escapa (si no, el usuario vería `&amp;` en la vista previa).
 */
function v(text: string, ctx: RenderContext | null): string {
  if (!ctx) return text;
  return renderVariables(text, ctx, { escapeHtml: false }).out || text;
}

/**
 * Valor para `dangerouslySetInnerHTML`. Tester r2 (fallo nuevo #2, ALTO): aquí
 * se inyectaba `blocks_json` crudo en el DOM de la app (fuera del
 * `iframe sandbox=""`), así que un miembro de la org podía ejecutar código con
 * la sesión de quien abriera la plantilla.
 *   1. las variables se escapan (`escapeHtml: true`): `contact.*`, `org.name` y
 *      los datos de correos entrantes ya no entran como marcado;
 *   2. el resultado pasa por la allow-list de `sanitizePreviewHtml`.
 */
function vHtml(html: string, ctx: RenderContext | null, hydrated: boolean): string {
  const interpolated = ctx ? renderVariables(html, ctx, { escapeHtml: true }).out : html;
  // Antes de hidratar se pinta lo MISMO que el servidor (`sanitizePreviewHtml`
  // sin `DOMParser` degrada a texto): si no, React encuentra dos árboles
  // distintos en el mismo punto de inserción y vuelve a pintar el subárbol
  // avisando de *hydration mismatch* (tester r3, riesgo #2).
  return hydrated ? sanitizePreviewHtml(interpolated) : previewTextFallback(interpolated);
}

/** `false` en el servidor y en la primera pasada de cliente; `true` tras montar. */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function BlockPreview({ block, settings, ctx }: Props) {
  const hydrated = useHydrated();
  const brand = settings.brand.primary_color;
  const p = block.props as Record<string, unknown>;
  switch (block.type) {
    case 'header': {
      const logo = v(String(p.logo_url ?? ''), ctx);
      const isUrl = /^https?:\/\//.test(logo);
      return (
        <div className="py-2" style={{ textAlign: (p.align as 'left' | 'center' | 'right') ?? 'left' }}>
          {isUrl ? <img src={logo} alt={v(String(p.alt ?? ''), ctx)} style={{ height: Number(p.height ?? 40) }} className="inline-block" /> : <span className="text-lg font-bold" style={{ color: brand }}>{v(String(p.alt ?? '{{org.name}}'), ctx)}</span>}
        </div>
      );
    }
    case 'text':
      return <div className="prose prose-sm max-w-none text-gray-800 dark:prose-invert dark:text-gray-100" style={{ textAlign: (p.align as 'left') ?? 'left', fontSize: Number(p.font_size ?? 15) }} dangerouslySetInnerHTML={{ __html: vHtml(String(p.html ?? ''), ctx, hydrated) }} />;
    case 'button': {
      const style = String(p.style ?? 'primary');
      const color = (p.color as string) || brand;
      const cls = style === 'primary' ? 'text-white' : style === 'outline' ? 'bg-white' : 'underline';
      return (
        <div className="py-2" style={{ textAlign: (p.align as 'center') ?? 'center' }}>
          <span className={`inline-block rounded-md px-5 py-2 text-sm font-semibold ${cls}`} style={{ background: style === 'primary' ? color : 'transparent', border: style === 'link' ? 0 : `1px solid ${color}`, color: style === 'primary' ? '#fff' : color }}>
            {v(String(p.label ?? 'Botón'), ctx)}
          </span>
        </div>
      );
    }
    case 'image': {
      const raw = v(String(p.src ?? ''), ctx);
      const src = /^(https?:|data:image\/|cid:)/i.test(raw.trim()) ? raw : '';
      return src ? <div className="py-2" style={{ textAlign: (p.align as 'center') ?? 'center' }}><img src={src} alt={String(p.alt ?? '')} style={{ maxWidth: '100%', width: p.width ? Number(p.width) : undefined }} className="inline-block rounded" /></div> : <div className="rounded border border-dashed border-gray-300 py-6 text-center text-xs text-gray-400 dark:border-gray-600">Imagen (sin URL)</div>;
    }
    case 'divider':
      return <hr className="my-3" style={{ borderTop: `${Number(p.thickness ?? 1)}px solid ${String(p.color ?? '#e5e7eb')}` }} />;
    case 'spacer':
      return <div style={{ height: Number(p.height ?? 16) }} className="rounded bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]" aria-label={`Espacio ${p.height}px`} />;
    case 'columns': {
      const cols = (p.columns as Array<{ title: string; html: string }>) ?? [];
      return (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols.length || 2}, minmax(0, 1fr))` }}>
          {cols.map((c, i) => (
            <div key={i} className="text-sm text-gray-800 dark:text-gray-100">
              {c.title && <p className="mb-1 font-semibold">{v(c.title, ctx)}</p>}
              <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: vHtml(c.html, ctx, hydrated) }} />
            </div>
          ))}
        </div>
      );
    }
    case 'product_card':
      return (
        <div className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          {p.image_url && /^(https?:|data:image\/|cid:)/i.test(v(String(p.image_url), ctx).trim()) ? <img src={v(String(p.image_url), ctx)} alt="" className="h-20 w-20 rounded object-cover" /> : null}
          <div className="text-sm text-gray-800 dark:text-gray-100">
            <p className="font-bold">{v(String(p.name ?? ''), ctx)}</p>
            {p.description ? <p className="text-gray-600 dark:text-gray-300">{v(String(p.description), ctx)}</p> : null}
            <p className="font-bold" style={{ color: brand }}>{v(String(p.price ?? ''), ctx)}</p>
          </div>
        </div>
      );
    case 'quote_summary':
      return (
        <div className="rounded-lg border border-gray-200 text-sm dark:border-gray-700">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold dark:border-gray-700 dark:bg-gray-800">{v(String(p.title ?? ''), ctx)}</div>
          {(ctx?.quote?.items ?? []).map((it, i) => (
            <div key={i} className="flex justify-between px-3 py-1 text-gray-700 dark:text-gray-200"><span>{it.description} × {it.qty}</span><span>{it.total_line.toLocaleString('es-CO')}</span></div>
          ))}
          <div className="flex justify-between px-3 py-2 font-bold"><span>Total</span><span style={{ color: brand }}>{ctx?.quote?.total?.toLocaleString('es-CO') ?? '—'}</span></div>
          {p.cta_label ? <div className="pb-3 text-center"><span className="inline-block rounded-md px-4 py-1.5 text-xs font-semibold text-white" style={{ background: brand }}>{v(String(p.cta_label), ctx)}</span></div> : null}
        </div>
      );
    case 'signature': {
      const custom = String(p.source) === 'custom' && String(p.html ?? '').trim();
      if (custom) return <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: vHtml(String(p.html), ctx, hydrated) }} />;
      const u = ctx?.user;
      return <p className="text-sm text-gray-700 dark:text-gray-200"><strong>{u?.full_name ?? '{{user.full_name}}'}</strong><br />{u?.job_title ?? '{{user.job_title}}'}<br />{ctx?.org.name ?? '{{org.name}}'} · {u?.phone ?? '{{user.phone}}'}</p>;
    }
    case 'social': {
      const links = (p.links as Array<{ network: string }>) ?? [];
      return <div className="flex flex-wrap gap-2 py-1 text-xs" style={{ justifyContent: p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center' }}>{links.length ? links.map((l, i) => <span key={i} className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-700" style={{ color: brand }}>{l.network}</span>) : <span className="text-gray-400">Sin redes configuradas</span>}</div>;
    }
    case 'footer_legal':
      return (
        <p className="border-t border-gray-200 pt-3 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {v(String(p.company ?? ''), ctx)} · {v(String(p.address ?? ''), ctx)}
          {p.text ? <><br />{v(String(p.text), ctx)}</> : null}
          {p.unsubscribe ? <><br /><span className="underline">{String(p.unsubscribe_label ?? 'Darse de baja')}</span></> : null}
        </p>
      );
    case 'variable': {
      const expr = `{{${p.path}${p.filter ? '|' + p.filter : ''}${p.fallback ? '|' + p.fallback : ''}}}`;
      return <span className="inline-block rounded bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">{ctx ? v(expr, ctx) : expr}</span>;
    }
    default:
      return <div className="text-xs text-gray-400">{BLOCK_LABELS[(block as Block).type]}</div>;
  }
}

export function blockSummary(block: Block): string {
  const p = block.props as Record<string, unknown>;
  if (block.type === 'text') return stripTags(String(p.html ?? '')).slice(0, 60);
  if (block.type === 'button') return String(p.label ?? '');
  if (block.type === 'variable') return String(p.path ?? '');
  return '';
}
