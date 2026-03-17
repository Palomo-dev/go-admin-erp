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
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 underline"
          >
            {children}
          </a>
        ),
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
                'block bg-gray-900 dark:bg-gray-950 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2',
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
        table: ({ children }) => (
          <div className="overflow-x-auto my-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-100 dark:bg-gray-800">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-300">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400">{children}</td>
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
