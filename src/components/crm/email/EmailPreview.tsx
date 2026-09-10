'use client';

/**
 * Vista previa del correo renderizado por el servidor: iframe con
 * `sandbox` (sin scripts) y `srcDoc`, toggle escritorio (600px) / móvil
 * (375px), pestaña de texto plano y aviso de variables faltantes.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, Monitor, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/Utils';

export interface EmailPreviewData {
  html: string;
  text: string;
  subject: string;
  preheader: string;
  missing: string[];
}

interface Props {
  data: EmailPreviewData | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
  /** Alto del iframe (clase Tailwind). */
  heightClassName?: string;
}

export function EmailPreview({ data, loading, error, className, heightClassName = 'h-[60vh]' }: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const width = device === 'mobile' ? 375 : 640;

  return (
    <div className={cn('flex flex-col gap-2', className)} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{data?.subject || <span className="text-gray-400">Sin asunto</span>}</p>
          {data?.preheader ? <p className="truncate text-xs text-gray-500 dark:text-gray-400">{data.preheader}</p> : null}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Dispositivo de vista previa">
          <Button type="button" size="sm" variant={device === 'desktop' ? 'default' : 'ghost'} className="h-7 px-2" onClick={() => setDevice('desktop')} aria-pressed={device === 'desktop'} aria-label="Escritorio">
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant={device === 'mobile' ? 'default' : 'ghost'} className="h-7 px-2" onClick={() => setDevice('mobile')} aria-pressed={device === 'mobile'} aria-label="Móvil">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {loading ? <Loader2 className="ml-1 h-4 w-4 animate-spin text-gray-400" aria-label="Actualizando vista previa" /> : null}
        </div>
      </div>

      {data && data.missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200" role="status">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Variables sin valor:</span>
          {data.missing.map((m) => <Badge key={m} variant="outline" className="font-mono text-[10px]">{m}</Badge>)}
        </div>
      )}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">{error}</p> : null}

      <Tabs defaultValue="html" className="flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="html">HTML</TabsTrigger>
          <TabsTrigger value="text">Texto plano</TabsTrigger>
        </TabsList>
        <TabsContent value="html" className="mt-2">
          <div className="flex justify-center rounded-md border border-gray-200 bg-gray-100 p-3 dark:border-gray-700 dark:bg-gray-900">
            {data ? (
              <iframe
                title="Vista previa del correo"
                sandbox=""
                srcDoc={data.html}
                style={{ width, maxWidth: '100%' }}
                className={cn('rounded bg-white shadow-sm transition-[width] duration-200', heightClassName)}
              />
            ) : (
              <div className={cn('flex w-full items-center justify-center text-sm text-gray-400', heightClassName)}>
                {loading ? 'Generando vista previa…' : 'La vista previa aparecerá aquí.'}
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="text" className="mt-2">
          <pre className={cn('overflow-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100', heightClassName)}>
            {data?.text || 'Sin contenido'}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
