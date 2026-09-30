'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/utils/Utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('text-sm leading-relaxed', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        h1: ({ children }) => (
          <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold mt-2.5 mb-1 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-2 last:mb-0">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-2 space-y-0.5 ml-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm">{children}</li>
        ),
        // Un enlace del propio ERP se abre en la misma pestaña (el panel
        // sigue abierto); uno externo, en otra y sin `opener`.
        a: ({ href, children }) => {
          const interno = typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
          return (
            <a
              href={href}
              {...(interno ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              className="text-link underline underline-offset-2 hover:text-brand-action"
            >
              {children}
            </a>
          );
        },
        code: ({ className: codeClassName, children, ...props }) => {
          const isInline = !codeClassName;
          if (isInline) {
            return (
              <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            );
          }
          return (
            <code
              className={cn(
                'block bg-gray-900 dark:bg-gray-900 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2',
                codeClassName
              )}
              {...props}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-2">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-3 border-blue-400 pl-3 my-2 italic text-gray-600 dark:text-gray-400">
            {children}
          </blockquote>
        ),
        // Figma `AsistenteTablaRespuesta` (662:15900): tabla sobre Superficie
        // dentro de la burbuja, cabecera 12 semibold y celdas compactas. La
        // alineación (números a la derecha) la respeta desde el markdown.
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-[13px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-line">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-line">{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children, style }) => (
          <th style={style} className="px-3 py-2 text-left text-xs font-semibold text-fg-secondary">{children}</th>
        ),
        td: ({ children, style }) => (
          <td style={style} className="px-3 py-2 tabular-nums text-fg">{children}</td>
        ),
        hr: () => (
          <hr className="my-2 border-gray-200 dark:border-gray-700" />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
