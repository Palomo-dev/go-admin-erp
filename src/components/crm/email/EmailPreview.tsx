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
import { interpolateAutomationText, type AutomationText } from '@/lib/services/crm/automation/automationText';

export interface EmailPreviewData {
  html: string;
  text: string;
  subject: string;
  preheader: string;
  missing: string[];
}

interface Props {
  text?: AutomationText;
  data: EmailPreviewData | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
  /** Alto del iframe (clase Tailwind). */
  heightClassName?: string;
}

export function EmailPreview({ data, loading, error, className, heightClassName = 'h-[60vh]', text = (source, values) => interpolateAutomationText(source ?? '', values) }: Props) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const width = device === 'mobile' ? 375 : 640;

  return (
    <div className={cn('flex flex-col gap-2', className)} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2  ">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{data?.subject || <span className="text-fg-muted">{text('Sin asunto')}</span>}</p>
          {data?.preheader ? <p className="truncate text-xs text-fg-secondary ">{data.preheader}</p> : null}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={text("Dispositivo de vista previa")}>
          <Button type="button" size="sm" variant={device === 'desktop' ? 'default' : 'ghost'} className="h-7 px-2" onClick={() => setDevice('desktop')} aria-pressed={device === 'desktop'} aria-label={text("Escritorio")}>
            <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button type="button" size="sm" variant={device === 'mobile' ? 'default' : 'ghost'} className="h-7 px-2" onClick={() => setDevice('mobile')} aria-pressed={device === 'mobile'} aria-label={text("Móvil")}>
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {loading ? <Loader2 className="ml-1 h-4 w-4 animate-spin text-fg-secondary" aria-label={text("Actualizando vista previa")} /> : null}
        </div>
      </div>

      {data && data.missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200" role="status">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          <span> {text("Variables sin valor:")} </span>
          {data.missing.map((m) => <Badge key={m} variant="outline" className="font-mono text-[10px]">{m}</Badge>)}
        </div>
      )}
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-danger-text dark:border-red-800 dark:bg-red-900/20 dark:text-danger-text" role="alert">{error}</p> : null}

      <Tabs defaultValue="html" className="flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="html"> {text("HTML")} </TabsTrigger>
          <TabsTrigger value="text"> {text("Texto plano")} </TabsTrigger>
        </TabsList>
        <TabsContent value="html" className="mt-2">
          <div className="flex justify-center rounded-md border border-line bg-surface p-3  ">
            {data ? (
              <iframe
                title={text("Vista previa del correo")}
                sandbox=""
                srcDoc={data.html}
                style={{ width, maxWidth: '100%' }}
                className={cn('rounded bg-surface shadow-sm transition-[width] duration-200', heightClassName)}
              />
            ) : (
              <div className={cn('flex w-full items-center justify-center text-sm text-fg-secondary', heightClassName)}>
                {loading ? text("Generando vista previa…") : text("La vista previa aparecerá aquí.")}
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="text" className="mt-2">
          <pre className={cn('overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-3 font-mono text-xs text-fg   ', heightClassName)}>
            {data?.text || text("Sin contenido")}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
