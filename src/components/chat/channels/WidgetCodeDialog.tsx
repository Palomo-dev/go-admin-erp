'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Check, Code, Key, FileCode, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatChannel } from '@/lib/services/chatChannelsService';
import { codigoDelWidget } from '@/lib/chat/codigoWidget';

interface WidgetCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChatChannel | null;
}

const PASOS = ['paso1', 'paso2', 'paso3', 'paso4', 'paso5'] as const;

export default function WidgetCodeDialog({
  open,
  onOpenChange,
  channel
}: WidgetCodeDialogProps) {
  const t = useTranslations('chatDialogos.codigoWidget');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  if (!channel) return null;

  // Un solo generador (src/lib/chat/codigoWidget.ts): funciona pegado en cualquier página.
  const widgetCode = codigoDelWidget(channel.public_key);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(widgetCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (error) {
      console.error('Error copiando código:', error);
    }
  };

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(channel.public_key || '');
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch (error) {
      console.error('Error copiando clave:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b border-line">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <span aria-hidden="true" className="rounded-lg bg-brand-tint p-2">
              <Code className="h-5 w-5 text-brand" />
            </span>
            {t('titulo')}
          </DialogTitle>
          <DialogDescription className="text-base mt-2">{t('descripcion')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <Tabs defaultValue="code" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="code" className="gap-2">
                <FileCode aria-hidden="true" className="h-4 w-4" />
                {t('pestanaCodigo')}
              </TabsTrigger>
              <TabsTrigger value="instructions" className="gap-2">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                {t('pestanaPasos')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-fg">{t('codigo')}</p>
                  <Button size="sm" variant="outline" className="gap-2" onClick={handleCopyCode}>
                    {copiedCode ? <Check aria-hidden="true" className="h-4 w-4 text-success-text" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                    {copiedCode ? t('copiado') : t('copiarCodigo')}
                  </Button>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-line">
                  <pre className="max-h-48 overflow-x-auto bg-subtle p-4 font-mono text-sm text-fg">
                    <code className="language-html whitespace-pre">{widgetCode}</code>
                  </pre>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-brand-tint p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key aria-hidden="true" className="h-4 w-4 text-brand" />
                    <span className="text-sm font-medium text-brand-deep">{t('clave')}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-brand" onClick={handleCopyKey}>
                    {copiedKey ? <Check aria-hidden="true" className="mr-1 h-3 w-3" /> : <Copy aria-hidden="true" className="mr-1 h-3 w-3" />}
                    {copiedKey ? t('copiadoCorto') : t('copiar')}
                  </Button>
                </div>
                <code className="block rounded border border-line bg-surface px-3 py-2 font-mono text-sm text-fg">
                  {channel.public_key}
                </code>
              </div>
            </TabsContent>

            <TabsContent value="instructions" className="space-y-4">
              <ol className="space-y-3">
                {PASOS.map((paso, i) => (
                  <li key={paso} className="flex items-start gap-3 rounded-lg bg-subtle p-3">
                    <span aria-hidden="true" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-action text-sm font-semibold text-fg-on-brand">
                      {i + 1}
                    </span>
                    <p className="pt-1 text-sm text-fg-secondary">{t(paso, { etiqueta: '</body>' })}</p>
                  </li>
                ))}
              </ol>

              <div className="rounded-lg border border-line bg-warning-subtle p-4">
                <p className="text-sm text-warning-text">
                  <strong>{t('notaTitulo')}</strong> {t('nota')}
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="pt-4 border-t border-line flex-row gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            {t('cerrar')}
          </Button>
          <Button className="flex-1 sm:flex-none gap-2" onClick={handleCopyCode}>
            {copiedCode ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            {copiedCode ? t('copiado') : t('copiarCodigo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
