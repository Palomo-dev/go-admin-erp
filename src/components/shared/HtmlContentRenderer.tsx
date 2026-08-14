'use client';

import React, { useMemo } from 'react';
import { cn } from '@/utils/Utils';

/**
 * Renderiza contenido HTML generado por <RichTextEditor /> respetando el formato
 * (negrilla, cursiva, subrayado, listas, alineación, párrafos).
 *
 * Es tolerante con texto plano: si el contenido no contiene etiquetas HTML,
 * se muestra como texto normal con preservación de saltos de línea.
 *
 * Seguridad: el contenido es producido por usuarios autenticados a través del
 * RichTextEditor (contentEditable + execCommand), que solo genera etiquetas
 * de formato benignas. Se filtran etiquetas/scripts peligrosos (script, iframe,
 * on* handlers, javascript: URLs) antes de inyectar el HTML.
 */

export interface HtmlContentRendererProps {
  /** Contenido HTML o texto plano a renderizar. */
  html: string | null | undefined;
  className?: string;
  /** Si es true, recorta el contenido a una sola línea (para vistas de lista). */
  singleLine?: boolean;
}

const DANGEROUS_TAG_RE = /<\s*(script|iframe|object|embed|link|style|meta|base|form|input|button|textarea|select|option)[\s\S]*?>/gi;
const DANGEROUS_ATTR_RE = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URL_RE = /(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

function sanitize(html: string): string {
  return html
    .replace(DANGEROUS_TAG_RE, '')
    .replace(DANGEROUS_ATTR_RE, '')
    .replace(JS_URL_RE, '$1="#"');
}

function hasHtmlTags(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

export function HtmlContentRenderer({ html, className, singleLine }: HtmlContentRendererProps) {
  const content = useMemo(() => {
    if (!html) return '';
    const trimmed = html.trim();
    if (!trimmed) return '';
    // Si es texto plano (sin etiquetas HTML), lo envolvemos preservando saltos de línea.
    if (!hasHtmlTags(trimmed)) {
      const escaped = trimmed
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return escaped.replace(/\n/g, '<br />');
    }
    return sanitize(trimmed);
  }, [html]);

  if (!content) return null;

  if (singleLine) {
    const plain = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return <span className={className}>{plain}</span>;
  }

  return (
    <div
      className={cn(
        'text-sm leading-relaxed text-gray-700 dark:text-gray-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400 [&_h1]:text-base [&_h1]:font-bold [&_h1]:my-2 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:my-1.5',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

export default HtmlContentRenderer;
